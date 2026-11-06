"""Conversion of Overpass ``out geom`` elements into GeoJSON features.

Nodes become Points. Ways become LineStrings, or Polygons when OpenStreetMap's
conventions say a closed way is an area. Multipolygon relations become Polygons or
MultiPolygons from their outer members when each outer member is itself a closed ring;
relations whose rings are split across several ways are skipped and reported.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

JsonObject = dict[str, Any]
Position = list[float]

# A closed way with any of these keys is an area unless it says area=no. A closed
# highway or barrier is a loop, not an area, unless it says area=yes.
AREA_KEYS = frozenset(
    {"building", "landuse", "leisure", "amenity", "natural", "place", "shop", "tourism", "man_made"}
)
LINEAR_KEYS = frozenset({"highway", "barrier"})


@dataclass
class Conversion:
    features: list[JsonObject] = field(default_factory=list[JsonObject])
    skipped: list[str] = field(default_factory=list[str])


def is_area(tags: dict[str, str], closed: bool) -> bool:
    if not closed or tags.get("area") == "no":
        return False
    if tags.get("area") == "yes":
        return True
    if LINEAR_KEYS & tags.keys():
        return False
    return bool(AREA_KEYS & tags.keys())


def _positions(geometry: list[dict[str, float]]) -> list[Position]:
    return [[point["lon"], point["lat"]] for point in geometry]


def _is_closed(ring: list[Position]) -> bool:
    return len(ring) >= 4 and ring[0] == ring[-1]


def _feature(element: JsonObject, geometry: JsonObject) -> JsonObject:
    osm_id = f"{element['type']}/{element['id']}"
    properties: dict[str, str] = dict(element.get("tags", {}))
    properties["osm_id"] = osm_id
    return {"type": "Feature", "id": osm_id, "geometry": geometry, "properties": properties}


def convert_node(element: JsonObject) -> JsonObject:
    return _feature(element, {"type": "Point", "coordinates": [element["lon"], element["lat"]]})


def convert_way(element: JsonObject) -> JsonObject | None:
    coordinates = _positions(element.get("geometry", []))
    if len(coordinates) < 2:
        return None
    tags: dict[str, str] = element.get("tags", {})
    if is_area(tags, _is_closed(coordinates)):
        return _feature(element, {"type": "Polygon", "coordinates": [coordinates]})
    return _feature(element, {"type": "LineString", "coordinates": coordinates})


def convert_relation(element: JsonObject) -> JsonObject | None:
    tags: dict[str, str] = element.get("tags", {})
    if tags.get("type") != "multipolygon":
        return None
    outers: list[list[Position]] = []
    for member in element.get("members", []):
        if member.get("type") != "way" or member.get("role", "outer") not in ("outer", ""):
            continue
        ring = _positions(member.get("geometry", []))
        if not _is_closed(ring):
            return None
        outers.append(ring)
    if not outers:
        return None
    if len(outers) == 1:
        return _feature(element, {"type": "Polygon", "coordinates": outers})
    return _feature(element, {"type": "MultiPolygon", "coordinates": [[ring] for ring in outers]})


def convert(elements: list[JsonObject]) -> Conversion:
    """Convert every element; the result lists what could not be converted and why."""
    result = Conversion()
    for element in elements:
        kind = element.get("type")
        feature: JsonObject | None
        if kind == "node":
            feature = convert_node(element)
        elif kind == "way":
            feature = convert_way(element)
        elif kind == "relation":
            feature = convert_relation(element)
        else:
            feature = None
        if feature is None:
            result.skipped.append(f"{kind}/{element.get('id')}")
        else:
            result.features.append(feature)
    return result
