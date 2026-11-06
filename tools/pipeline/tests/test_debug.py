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
