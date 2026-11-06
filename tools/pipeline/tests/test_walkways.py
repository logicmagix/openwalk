from typing import Any

import pytest

from pathlib import Path

from openwalk_pipeline import osm, walkways
from openwalk_pipeline.site import DEFAULT_WALKWAY_HIGHWAYS
from openwalk_pipeline.validate import SchemaError, validate


def build(overpass_small: dict[str, Any], highways: tuple[str, ...] = DEFAULT_WALKWAY_HIGHWAYS) -> dict[str, Any]:
    features = osm.convert(overpass_small["elements"]).features
    return walkways.select_walkways(features, highways).collection


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
        "source": "osm",
        "osm_id": "way/10",
        "highway": "footway",
        "surface": "paving_stones",
        "lit": "yes",
    }
    assert props["way/11"]["step_count"] == 12
    assert props["way/13"] == {"source": "osm", "osm_id": "way/13", "highway": "pedestrian", "name": "Plaza"}


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


def test_informal_and_unpaved_ways_are_excluded_with_reasons() -> None:
    def way(osm_id: str, **tags: str) -> dict[str, Any]:
        return {
            "type": "Feature",
            "id": osm_id,
            "geometry": {"type": "LineString", "coordinates": [[0, 0], [0, 1]]},
            "properties": {"osm_id": osm_id, "highway": "path", **tags},
        }

    selection = walkways.select_walkways(
        [way("way/1"), way("way/2", informal="yes"), way("way/3", surface="grass"), way("way/4", surface="asphalt")],
        ("path",),
    )
    assert [f["id"] for f in selection.collection["features"]] == ["way/1", "way/4"]
    assert selection.excluded == ["way/2 (informal path)", "way/3 (surface=grass)"]


def test_site_can_replace_the_unpaved_list() -> None:
    feature: dict[str, Any] = {
        "type": "Feature",
        "id": "way/1",
        "geometry": {"type": "LineString", "coordinates": [[0, 0], [0, 1]]},
        "properties": {"osm_id": "way/1", "highway": "path", "surface": "gravel"},
    }
    assert walkways.select_walkways([feature], ("path",), unpaved=("grass",)).excluded == []
    assert walkways.select_walkways([feature], ("path",)).excluded == ["way/1 (surface=gravel)"]


def test_hand_drawn_walkways_load_and_merge(overpass_small: dict[str, Any], tmp_path: Path) -> None:
    path = tmp_path / "walkways.yaml"
    path.write_text(
        "walkways:\n"
        "  - id: plaza-link\n    highway: footway\n    note: Across the lawn\n"
        "    coordinates: [[20.0005, 10.002], [20.001, 10.003]]\n"
        "  - id: back-steps\n    highway: steps\n    verified: true\n"
        "    coordinates: [[20.0, 10.0], [20.0, 9.9999]]\n"
    )
    hand = walkways.load_walkways_yaml(path)
    assert [f["id"] for f in hand] == ["hand/plaza-link", "hand/back-steps"]
    assert hand[0]["properties"] == {"source": "hand", "highway": "footway", "verified": False, "note": "Across the lawn"}
    assert hand[1]["properties"]["verified"] is True

    merged = walkways.merge(build(overpass_small), hand)
    validate(merged, "walkways")
    assert [f["id"] for f in merged["features"]] == ["hand/back-steps", "hand/plaza-link", "way/10", "way/11", "way/13"]


def test_hand_drawn_duplicate_ids_are_rejected(tmp_path: Path) -> None:
    path = tmp_path / "walkways.yaml"
    path.write_text(
        "walkways:\n"
        "  - {id: a, highway: footway, coordinates: [[0, 0], [0, 1]]}\n"
        "  - {id: a, highway: footway, coordinates: [[1, 0], [1, 1]]}\n"
    )
    with pytest.raises(ValueError, match="duplicate"):
        walkways.load_walkways_yaml(path)
