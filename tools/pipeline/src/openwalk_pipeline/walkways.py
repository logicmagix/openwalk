"""Selecting the ways a pedestrian may use and shaping them for ``walkways.geojson``."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from openwalk_pipeline.validate import validate

JsonObject = dict[str, Any]

# Tags carried through to the output, and the type each is coerced to. Everything else
# in OpenStreetMap is dropped so the app loads only what it uses.
STRING_TAGS = ("name", "surface", "lit", "incline", "wheelchair", "covered", "level")
INTEGER_TAGS = ("step_count",)

# Surface values that mean "not a paved walkway", unless a site says otherwise. A way
# with no surface tag is kept: an untagged campus sidewalk is the common case.
DEFAULT_UNPAVED: tuple[str, ...] = (
    "unpaved",
    "grass",
    "dirt",
    "ground",
    "earth",
    "mud",
    "sand",
    "gravel",
    "fine_gravel",
    "pebblestone",
    "woodchips",
)


@dataclass
class Selection:
    collection: JsonObject
    excluded: list[str] = field(default_factory=list[str])


def walkway_properties(tags: dict[str, Any]) -> JsonObject:
    properties: JsonObject = {"source": "osm", "osm_id": tags["osm_id"], "highway": tags["highway"]}
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


def exclusion_reason(tags: dict[str, Any], unpaved: Iterable[str]) -> str | None:
    """Why a way with a wanted highway value is still not a walkway, or None."""
    if tags.get("informal") == "yes":
        return "informal path"
    surface = tags.get("surface")
    if surface in set(unpaved):
        return f"surface={surface}"
    return None


def select_walkways(
    features: Iterable[JsonObject],
    highways: Iterable[str],
    unpaved: Iterable[str] = DEFAULT_UNPAVED,
) -> Selection:
    """Select the features whose highway tag is in ``highways`` and that are paved.

    Only linear ways and pedestrian areas qualify; points and multipolygons never do.
    Ways excluded for being informal or unpaved are listed with the reason.
    """
    wanted = set(highways)
    unpaved_set = set(unpaved)
    selected: list[JsonObject] = []
    excluded: list[str] = []
    for feature in features:
        tags: dict[str, Any] = feature["properties"]
        if tags.get("highway") not in wanted:
            continue
        if feature["geometry"]["type"] not in ("LineString", "Polygon"):
            continue
        reason = exclusion_reason(tags, unpaved_set)
        if reason is not None:
            excluded.append(f"{feature['id']} ({reason})")
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
    return Selection({"type": "FeatureCollection", "features": selected}, excluded)


def load_walkways_yaml(path: Path) -> list[JsonObject]:
    """Hand-drawn walkways as features with ids ``hand/<id>`` and ``source: hand``."""
    with path.open(encoding="utf-8") as handle:
        document: JsonObject = yaml.safe_load(handle)
    validate(document, "walkways-yaml")
    features: list[JsonObject] = []
    seen: set[str] = set()
    for way in document["walkways"]:
        if way["id"] in seen:
            raise ValueError(f"duplicate hand-drawn walkway id {way['id']!r}")
        seen.add(way["id"])
        properties: JsonObject = {
            "source": "hand",
            "highway": way["highway"],
            "verified": bool(way.get("verified", False)),
        }
        if "note" in way:
            properties["note"] = way["note"]
        features.append(
            {
                "type": "Feature",
                "id": f"hand/{way['id']}",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[float(lon), float(lat)] for lon, lat in way["coordinates"]],
                },
                "properties": properties,
            }
        )
    return features


def merge(collection: JsonObject, extra: Iterable[JsonObject]) -> JsonObject:
    """A collection with the extra features added, sorted by id."""
    features = sorted([*collection["features"], *extra], key=lambda item: item["id"])
    return {"type": "FeatureCollection", "features": features}
