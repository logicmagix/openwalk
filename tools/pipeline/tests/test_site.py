from pathlib import Path

import pytest

from openwalk_pipeline.site import DEFAULT_WALKWAY_HIGHWAYS, load_site
from openwalk_pipeline.validate import SchemaError


def test_loads_minimal_site(site_dir: Path) -> None:
    site = load_site(site_dir)
    assert site.id == "demo-site"
    assert site.boundary.kind == "osm_way"
    assert site.boundary.value == 42
    assert site.walkway_highways == DEFAULT_WALKWAY_HIGHWAYS
    assert site.raw_dir == site_dir / "raw"


def test_bbox_boundary_and_walkway_override(tmp_path: Path) -> None:
    directory = tmp_path / "box-site"
    directory.mkdir()
    (directory / "site.yaml").write_text(
        "id: box-site\nname: Box\nboundary:\n  bbox: [10, 20, 10.1, 20.1]\n"
        "walkways:\n  highway: [footway, service]\n",
        encoding="utf-8",
    )
    site = load_site(directory)
    assert site.boundary.kind == "bbox"
    assert site.boundary.value == (10.0, 20.0, 10.1, 20.1)
    assert site.walkway_highways == ("footway", "service")


def test_rejects_two_boundary_forms(tmp_path: Path) -> None:
    directory = tmp_path / "bad-site"
    directory.mkdir()
    (directory / "site.yaml").write_text(
        "id: bad-site\nname: Bad\nboundary:\n  osm_way: 1\n  bbox: [0, 0, 1, 1]\n", encoding="utf-8"
    )
    with pytest.raises(SchemaError, match="boundary"):
        load_site(directory)


def test_rejects_id_that_differs_from_directory(tmp_path: Path) -> None:
    directory = tmp_path / "one-name"
    directory.mkdir()
    (directory / "site.yaml").write_text("id: other-name\nname: X\nboundary:\n  osm_way: 1\n")
    with pytest.raises(ValueError, match="does not match directory"):
        load_site(directory)


def site_with_safety(tmp_path: Path, safety: str) -> Path:
    directory = tmp_path / "safe-site"
    directory.mkdir()
    (directory / "site.yaml").write_text(
        f"id: safe-site\nname: Safe\nboundary:\n  osm_way: 1\nsafety:\n{safety}", encoding="utf-8"
    )
    return directory


def test_safety_numbers_are_kept_as_written(tmp_path: Path) -> None:
    directory = site_with_safety(
        tmp_path,
        "  - { label: Emergency, number: '911' }\n"
        "  - { label: Security office, number: '(352) 555-0100', note: Answered at any hour. }\n"
        "  - { label: Abroad, number: '+44 20 7946 0000' }\n",
    )
    assert load_site(directory).config["safety"] == [
        {"label": "Emergency", "number": "911"},
        {"label": "Security office", "number": "(352) 555-0100", "note": "Answered at any hour."},
        {"label": "Abroad", "number": "+44 20 7946 0000"},
    ]


@pytest.mark.parametrize(
    "safety",
    [
        "  - { label: Emergency, number: 911 }\n",  # unquoted, so YAML reads a number, not text
        "  - { label: Emergency, number: 'call the office' }\n",
        "  - { label: Emergency }\n",
        "  []\n",
    ],
)
def test_rejects_safety_numbers_that_cannot_be_called(tmp_path: Path, safety: str) -> None:
    with pytest.raises(SchemaError, match="safety"):
        load_site(site_with_safety(tmp_path, safety))
