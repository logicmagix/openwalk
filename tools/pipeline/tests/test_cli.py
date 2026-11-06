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
    assert len(output["features"]) == 3
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
