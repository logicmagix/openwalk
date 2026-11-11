"""Tests for finding breaks in the walkway network."""

from __future__ import annotations

import json
import math
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import gaps

# Near the equator 0.001 degrees is about 111 m in both directions.
D = 0.001


Nodes = Sequence[Sequence[float]]


def document(nodes: Nodes, edges: Sequence[Sequence[Any]]) -> dict[str, Any]:
    return {"nodes": [list(node) for node in nodes], "edges": [list(e) for e in edges], "places": {}}


def edge(nodes: Nodes, a: int, b: int, kind: str = "walkway") -> list[Any]:
    length = math.dist(nodes[a], nodes[b]) * gaps.METRES_PER_DEGREE
    return [a, b, round(length, 2), kind]


def hook() -> dict[str, Any]:
    """A path that runs east, north, back west, then south to stop 5.6 m above its own start leg."""
    nodes = [[0, 0], [2 * D, 0], [2 * D, D], [D, D], [D, 0.00005]]
    return document(nodes, [edge(nodes, i, i + 1) for i in range(4)])


def test_dead_end_close_to_another_walkway_is_a_gap() -> None:
    found = gaps.find_gaps(hook())
    assert len(found) == 1
    gap = found[0]
    assert gap.kind == "dead_end"
    assert gap.kinds == ("walkway", "walkway")
    assert gap.start == (D, 0.00005)
    assert gap.end == pytest.approx((D, 0.0), abs=1e-7)
    assert gap.gap_m == pytest.approx(5.6, abs=0.1)
    # Up 106 m, east 111, down 111 and back west 111 along the start leg.
    assert gap.detour_m == pytest.approx(439, abs=2)
    assert gap.saved_m == pytest.approx(gap.detour_m - gap.gap_m)


def test_dead_end_too_far_or_with_a_short_way_round_is_not_a_gap() -> None:
    assert gaps.find_gaps(hook(), max_gap_m=3.0) == []
    assert gaps.find_gaps(hook(), min_detour_m=1000.0) == []
    # A stub off a path ends near the path it left: the way round is the stub itself.
    nodes = [[0, 0], [D, 0], [2 * D, 0], [D, 0.00003]]
    stub = document(nodes, [edge(nodes, 0, 1), edge(nodes, 1, 2), edge(nodes, 1, 3)])
    assert gaps.find_gaps(stub) == []


def test_walkways_that_cross_without_a_shared_point_are_a_gap() -> None:
    # A square walked round three sides, and a second path cutting across the first side.
    nodes = [[0, 0], [2 * D, 0], [2 * D, 2 * D], [D, 2 * D], [D, -D]]
    found = gaps.find_gaps(document(nodes, [edge(nodes, 0, 1), edge(nodes, 1, 2), edge(nodes, 2, 3), edge(nodes, 3, 4, "aisle")]))
    assert len(found) == 1
    gap = found[0]
    assert gap.kind == "crossing"
    assert gap.kinds == ("walkway", "aisle")
    assert gap.start == gap.end == pytest.approx((D, 0.0), abs=1e-7)
    assert gap.gap_m == 0.0
    # East 111 m to the corner, north 222, west 111, then south 222 to the crossing.
    assert gap.detour_m == pytest.approx(668, abs=3)


def test_a_proper_junction_is_not_a_gap() -> None:
    nodes = [[0, 0], [D, 0], [2 * D, 0], [D, D], [D, -D]]
    joined = document(nodes, [edge(nodes, 0, 1), edge(nodes, 1, 2), edge(nodes, 3, 1), edge(nodes, 1, 4)])
    assert gaps.find_gaps(joined) == []


def test_two_dead_ends_facing_each_other_are_one_gap() -> None:
    # A ring with a 6 m break in it.
    nodes = [[0, 0], [0, D], [D, D], [D, 0], [0.00005, 0]]
    ring = document(nodes, [edge(nodes, 0, 1), edge(nodes, 1, 2), edge(nodes, 2, 3), edge(nodes, 3, 4)])
    found = gaps.find_gaps(ring)
    assert len(found) == 1
    assert found[0].gap_m == pytest.approx(5.6, abs=0.1)


def test_connectors_to_places_are_left_out() -> None:
    # A place's connector ends near a walkway on purpose; it is not a dead-end path.
    base = hook()
    nodes = [*base["nodes"], [0.0005, 0.00004]]
    edges = [*base["edges"], [1, 5, 170.0, "connector"]]
    found = gaps.find_gaps(document(nodes, edges))
    assert [gap.kind for gap in found] == ["dead_end"]
    assert found[0].start == (D, 0.00005)


def test_unreachable_side_is_reported_as_no_way_round() -> None:
    nodes = [[0, 0], [2 * D, 0], [D, 0.00005], [D, D]]
    found = gaps.find_gaps(document(nodes, [edge(nodes, 0, 1), edge(nodes, 2, 3)]))
    assert len(found) == 1
    assert math.isinf(found[0].detour_m)
    assert "no way round at all" in gaps.describe(1, found[0])
    assert gaps.as_geojson(found)["features"][0]["properties"]["detour_m"] is None


def test_longest_way_round_comes_first_and_reads_plainly() -> None:
    nodes = [[0, 0], [2 * D, 0], [2 * D, 2 * D], [D, 2 * D], [D, -D], [-D, -D], [-D, 0.00005]]
    found = gaps.find_gaps(
        document(nodes, [edge(nodes, 0, 1), edge(nodes, 1, 2), edge(nodes, 2, 3), edge(nodes, 3, 4, "aisle"), edge(nodes, 4, 5), edge(nodes, 5, 6)])
    )
    assert [gap.detour_m for gap in found] == sorted((gap.detour_m for gap in found), reverse=True)
    lines = [gaps.describe(number, gap) for number, gap in enumerate(found, start=1)]
    assert any("walkway and parking aisle cross without joining" in line for line in lines)
    collection = gaps.as_geojson(found)
    assert [f["properties"]["number"] for f in collection["features"]] == list(range(1, len(found) + 1))
    assert {f["geometry"]["type"] for f in collection["features"]} <= {"Point", "LineString"}


def test_empty_graph_has_no_gaps() -> None:
    assert gaps.find_gaps({"nodes": [], "edges": [], "places": {}}) == []


def test_gaps_command_lists_what_it_finds(site_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from openwalk_pipeline.cli import main

    assert main(["gaps", str(site_dir)]) == 1
    assert "run 'openwalk-pipeline build' first" in capsys.readouterr().err

    (site_dir / "graph.json").write_text(json.dumps(hook()), encoding="utf-8")
    assert main(["gaps", str(site_dir)]) == 0
    out = capsys.readouterr().out
    assert "1 suspected gaps" in out
    assert "walkway ends 5.6 m from a walkway" in out

    assert main(["gaps", str(site_dir), "--max-gap", "2"]) == 0
    assert "no suspected gaps" in capsys.readouterr().out


def test_debug_page_carries_the_gaps(site_dir: Path) -> None:
    from openwalk_pipeline import debug
    from openwalk_pipeline.site import load_site

    (site_dir / "graph.json").write_text(json.dumps(hook()), encoding="utf-8")
    page = debug.render(load_site(site_dir))
    assert '"gaps": {"type": "FeatureCollection"' in page
    assert '"kind": "dead_end"' in page
    assert "Suspected gaps" in page
