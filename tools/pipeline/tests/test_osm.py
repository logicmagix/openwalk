from typing import Any

from openwalk_pipeline import osm


def by_id(features: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {feature["id"]: feature for feature in features}


def test_nodes_become_points(overpass_small: dict[str, Any]) -> None:
    features = by_id(osm.convert(overpass_small["elements"]).features)
    water = features["node/1"]
    assert water["geometry"] == {"type": "Point", "coordinates": [20.0005, 10.0005]}
    assert water["properties"] == {"amenity": "drinking_water", "osm_id": "node/1"}


def test_open_ways_become_linestrings_in_lon_lat_order(overpass_small: dict[str, Any]) -> None:
    features = by_id(osm.convert(overpass_small["elements"]).features)
    footway = features["way/10"]
    assert footway["geometry"]["type"] == "LineString"
    assert footway["geometry"]["coordinates"][0] == [20.0, 10.0]


def test_closed_building_becomes_polygon(overpass_small: dict[str, Any]) -> None:
    features = by_id(osm.convert(overpass_small["elements"]).features)
    hall = features["way/12"]
    assert hall["geometry"]["type"] == "Polygon"
    assert len(hall["geometry"]["coordinates"][0]) == 5


def test_closed_highway_is_linear_unless_area_yes(overpass_small: dict[str, Any]) -> None:
    features = by_id(osm.convert(overpass_small["elements"]).features)
    assert features["way/13"]["geometry"]["type"] == "Polygon"  # pedestrian area
    assert features["way/14"]["geometry"]["type"] == "LineString"  # service loop


def test_is_area_rules() -> None:
    assert osm.is_area({"building": "yes"}, closed=True)
    assert not osm.is_area({"building": "yes"}, closed=False)
    assert not osm.is_area({"building": "yes", "area": "no"}, closed=True)
    assert not osm.is_area({"highway": "footway"}, closed=True)
    assert osm.is_area({"highway": "pedestrian", "area": "yes"}, closed=True)
    assert not osm.is_area({"barrier": "fence"}, closed=True)


def test_multipolygon_with_closed_outers(overpass_small: dict[str, Any]) -> None:
    features = by_id(osm.convert(overpass_small["elements"]).features)
    wings = features["relation/20"]
    assert wings["geometry"]["type"] == "MultiPolygon"
    assert len(wings["geometry"]["coordinates"]) == 2
    assert wings["properties"]["name"] == "Two Wings"


def test_unusable_elements_are_reported_not_converted(overpass_small: dict[str, Any]) -> None:
    result = osm.convert(overpass_small["elements"])
    assert "way/15" in result.skipped  # one point only
    assert "relation/21" in result.skipped  # outer ring not closed
    assert len(result.features) == 8
