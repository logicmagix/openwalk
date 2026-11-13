from typing import Any

import pytest
from pyproj import Geod

from openwalk_pipeline import graph, osm, places, walkways
from openwalk_pipeline.validate import validate
from tests.conftest import FIXTURES


def build(overpass_small: dict[str, Any], max_connector_m: float = 30.0) -> graph.GraphBuild:
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    selection = walkways.select_walkways(features, ("footway", "steps", "pedestrian"), roads=())
    curated = places.load_places_yaml(FIXTURES / "places_small.yaml")
    return graph.build_graph(selection.collection, curated, by_osm_id, max_connector_m)


def edges_of(document: dict[str, Any], kind: str) -> list[list[Any]]:
    return [edge for edge in document["edges"] if edge[3] == kind]


def test_output_matches_schema(overpass_small: dict[str, Any]) -> None:
    validate(build(overpass_small).document, "graph")


def test_edge_lengths_are_meters(overpass_small: dict[str, Any]) -> None:
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


def hand(way_id: str, coordinates: list[list[float]]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": f"hand/{way_id}",
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "properties": {"source": "hand", "highway": "footway", "verified": False},
    }


def test_hand_drawn_walkway_snaps_onto_the_network_and_joins_islands(overpass_small: dict[str, Any]) -> None:
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    collection = walkways.select_walkways(features, ("footway", "steps", "pedestrian"), roads=()).collection
    curated = places.load_places_yaml(FIXTURES / "places_small.yaml")
    # From a point 2 m east of the footway's first vertex to a point 2 m below the
    # plaza's south-west corner: both ends are within the snap distance.
    link = hand("link", [[20.00002, 10.0], [20.001, 10.00298]])
    merged = walkways.merge(collection, [link])

    built = graph.build_graph(merged, curated, by_osm_id, snap_m=5.0)
    assert built.component_count == 1
    assert built.unreachable == []
    assert not [w for w in built.warnings if w.startswith("hand/")]
    # The link's ends became network nodes, not new dangling ones: no node lies at
    # the raw drawn coordinates.
    assert [20.00002, 10.0] not in built.document["nodes"]
    validate(built.document, "graph")


def test_hand_drawn_end_too_far_from_the_network_is_reported(overpass_small: dict[str, Any]) -> None:
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    collection = walkways.select_walkways(features, ("footway", "steps", "pedestrian"), roads=()).collection
    curated = places.load_places_yaml(FIXTURES / "places_small.yaml")
    stray = hand("stray", [[20.0003, 10.0], [20.0003, 10.0005]])  # about 33 m east of the footway
    built = graph.build_graph(walkways.merge(collection, [stray]), curated, by_osm_id, snap_m=5.0)
    assert len([w for w in built.warnings if w.startswith("hand/stray:")]) == 2
    assert built.component_count == 3


def test_edge_kinds_by_highway() -> None:
    assert graph.edge_kind({"highway": "service", "service": "parking_aisle"}) == "aisle"
    assert graph.edge_kind({"highway": "service", "service": "driveway"}) == "road"
    assert graph.edge_kind({"highway": "unclassified"}) == "road"
    assert graph.edge_kind({"highway": "steps"}) == "steps"
    assert graph.edge_kind({"highway": "footway"}) == "walkway"
    assert graph.edge_kind({"highway": "living_street"}) == "walkway"


def line(feature_id: str, coordinates: list[list[float]], **properties: Any) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "properties": {"source": "osm", "highway": "footway", **properties},
    }


def collection(*features: dict[str, Any]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


# Two paths in a plus shape that cross in the middle without sharing a vertex.
EAST_WEST = [[0.0, 0.0005], [0.001, 0.0005]]
NORTH_SOUTH = [[0.0005, 0.0], [0.0005, 0.001]]


def test_crossing_walkways_stay_apart_unless_the_site_joins_them() -> None:
    crossed = collection(line("way/1", EAST_WEST), line("way/2", NORTH_SOUTH))
    apart = graph.build_graph(crossed, [], {})
    assert apart.component_count == 2
    assert apart.joined_crossings == 0

    joined = graph.build_graph(crossed, [], {}, join_crossings=True)
    assert joined.component_count == 1
    assert joined.joined_crossings == 1
    # One new node where they cross, and each path is now two edges of half its length.
    assert len(joined.document["nodes"]) == 5
    assert len(joined.document["edges"]) == 4
    total = sum(e[2] for e in joined.document["edges"])
    assert total == pytest.approx(sum(e[2] for e in apart.document["edges"]), abs=0.05)
    validate(joined.document, "graph")


@pytest.mark.parametrize("tags", [{"bridge": "yes"}, {"tunnel": "yes"}, {"layer": "1"}, {"layer": "-1"}])
def test_bridges_tunnels_and_other_layers_are_never_joined(tags: dict[str, str]) -> None:
    crossed = collection(line("way/1", EAST_WEST), line("way/2", NORTH_SOUTH, **tags))
    built = graph.build_graph(crossed, [], {}, join_crossings=True)
    assert built.joined_crossings == 0
    assert built.component_count == 2


def test_a_way_marked_as_ground_level_is_joined() -> None:
    crossed = collection(line("way/1", EAST_WEST, layer="0", bridge="no"), line("way/2", NORTH_SOUTH))
    assert graph.build_graph(crossed, [], {}, join_crossings=True).joined_crossings == 1


def test_a_path_crossed_twice_is_cut_in_order() -> None:
    long_path = line("way/1", [[0.0, 0.0005], [0.003, 0.0005]])
    first = line("way/2", [[0.002, 0.0], [0.002, 0.001]])
    second = line("way/3", [[0.001, 0.0], [0.001, 0.001]])
    built = graph.build_graph(collection(long_path, first, second), [], {}, join_crossings=True)
    assert built.joined_crossings == 2
    assert built.component_count == 1
    # The long path is three pieces of a third each, not one piece doubling back.
    nodes = built.document["nodes"]
    pieces = sorted(e[2] for e in built.document["edges"] if nodes[e[0]][1] == nodes[e[1]][1])
    assert len(pieces) == 3
    assert pieces[0] == pytest.approx(pieces[2], rel=0.01)


def test_lines_across_an_open_area_are_not_joined_to_each_other() -> None:
    square = {
        "type": "Feature",
        "id": "way/9",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[0.0, 0.0], [0.001, 0.0], [0.001, 0.001], [0.0, 0.001], [0.0, 0.0]]],
        },
        "properties": {"source": "osm", "highway": "pedestrian"},
    }
    plain = graph.build_graph(collection(square), [], {})
    joined = graph.build_graph(collection(square), [], {}, join_crossings=True)
    assert joined.joined_crossings == 0
    assert joined.document == plain.document


def test_grade_separation_is_read_from_the_tags() -> None:
    assert graph.is_grade_separated({"bridge": "yes"})
    assert graph.is_grade_separated({"tunnel": "building_passage"})
    assert graph.is_grade_separated({"layer": "2"})
    assert not graph.is_grade_separated({})
    assert not graph.is_grade_separated({"layer": "0", "bridge": "no"})


def test_three_paths_crossing_at_almost_one_point_share_a_single_join() -> None:
    # The diagonal passes a few millimeters from where the other two cross.
    diagonal = line("way/3", [[0.0, 0.0], [0.001, 0.00100000005]])
    built = graph.build_graph(
        collection(line("way/1", EAST_WEST), line("way/2", NORTH_SOUTH), diagonal), [], {}, join_crossings=True
    )
    assert built.component_count == 1
    assert all(edge[2] > 0 for edge in built.document["edges"])
    validate(built.document, "graph")


def test_a_place_with_several_entrances_gets_a_node_for_each(overpass_small: dict[str, Any]) -> None:
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    selection = walkways.select_walkways(features, ("footway", "steps", "pedestrian"), roads=())
    curated = [
        {
            "id": "hall",
            "name": "Hall",
            "category": "building",
            "osm": "way/12",
            # One door on the west wall, one on the east.
            "entrances": [[20.001, 10.0015], [20.002, 10.0015]],
        },
        {"id": "memorial", "name": "Memorial", "category": "landmark", "location": [20.0, 10.0]},
    ]
    document = graph.build_graph(selection.collection, curated, by_osm_id, 1000).document
    validate(document, "graph")
    doors: list[int] = document["places"]["hall"]
    assert len(doors) == 2
    assert [document["nodes"][door] for door in doors] == [[20.001, 10.0015], [20.002, 10.0015]]
    # A place with one entrance is still written as a single node.
    assert isinstance(document["places"]["memorial"], int)
