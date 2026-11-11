from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import osm, places
from openwalk_pipeline.validate import SchemaError, validate

FIXTURES = Path(__file__).parent / "fixtures"


def build(overpass_small: dict[str, Any]) -> dict[str, Any]:
    curated = places.load_places_yaml(FIXTURES / "places_small.yaml")
    return places.build_places(curated, osm.convert(overpass_small["elements"]).features)


def test_positions_come_from_location_osm_or_entrance(overpass_small: dict[str, Any]) -> None:
    by_id = {f["id"]: f for f in build(overpass_small)["features"]}
    assert by_id["water"]["geometry"]["coordinates"] == [20.0005, 10.0005]  # the node itself
    # The plaza has an entrance on its edge, but its marker sits in the middle of it.
    plaza = by_id["plaza"]["geometry"]["coordinates"]
    assert plaza[0] == pytest.approx(20.0015) and plaza[1] == pytest.approx(10.0035)
    assert by_id["memorial"]["geometry"]["coordinates"] == [20.0, 10.0]  # hand-placed
    hall = by_id["hall"]["geometry"]["coordinates"]
    assert hall[0] == pytest.approx(20.0015) and hall[1] == pytest.approx(10.0015)  # centroid


def test_properties_and_defaults(overpass_small: dict[str, Any]) -> None:
    by_id = {f["id"]: f for f in build(overpass_small)["features"]}
    assert by_id["hall"]["properties"] == {
        "name": "Hall",
        "number": "7",
        "category": "building",
        "annotation": "Main office",
        "keywords": ["office", "admin"],
        "osm_id": "way/12",
        "verified": False,
    }
    assert by_id["water"]["properties"]["verified"] is True
    assert "osm_id" not in by_id["memorial"]["properties"]


def test_output_is_sorted_and_valid(overpass_small: dict[str, Any]) -> None:
    collection = build(overpass_small)
    assert [f["id"] for f in collection["features"]] == ["hall", "memorial", "plaza", "water"]
    validate(collection, "places")


def test_unknown_osm_reference_is_an_error(overpass_small: dict[str, Any]) -> None:
    features = osm.convert(overpass_small["elements"]).features
    with pytest.raises(places.PlaceError, match="way/999"):
        places.build_places([{"id": "x", "name": "X", "category": "building", "osm": "way/999"}], features)


def test_duplicate_ids_are_rejected(tmp_path: Path) -> None:
    path = tmp_path / "places.yaml"
    path.write_text(
        "places:\n  - {id: a, name: A, category: building, location: [0, 0]}\n"
        "  - {id: a, name: B, category: building, location: [1, 1]}\n"
    )
    with pytest.raises(places.PlaceError, match="duplicate"):
        places.load_places_yaml(path)


def test_place_without_any_position_fails_validation(tmp_path: Path) -> None:
    path = tmp_path / "places.yaml"
    path.write_text("places:\n  - {id: a, name: A, category: building}\n")
    with pytest.raises(SchemaError, match="places-yaml"):
        places.load_places_yaml(path)


def test_a_place_known_only_by_its_entrances_is_marked_at_the_first() -> None:
    curated = [
        {"id": "gate", "name": "Gate", "category": "landmark", "entrance": [20.0, 10.0]},
        {"id": "courts", "name": "Courts", "category": "sports", "entrances": [[20.1, 10.1], [20.2, 10.2]]},
    ]
    by_id = {f["id"]: f for f in places.build_places(curated, [])["features"]}
    assert by_id["gate"]["geometry"]["coordinates"] == [20.0, 10.0]
    assert by_id["courts"]["geometry"]["coordinates"] == [20.1, 10.1]


def test_entrance_and_entrances_together_are_refused(tmp_path: Path) -> None:
    path = tmp_path / "places.yaml"
    path.write_text(
        "places:\n"
        "  - id: hall\n    name: Hall\n    category: building\n"
        "    entrance: [20.0, 10.0]\n    entrances: [[20.0, 10.0], [20.1, 10.1]]\n",
        encoding="utf-8",
    )
    with pytest.raises((SchemaError, places.PlaceError)):
        places.load_places_yaml(path)
