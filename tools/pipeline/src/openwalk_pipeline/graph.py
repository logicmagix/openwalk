"""Building the pedestrian routing graph from walkways and places.

Every walkway vertex is a node and every segment between consecutive vertices is an
edge. Ways that share a vertex are connected; ways that merely cross are not, which is
how OpenStreetMap distinguishes a junction from a bridge. A pedestrian area gets an edge
between every pair of its boundary vertices whose straight line stays inside it, so a
route may cross a plaza. Each place is joined to the network by a connector from its
entrance to the nearest point on the nearest edge, which is split there.

All geometry is done on a local metric plane centred on the data, so edge lengths are
metres and nearest-point searches are not distorted by latitude.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, Literal

from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import nearest_points

JsonObject = dict[str, Any]
Kind = Literal["walkway", "steps", "area", "connector"]
XY = tuple[float, float]

# Points closer than this, in metres, are the same node.
SNAP_M = 1e-3


@dataclass
class Graph:
    """A mutable graph in plane coordinates while it is being built."""

    to_plane: Transformer
    to_lonlat: Transformer
    nodes: list[XY] = field(default_factory=list[XY])
    index: dict[XY, int] = field(default_factory=dict[XY, int])
    edges: dict[tuple[int, int], tuple[float, Kind]] = field(default_factory=dict[tuple[int, int], tuple[float, Kind]])
    places: dict[str, int] = field(default_factory=dict[str, int])
    warnings: list[str] = field(default_factory=list[str])

    def node(self, xy: XY) -> int:
        """The node at these plane coordinates, created if new."""
        found = self.index.get(xy)
        if found is not None:
            return found
        self.nodes.append(xy)
        self.index[xy] = len(self.nodes) - 1
        return self.index[xy]

    def add_edge(self, a: int, b: int, kind: Kind) -> None:
        if a == b:
            return
        key = (a, b) if a < b else (b, a)
        if key in self.edges:
            return
        (ax, ay), (bx, by) = self.nodes[a], self.nodes[b]
        self.edges[key] = (((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5, kind)

    def project(self, lon: float, lat: float) -> XY:
        x, y = self.to_plane.transform(lon, lat)
        return (float(x), float(y))

    def nearest_edge(self, point: XY) -> tuple[tuple[int, int], XY, float] | None:
        """The edge closest to ``point``, the closest point on it, and the distance."""
        best: tuple[tuple[int, int], XY, float] | None = None
        target = Point(point)
        for key in self.edges:
            segment = LineString([self.nodes[key[0]], self.nodes[key[1]]])
            distance = segment.distance(target)
            if best is None or distance < best[2]:
                closest = segment.interpolate(segment.project(target))
                best = (key, (closest.x, closest.y), distance)
        return best

    def split_edge(self, key: tuple[int, int], at: XY) -> int:
        """Insert a node on an edge at ``at`` and return it; endpoints are reused."""
        a, b = key
        for end in (a, b):
            ex, ey = self.nodes[end]
            if abs(ex - at[0]) < SNAP_M and abs(ey - at[1]) < SNAP_M:
                return end
        _, kind = self.edges.pop(key)
        middle = self.node(at)
        self.add_edge(a, middle, kind)
        self.add_edge(middle, b, kind)
        return middle

    def connect(self, place_id: str, entrance: XY, max_connector_m: float) -> None:
        """Join a place's entrance to the network with a connector edge."""
        found = self.nearest_edge(entrance)
        if found is None:
            self.warnings.append(f"{place_id}: no walkways to connect to")
            self.places[place_id] = self.node(entrance)
            return
        key, closest, distance = found
        on_network = self.split_edge(key, closest)
        if distance < SNAP_M:
            # The entrance is already on a walkway: no connector needed.
            self.places[place_id] = on_network
            return
        entrance_node = self.node(entrance)
        self.add_edge(entrance_node, on_network, "connector")
        self.places[place_id] = entrance_node
        if distance > max_connector_m:
            self.warnings.append(
                f"{place_id}: entrance is {distance:.0f} m from the nearest walkway; place an entrance by hand"
            )

    def components(self) -> list[set[int]]:
        parent = list(range(len(self.nodes)))

        def find(i: int) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for a, b in self.edges:
            parent[find(a)] = find(b)
        groups: dict[int, set[int]] = {}
        for i in range(len(self.nodes)):
            groups.setdefault(find(i), set()).add(i)
        return sorted(groups.values(), key=len, reverse=True)

    def document(self) -> JsonObject:
        nodes: list[list[float]] = []
        for x, y in self.nodes:
            lon, lat = self.to_lonlat.transform(x, y)
            nodes.append([round(float(lon), 7), round(float(lat), 7)])
        edges = sorted(
            [[a, b, round(length, 2), kind] for (a, b), (length, kind) in self.edges.items()],
            key=lambda item: (item[0], item[1]),
        )
        return {"nodes": nodes, "edges": edges, "places": dict(sorted(self.places.items()))}


def _plane_transformers(features: Iterable[JsonObject]) -> tuple[Transformer, Transformer]:
    lons: list[float] = []
    lats: list[float] = []
    for feature in features:
        geometry = feature["geometry"]
        coordinates = geometry["coordinates"] if geometry["type"] == "LineString" else geometry["coordinates"][0]
        for lon, lat in coordinates:
            lons.append(float(lon))
            lats.append(float(lat))
    lon0 = sum(lons) / len(lons) if lons else 0.0
    lat0 = sum(lats) / len(lats) if lats else 0.0
    local = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +units=m +datum=WGS84"
    return (
        Transformer.from_crs("EPSG:4326", local, always_xy=True),
        Transformer.from_crs(local, "EPSG:4326", always_xy=True),
    )


def add_walkway(graph: Graph, feature: JsonObject, snap_m: float = 0.0) -> None:
    """Add a walkway's vertices and segments.

    With ``snap_m`` above zero, each end of a line that lies within that distance of an
    existing edge is moved onto the edge and joined there. Hand-drawn walkways use
    this so a line drawn to roughly the right spot connects to the mapped network.
    """
    geometry = feature["geometry"]
    kind: Kind = "steps" if feature["properties"].get("highway") == "steps" else "walkway"
    if geometry["type"] == "LineString":
        points = [graph.project(lon, lat) for lon, lat in geometry["coordinates"]]
        ids: list[int] = []
        for position, point in enumerate(points):
            is_end = position in (0, len(points) - 1)
            found = graph.nearest_edge(point) if is_end and snap_m > 0 else None
            if found is not None and found[2] <= snap_m:
                ids.append(graph.split_edge(found[0], found[1]))
            else:
                if is_end and snap_m > 0:
                    graph.warnings.append(
                        f"{feature['id']}: end at {geometry['coordinates'][position]} is not within"
                        f" {snap_m:g} m of a mapped walkway"
                    )
                ids.append(graph.node(point))
        for a, b in zip(ids, ids[1:]):
            graph.add_edge(a, b, kind)
        return
    ring = [graph.project(lon, lat) for lon, lat in geometry["coordinates"][0]]
    polygon = Polygon(ring)
    ids = [graph.node(xy) for xy in ring[:-1]]
    for i, a in enumerate(ids):
        graph.add_edge(a, ids[(i + 1) % len(ids)], "area")
        for b in ids[i + 2 :]:
            if polygon.covers(LineString([graph.nodes[a], graph.nodes[b]])):
                graph.add_edge(a, b, "area")


def entrance_of(place: JsonObject, by_osm_id: dict[str, JsonObject], graph: Graph) -> XY:
    """Where directions to a curated place end, on the plane.

    A hand-placed entrance or location is used as given. Otherwise the place's
    OpenStreetMap element is used: a node as it is, a footprint at the point on its
    outline nearest to the walkway network, so the connector never crosses the building.
    """
    for key in ("entrance", "location"):
        if key in place:
            return graph.project(float(place[key][0]), float(place[key][1]))
    feature = by_osm_id.get(place["osm"])
    if feature is None:
        raise ValueError(f"place {place['id']!r} refers to {place['osm']}, which is not in the fetched data")
    if feature["geometry"]["type"] == "Point":
        lon, lat = feature["geometry"]["coordinates"]
        return graph.project(float(lon), float(lat))
    outline = shape(feature["geometry"])
    boundary = LineString([graph.project(lon, lat) for lon, lat in _outline_coordinates(outline)])
    best: tuple[float, XY] | None = None
    for a, b in graph.edges:
        segment = LineString([graph.nodes[a], graph.nodes[b]])
        distance = boundary.distance(segment)
        if best is None or distance < best[0]:
            x, y = nearest_points(boundary, segment)[0].coords[0]
            best = (distance, (float(x), float(y)))
    if best is None:
        centroid = outline.centroid
        return graph.project(centroid.x, centroid.y)
    return best[1]


def _outline_coordinates(outline: Any) -> list[tuple[float, float]]:
    """The exterior ring(s) of a polygon or multipolygon as one coordinate list."""
    if outline.geom_type == "Polygon":
        return [(float(x), float(y)) for x, y in outline.exterior.coords]
    coordinates: list[tuple[float, float]] = []
    for polygon in outline.geoms:
        coordinates.extend((float(x), float(y)) for x, y in polygon.exterior.coords)
    return coordinates


@dataclass
class GraphBuild:
    document: JsonObject
    warnings: list[str]
    component_count: int
    unreachable: list[str]


def build_graph(
    walkways: JsonObject,
    places: Iterable[JsonObject],
    by_osm_id: dict[str, JsonObject],
    max_connector_m: float = 30.0,
    snap_m: float = 5.0,
) -> GraphBuild:
    """Build the graph from the walkways collection and the curated places.

    Mapped walkways go in first; hand-drawn ones are then snapped onto them.
    """
    features: list[JsonObject] = walkways["features"]
    to_plane, to_lonlat = _plane_transformers(features)
    graph = Graph(to_plane, to_lonlat)
    hand = [f for f in features if f["properties"].get("source") == "hand"]
    for feature in features:
        if feature["properties"].get("source") != "hand":
            add_walkway(graph, feature)
    for feature in hand:
        add_walkway(graph, feature, snap_m)
    for place in places:
        graph.connect(place["id"], entrance_of(place, by_osm_id, graph), max_connector_m)

    components = graph.components()
    largest: set[int] = components[0] if components else set()
    unreachable = sorted(pid for pid, node in graph.places.items() if node not in largest)
    return GraphBuild(graph.document(), graph.warnings, len(components), unreachable)
