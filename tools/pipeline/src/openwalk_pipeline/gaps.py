"""Finding breaks in a site's walkway network.

A routing graph can be in one piece and still send people a long way round: two paths
that meet on the ground may not meet in the data. This module looks for the two ways
that happens and measures what each costs:

- a dead end that stops a few meters short of another walkway, and
- two walkways that cross without sharing a point (which is right for a bridge, and
  a mistake almost everywhere else).

For each one it works out how far a person is routed today to get from one side to the
other. A spot where that walk is long and the gap is short is very likely a missing
join; the list is sorted with the longest detours first so the ones that distort
routes most are looked at first. Nothing is changed: the list is for a person who
knows the place to confirm, and each entry carries the line that would close it.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from typing import Any, Literal

from shapely import STRtree
from shapely.geometry import LineString, Point

JsonObject = dict[str, Any]
XY = tuple[float, float]
LonLat = tuple[float, float]
GapKind = Literal["dead_end", "crossing"]

METERS_PER_DEGREE = 111_320.0

# A dead end is reported when it stops within this distance of another walkway.
DEFAULT_MAX_GAP_M = 10.0
# A spot is only reported when today's walk between its two sides is at least this
# long: shorter ones do not change any route enough to matter.
DEFAULT_MIN_DETOUR_M = 30.0
# Reports closer together than this are one spot seen twice; the worst is kept.
MERGE_M = 4.0


@dataclass(frozen=True)
class Gap:
    """One suspected missing join."""

    kind: GapKind
    #: The two points a joining line would run between: for a dead end, its tip and
    #: the nearest point on the other walkway; for a crossing, the crossing point twice.
    start: LonLat
    end: LonLat
    #: Straight-line distance between them, in meters.
    gap_m: float
    #: Today's walking distance between the two sides, in meters; infinite when one
    #: cannot be reached from the other at all.
    detour_m: float
    #: The kinds of the two walkways involved, such as ("walkway", "road").
    kinds: tuple[str, str]

    @property
    def saved_m(self) -> float:
        """How much shorter the walk between the two sides would be once joined."""
        return self.detour_m - self.gap_m


class _Network:
    """The graph on a flat plane in meters, without the connectors to places."""

    def __init__(self, document: JsonObject) -> None:
        nodes: list[list[float]] = document["nodes"]
        self.lon0 = sum(n[0] for n in nodes) / len(nodes)
        self.lat0 = sum(n[1] for n in nodes) / len(nodes)
        self.east = METERS_PER_DEGREE * math.cos(math.radians(self.lat0))
        self.xy: list[XY] = [self.to_plane(n[0], n[1]) for n in nodes]
        self.edges: list[tuple[int, int, float, str]] = [
            (int(a), int(b), float(length), str(kind))
            for a, b, length, kind in document["edges"]
            if kind != "connector"
        ]
        self.neighbors: dict[int, list[tuple[int, float]]] = {}
        for a, b, length, _ in self.edges:
            self.neighbors.setdefault(a, []).append((b, length))
            self.neighbors.setdefault(b, []).append((a, length))
        self.segments = [LineString([self.xy[a], self.xy[b]]) for a, b, _, _ in self.edges]
        self.tree = STRtree(self.segments)
        self._distances: dict[int, dict[int, float]] = {}

    def to_plane(self, lon: float, lat: float) -> XY:
        return ((lon - self.lon0) * self.east, (lat - self.lat0) * METERS_PER_DEGREE)

    def to_lonlat(self, xy: XY) -> LonLat:
        return (round(self.lon0 + xy[0] / self.east, 7), round(self.lat0 + xy[1] / METERS_PER_DEGREE, 7))

    def distances_from(self, source: int) -> dict[int, float]:
        """Walking distance from one node to every node it can reach (Dijkstra)."""
        known = self._distances.get(source)
        if known is not None:
            return known
        best: dict[int, float] = {source: 0.0}
        queue: list[tuple[float, int]] = [(0.0, source)]
        while queue:
            distance, node = heapq.heappop(queue)
            if distance > best.get(node, math.inf):
                continue
            for other, length in self.neighbors.get(node, []):
                candidate = distance + length
                if candidate < best.get(other, math.inf):
                    best[other] = candidate
                    heapq.heappush(queue, (candidate, other))
        self._distances[source] = best
        return best

    def walk_to_point(self, source: int, edge: int, at: XY) -> float:
        """Walking distance from a node to a point part-way along an edge."""
        a, b, _, _ = self.edges[edge]
        reach = self.distances_from(source)
        via_a = reach.get(a, math.inf) + math.dist(self.xy[a], at)
        via_b = reach.get(b, math.inf) + math.dist(self.xy[b], at)
        return min(via_a, via_b)


def _dead_ends(network: _Network, max_gap_m: float, min_detour_m: float) -> list[Gap]:
    found: list[Gap] = []
    for node, neighbors in network.neighbors.items():
        if len(neighbors) != 1:
            continue
        tip = Point(network.xy[node])
        best: tuple[float, int, XY] | None = None
        for index in network.tree.query(tip.buffer(max_gap_m)):
            a, b, _, _ = network.edges[int(index)]
            if node in (a, b):
                continue
            segment = network.segments[int(index)]
            distance = segment.distance(tip)
            if distance <= max_gap_m and (best is None or distance < best[0]):
                closest = segment.interpolate(segment.project(tip))
                best = (distance, int(index), (closest.x, closest.y))
        if best is None:
            continue
        gap_m, edge, at = best
        detour = network.walk_to_point(node, edge, at)
        if detour - gap_m < min_detour_m:
            continue
        own_kind = next(kind for a, b, _, kind in network.edges if node in (a, b))
        found.append(
            Gap(
                kind="dead_end",
                start=network.to_lonlat(network.xy[node]),
                end=network.to_lonlat(at),
                gap_m=round(gap_m, 1),
                detour_m=round(detour, 1),
                kinds=(own_kind, network.edges[edge][3]),
            )
        )
    return found


def _crossings(network: _Network, min_detour_m: float) -> list[Gap]:
    found: list[Gap] = []
    for first, segment in enumerate(network.segments):
        a, b, _, first_kind = network.edges[first]
        for index in network.tree.query(segment, predicate="crosses"):
            second = int(index)
            if second <= first:
                continue
            c, d, _, second_kind = network.edges[second]
            # Lines drawn across the inside of one open area cross each other by design.
            if first_kind == "area" and second_kind == "area":
                continue
            if len({a, b, c, d}) < 4:
                continue
            crossing = segment.intersection(network.segments[second])
            if not isinstance(crossing, Point):
                continue
            at: XY = (crossing.x, crossing.y)
            # From the crossing, out along the first walkway to either of its ends,
            # then by today's network to the crossing point on the second walkway.
            detour = min(
                math.dist(at, network.xy[a]) + network.walk_to_point(a, second, at),
                math.dist(at, network.xy[b]) + network.walk_to_point(b, second, at),
            )
            if detour < min_detour_m:
                continue
            where = network.to_lonlat(at)
            found.append(
                Gap(
                    kind="crossing",
                    start=where,
                    end=where,
                    gap_m=0.0,
                    detour_m=round(detour, 1),
                    kinds=(first_kind, second_kind),
                )
            )
    return found


def _merged(gaps: list[Gap], network: _Network) -> list[Gap]:
    """Drop reports of a spot already reported with a longer detour."""
    kept: list[Gap] = []
    spots: list[XY] = []
    for gap in sorted(gaps, key=lambda g: (-g.detour_m, g.start)):
        # The middle of the joining line, so two dead ends that face each other
        # across one gap count as the one spot they are.
        (ax, ay), (bx, by) = network.to_plane(*gap.start), network.to_plane(*gap.end)
        spot = ((ax + bx) / 2, (ay + by) / 2)
        if any(math.dist(spot, other) < MERGE_M for other in spots):
            continue
        kept.append(gap)
        spots.append(spot)
    return kept


def find_gaps(
    document: JsonObject,
    max_gap_m: float = DEFAULT_MAX_GAP_M,
    min_detour_m: float = DEFAULT_MIN_DETOUR_M,
) -> list[Gap]:
    """Suspected missing joins in a graph document, longest detour first."""
    if not document.get("nodes"):
        return []
    network = _Network(document)
    gaps = _dead_ends(network, max_gap_m, min_detour_m) + _crossings(network, min_detour_m)
    return _merged(gaps, network)


def as_geojson(gaps: list[Gap]) -> JsonObject:
    """The gaps as a GeoJSON collection, numbered in the order given."""
    features: list[JsonObject] = []
    for number, gap in enumerate(gaps, start=1):
        geometry: JsonObject
        if gap.kind == "crossing":
            geometry = {"type": "Point", "coordinates": list(gap.start)}
        else:
            geometry = {"type": "LineString", "coordinates": [list(gap.start), list(gap.end)]}
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "number": number,
                    "kind": gap.kind,
                    "kinds": list(gap.kinds),
                    "gap_m": gap.gap_m,
                    "detour_m": None if math.isinf(gap.detour_m) else gap.detour_m,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


# How each kind of graph edge is named to a person.
KIND_NAMES = {
    "walkway": "walkway",
    "steps": "steps",
    "area": "open area",
    "aisle": "parking aisle",
    "road": "road",
}


def describe(number: int, gap: Gap) -> str:
    """One line for a person reading the list."""
    walk = "no way round at all" if math.isinf(gap.detour_m) else f"{gap.detour_m:.0f} m round today"
    first, second = (KIND_NAMES.get(kind, kind) for kind in gap.kinds)
    if gap.kind == "crossing":
        return f"{number:3d}. {first} and {second} cross without joining at {list(gap.start)}: {walk}"
    return (
        f"{number:3d}. {first} ends {gap.gap_m:.1f} m from a {second},"
        f" {list(gap.start)} to {list(gap.end)}: {walk}"
    )
