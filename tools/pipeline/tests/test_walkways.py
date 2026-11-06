from typing import Any

import pytest

from openwalk_pipeline import osm, walkways
from openwalk_pipeline.site import DEFAULT_WALKWAY_HIGHWAYS
from openwalk_pipeline.validate import SchemaError, validate


def build(overpass_small: dict[str, Any], highways: tuple[str, ...] = DEFAULT_WALKWAY_HIGHWAYS) -> dict[str, Any]:
    features = osm.convert(overpass_small["elements"]).features
    return walkways.select_walkways(features, highways)


def test_selects_only_configured_highways(overpass_small: dict[str, Any]) -> None:
    collection = build(overpass_small)
    assert [f["id"] for f in collection["features"]] == ["way/10", "way/11", "way/13"]


def test_site_can_widen_the_selection(overpass_small: dict[str, Any]) -> None:
    collection = build(overpass_small, ("footway", "service"))
    assert [f["id"] for f in collection["features"]] == ["way/10", "way/14"]


def test_properties_are_whitelisted_and_typed(overpass_small: dict[str, Any]) -> None:
    collection = build(overpass_small)
    props = {f["id"]: f["properties"] for f in collection["features"]}
    assert props["way/10"] == {
        "osm_id": "way/10",
        "highway": "footway",
        "surface": "paving_stones",
        "lit": "yes",
    }
    assert props["way/11"]["step_count"] == 12
    assert props["way/13"] == {"osm_id": "way/13", "highway": "pedestrian", "name": "Plaza"}


def test_unparseable_step_count_is_dropped() -> None:
    props = walkways.walkway_properties({"osm_id": "way/1", "highway": "steps", "step_count": "many"})
    assert "step_count" not in props


def test_output_matches_shared_schema(overpass_small: dict[str, Any]) -> None:
    validate(build(overpass_small), "walkways")


def test_schema_rejects_unexpected_property(overpass_small: dict[str, Any]) -> None:
    collection = build(overpass_small)
    collection["features"][0]["properties"]["ref"] = "A1"
    with pytest.raises(SchemaError, match=r"walkways: .*features\[0\]\.properties"):
        validate(collection, "walkways")
