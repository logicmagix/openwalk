"""Turning the curated ``places.yaml`` into ``places.geojson``.

A place's position comes from, in order: its hand-placed ``entrance``, its hand-placed
``location``, or the OpenStreetMap element named by ``osm`` (the node itself, or the
centroid of a way or relation). The OpenStreetMap reference is kept in the output so
later steps can find the footprint again.
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

import yaml
from shapely.geometry import shape

from openwalk_pipeline.validate import validate

JsonObject = dict[str, Any]

# Properties copied from places.yaml to the output when present.
OPTIONAL_PROPERTIES = ("number", "annotation")


class PlaceError(ValueError):
    """A place in places.yaml cannot be resolved against the fetched data."""


def load_places_yaml(path: Path) -> list[JsonObject]:
    with path.open(encoding="utf-8") as handle:
        document: JsonObject = yaml.safe_load(handle)
    validate(document, "places-yaml")
    places: list[JsonObject] = document["places"]
    seen: set[str] = set()
    for place in places:
        if place["id"] in seen:
            raise PlaceError(f"duplicate place id {place['id']!r}")
        seen.add(place["id"])
    return places


def _centroid(feature: JsonObject) -> list[float]:
    geometry = feature["geometry"]
    if geometry["type"] == "Point":
        return [float(geometry["coordinates"][0]), float(geometry["coordinates"][1])]
    point = shape(geometry).centroid
    return [point.x, point.y]


def resolve_position(place: JsonObject, by_osm_id: dict[str, JsonObject]) -> list[float]:
    if "entrance" in place:
        return [float(v) for v in place["entrance"]]
    if "location" in place:
        return [float(v) for v in place["location"]]
    feature = by_osm_id.get(place["osm"])
    if feature is None:
        raise PlaceError(f"place {place['id']!r} refers to {place['osm']}, which is not in the fetched data")
    return _centroid(feature)


def build_places(places: Iterable[JsonObject], features: Iterable[JsonObject]) -> JsonObject:
    """Return the places FeatureCollection, sorted by id."""
    by_osm_id = {feature["id"]: feature for feature in features}
    output: list[JsonObject] = []
    for place in places:
        properties: JsonObject = {
            "name": place["name"],
            "category": place["category"],
            "keywords": list(place.get("keywords", [])),
            "verified": bool(place.get("verified", False)),
        }
        for key in OPTIONAL_PROPERTIES:
            if key in place:
                properties[key] = place[key]
        if "osm" in place:
            properties["osm_id"] = place["osm"]
        output.append(
            {
                "type": "Feature",
                "id": place["id"],
                "geometry": {"type": "Point", "coordinates": resolve_position(place, by_osm_id)},
                "properties": properties,
            }
        )
    output.sort(key=lambda item: item["id"])
    return {"type": "FeatureCollection", "features": output}
