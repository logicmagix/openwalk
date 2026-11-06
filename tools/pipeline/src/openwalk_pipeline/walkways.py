"""Selecting the ways a pedestrian may use and shaping them for ``walkways.geojson``."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

JsonObject = dict[str, Any]

# Tags carried through to the output, and the type each is coerced to. Everything else
# in OpenStreetMap is dropped so the app loads only what it uses.
STRING_TAGS = ("name", "surface", "lit", "incline", "wheelchair", "covered", "level")
INTEGER_TAGS = ("step_count",)


def walkway_properties(tags: dict[str, Any]) -> JsonObject:
    properties: JsonObject = {"osm_id": tags["osm_id"], "highway": tags["highway"]}
    for key in STRING_TAGS:
        if key in tags:
            properties[key] = str(tags[key])
    for key in INTEGER_TAGS:
        if key in tags:
            try:
                value = int(str(tags[key]).strip())
            except ValueError:
                continue
            if value >= 1:
                properties[key] = value
    return properties


def select_walkways(features: Iterable[JsonObject], highways: Iterable[str]) -> JsonObject:
    """Return a FeatureCollection of the features whose highway tag is in ``highways``.

    Only linear ways and pedestrian areas qualify; points and multipolygons never do.
    """
    wanted = set(highways)
    selected: list[JsonObject] = []
    for feature in features:
        tags: dict[str, Any] = feature["properties"]
        if tags.get("highway") not in wanted:
            continue
        if feature["geometry"]["type"] not in ("LineString", "Polygon"):
            continue
        selected.append(
            {
                "type": "Feature",
                "id": feature["id"],
                "geometry": feature["geometry"],
                "properties": walkway_properties(tags),
            }
        )
    selected.sort(key=lambda item: item["id"])
    return {"type": "FeatureCollection", "features": selected}
