from typing import Any

import pytest
from pyproj import Geod

from openwalk_pipeline import graph, osm, places, walkways
from openwalk_pipeline.validate import validate
from tests.conftest import FIXTURES


def build(overpass_small: dict[str, Any], max_connector_m: float = 30.0) -> graph.GraphBuild:
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    selection = walkways.select_walkways(features, ("footway", "steps", "pedestrian"))
    curated = places.load_places_yaml(FIXTURES / "places_small.yaml")
    return graph.build_graph(selection.collection, curated, by_osm_id, max_connector_m)


def edges_of(document: dict[str, Any], kind: str) -> list[list[Any]]:
    return [edge for edge in document["edges"] if edge[3] == kind]


def test_output_matches_schema(overpass_small: dict[str, Any]) -> None:
    validate(build(overpass_small).document, "graph")


def test_edge_lengths_are_metres(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    # way/10 is the only plain walkway: 0.001 degrees north, then a diagonal; about
    # 110.6 m plus 123.7 m on the WGS84 ellipsoid near the equator.
    total = sum(e[2] for e in edges_of(document, "walkway"))
    assert total == pytest.approx(234.3, abs=0.5)


def test_ways_sharing_a_vertex_connect_and_steps_are_marked(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    steps = edges_of(document, "steps")
    assert len(steps) == 1
    shared = {steps[0][0], steps[0][1]} & {n for e in edges_of(document, "walkway") for n in e[:2]}
    assert len(shared) == 1  # the steps start where the footway ends


def test_plaza_is_traversable_across_its_interior(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    area = edges_of(document, "area")
    # A square plaza about 110 m on a side: its two diagonals are about 156 m.
    diagonals = [e for e in area if e[2] > 150]
    assert len(diagonals) == 2


def test_every_place_gets_a_node(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    assert set(document["places"]) == {"hall", "water", "plaza", "memorial"}
    connectors = edges_of(document, "connector")
    # The hall and the fountain stand away from the network and get connectors; the
    # plaza's entrance is on the plaza's edge and the memorial is on the footway, so
    # those two reuse network nodes and need none.
    assert len(connectors) == 2
    for place in ("hall", "water"):
        assert any(document["places"][place] in e[:2] for e in connectors)
    assert document["nodes"][document["places"]["memorial"]] == [20.0, 10.0]
    assert all(e[2] > 0 for e in document["edges"])


def test_building_entrance_lies_on_its_outline_nearest_the_walkway(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    lon, lat = document["nodes"][document["places"]["hall"]]
    # The hall spans lon 20.001 to 20.002; the footway runs along lon 20.000 to its west,
    # so the entrance is on the western wall, not at the centroid.
    assert lon == pytest.approx(20.001, abs=1e-6)
    assert 10.001 <= lat <= 10.002


def test_long_connectors_are_reported(overpass_small: dict[str, Any]) -> None:
    assert build(overpass_small, max_connector_m=1000).warnings == []
    warnings = build(overpass_small, max_connector_m=40).warnings
    # The fountain is about 55 m from the footway; the hall's entrance about 31 m.
    assert len(warnings) == 1
    assert warnings[0].startswith("water:") and "place an entrance by hand" in warnings[0]


def test_connectivity_is_reported(overpass_small: dict[str, Any]) -> None:
    built = build(overpass_small)
    # The plaza is drawn apart from the footway, so the network has two pieces.
    assert built.component_count == 2
    assert built.unreachable == ["plaza"]


def test_edge_lengths_match_the_geodesic(overpass_small: dict[str, Any]) -> None:
    document = build(overpass_small).document
    geod = Geod(ellps="WGS84")
    for a, b, length, _ in document["edges"]:
        (lon1, lat1), (lon2, lat2) = document["nodes"][a], document["nodes"][b]
        _, _, geodesic = geod.inv(lon1, lat1, lon2, lat2)
        assert length == pytest.approx(geodesic, rel=1e-4, abs=0.02)
