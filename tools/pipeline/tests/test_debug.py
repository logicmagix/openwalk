import json
import shutil
from pathlib import Path
from typing import Any

from openwalk_pipeline import debug, overpass
from openwalk_pipeline.cli import main
from openwalk_pipeline.site import load_site

FIXTURES = Path(__file__).parent / "fixtures"


def test_island_edges_are_those_outside_the_largest_piece() -> None:
    graph: dict[str, Any] = {
        "nodes": [[0, 0], [0, 1], [0, 2], [5, 5], [5, 6], [9, 9]],
        "edges": [[0, 1, 1, "walkway"], [1, 2, 1, "walkway"], [3, 4, 1, "walkway"], [2, 5, 1, "connector"]],
        "places": {},
    }
    assert debug.island_edges(graph) == [2]
    assert debug.island_edges({"nodes": [], "edges": [], "places": {}}) == []


def built_site(site_dir: Path) -> None:
    raw = site_dir / "raw"
    raw.mkdir()
    shutil.copy(FIXTURES / "overpass_small.json", raw / overpass.CACHE_NAME)
    shutil.copy(FIXTURES / "places_small.yaml", site_dir / "places.yaml")
    assert main(["build", str(site_dir)]) == 0


def test_page_embeds_the_generated_data(site_dir: Path) -> None:
    built_site(site_dir)
    html = debug.render(load_site(site_dir))
    assert "<title>Demo Site: data check</title>" in html
    assert '"places":{"hall"' in html.replace(" ", "")
    assert "way/10" in html and "memorial" in html
    assert "</script" not in html.split("const DATA = ")[1].split(";\nconst map")[0]


def test_debug_command_writes_next_to_the_site(site_dir: Path, tmp_path: Path) -> None:
    built_site(site_dir)
    assert main(["debug", str(site_dir)]) == 0
    assert (site_dir / "debug.html").exists()
    out = tmp_path / "elsewhere.html"
    assert main(["debug", str(site_dir), "--out", str(out)]) == 0
    assert json.loads('"ok"') == "ok" and out.exists()


def test_a_wider_search_draws_at_least_as_many_gaps(site_dir: Path) -> None:
    built_site(site_dir)
    site = load_site(site_dir)

    def gap_count(html: str) -> int:
        data, _ = json.JSONDecoder().raw_decode(html.split("const DATA = ")[1])
        return len(data["gaps"]["features"])

    narrow = gap_count(debug.render(site, max_gap_m=1, min_detour_m=0))
    wide = gap_count(debug.render(site, max_gap_m=500, min_detour_m=0))
    assert wide >= narrow
    assert main(["debug", str(site_dir), "--max-gap", "25", "--min-detour", "50"]) == 0


def test_an_overlay_is_labeled_with_its_fit_only_when_it_has_one() -> None:
    fitted = {"name": "Official map", "fit": {"control_points": 4, "rms_m": 2.5, "max_m": 4.0}}
    assert debug.overlay_label(fitted) == "Official map (rms 2.5 m)"
    assert debug.overlay_label({"name": "Aerial photo"}) == "Aerial photo"


def test_page_lists_an_overlay_that_has_no_fit(site_dir: Path) -> None:
    built_site(site_dir)
    site = load_site(site_dir)
    corners = [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]]
    overlay = {"id": "aerial", "name": "Aerial photo", "image": "imagery/aerial.jpg", "corners": corners}
    site.overlays_path.write_text(json.dumps({"overlays": [overlay]}))
    data, _ = json.JSONDecoder().raw_decode(debug.render(site).split("const DATA = ")[1])
    assert [o["label"] for o in data["overlays"]] == ["Aerial photo"]
    assert "o.fit" not in debug.render(site)
