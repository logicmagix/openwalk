import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import __version__, overpass
from openwalk_pipeline.cli import build_parser, main
from openwalk_pipeline.validate import validate

FIXTURE = Path(__file__).parent / "fixtures" / "overpass_small.json"


def test_version_flag_prints_version(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exit_info:
        build_parser().parse_args(["--version"])
    assert exit_info.value.code == 0
    assert __version__ in capsys.readouterr().out


def test_build_requires_a_cache(site_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["build", str(site_dir)]) == 1
    assert "fetch" in capsys.readouterr().err


def test_build_writes_valid_walkways_from_cache(site_dir: Path) -> None:
    raw = site_dir / "raw"
    raw.mkdir()
    shutil.copy(FIXTURE, raw / overpass.CACHE_NAME)

    assert main(["build", str(site_dir)]) == 0

    output: dict[str, Any] = json.loads((site_dir / "walkways.geojson").read_text(encoding="utf-8"))
    validate(output, "walkways")
    # Three footways and plazas, plus the service loop admitted as a minor road.
    assert len(output["features"]) == 4
    assert not (site_dir / "places.geojson").exists()


def test_build_writes_places_when_curated_file_exists(site_dir: Path) -> None:
    raw = site_dir / "raw"
    raw.mkdir()
    shutil.copy(FIXTURE, raw / overpass.CACHE_NAME)
    shutil.copy(FIXTURE.parent / "places_small.yaml", site_dir / "places.yaml")

    assert main(["build", str(site_dir)]) == 0

    output: dict[str, Any] = json.loads((site_dir / "places.geojson").read_text(encoding="utf-8"))
    validate(output, "places")
    assert len(output["features"]) == 4


def test_tiles_requires_a_source(site_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["tiles", str(site_dir)]) == 1
    assert "tiles.source" in capsys.readouterr().err


def test_tiles_extracts_around_the_built_data(site_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from pmtiles.reader import MemorySource, Reader

    from openwalk_pipeline.cli import run_tiles
    from openwalk_pipeline.site import load_site
    from tests.test_tiles import FakeSession, planet_archive

    (site_dir / "site.yaml").write_text(
        "id: demo-site\nname: Demo Site\nboundary:\n  osm_way: 42\n"
        "view:\n  center: [10.0, 10.0]\n  zoom: 2\n"
        "tiles:\n  source: https://example.test/planet.pmtiles\n  margin_m: 100\n",
        encoding="utf-8",
    )
    (site_dir / "walkways.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [{"geometry": {"type": "LineString", "coordinates": [[10.0, 10.0], [10.01, 10.01]]}}],
            }
        ),
        encoding="utf-8",
    )
    session = FakeSession(planet_archive())
    assert run_tiles(load_site(site_dir), source=None, max_zoom=None, session=session) == 0
    assert "4 tiles" in capsys.readouterr().out

    reader = Reader(MemorySource((site_dir / "basemap.pmtiles").read_bytes()))
    assert reader.metadata()["name"] == "Demo Site base map"
    assert reader.header()["center_zoom"] == 2
    assert reader.header()["center_lon_e7"] == 100_000_000


def test_tiles_without_data_uses_a_bbox_boundary(tmp_path: Path) -> None:
    from openwalk_pipeline.cli import run_tiles
    from openwalk_pipeline.site import load_site
    from tests.test_tiles import FakeSession, planet_archive

    directory = tmp_path / "box-site"
    directory.mkdir()
    (directory / "site.yaml").write_text(
        "id: box-site\nname: Box\nboundary:\n  bbox: [10.0, 10.0, 10.01, 10.01]\n",
        encoding="utf-8",
    )
    session = FakeSession(planet_archive())
    assert run_tiles(load_site(directory), source="https://example.test/p.pmtiles", max_zoom=1, session=session) == 0
    assert (directory / "basemap.pmtiles").exists()
