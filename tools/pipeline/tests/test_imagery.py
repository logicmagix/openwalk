import json
import shutil
from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import imagery, overpass
from openwalk_pipeline.cli import main, run_imagery
from openwalk_pipeline.site import load_site
from openwalk_pipeline.tiles import Extent
from openwalk_pipeline.validate import validate
from tests.conftest import FIXTURES

# A box about a kilometer wide and half that tall, at a latitude where Web Mercator
# stretches distances by about 15%.
EXTENT = Extent(west=-82.18, south=29.163, east=-82.17, north=29.168)


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def raise_for_status(self) -> None:
        pass


class FakeSession:
    """Stands in for the imagery service: remembers what was asked, returns a picture."""

    def __init__(self, content: bytes = imagery.JPEG_MAGIC + b"picture") -> None:
        self.content = content
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get(self, url: str, *, params: dict[str, str], headers: dict[str, str], timeout: float) -> Any:
        self.calls.append((url, params))
        return FakeResponse(self.content)


def test_mercator_round_trip() -> None:
    lon, lat = imagery.to_lonlat(*imagery.to_mercator(-82.175, 29.165))
    assert lon == pytest.approx(-82.175) and lat == pytest.approx(29.165)


def test_plan_sizes_the_picture_by_ground_distance() -> None:
    planned = imagery.plan(EXTENT, 0.5)
    # About 973 m by 556 m on the ground, whatever Mercator makes of it.
    assert planned.width == pytest.approx(973 / 0.5, rel=0.01)
    assert planned.height == pytest.approx(556 / 0.5, rel=0.01)
    assert planned.resolution_m == 0.5


def test_plan_coarsens_a_site_too_large_for_one_picture() -> None:
    planned = imagery.plan(EXTENT, 0.1)
    assert max(planned.width, planned.height) <= imagery.MAX_SIDE_PX
    assert planned.resolution_m > 0.1
    # The shape is kept.
    assert planned.width / planned.height == pytest.approx(973 / 556, rel=0.01)


def test_corners_run_clockwise_from_the_top_left() -> None:
    top_left, top_right, bottom_right, bottom_left = imagery.plan(EXTENT, 0.5).corners
    assert top_left == [EXTENT.west, EXTENT.north]
    assert top_right == [EXTENT.east, EXTENT.north]
    assert bottom_right == [EXTENT.east, EXTENT.south]
    assert bottom_left == [EXTENT.west, EXTENT.south]


def test_fetch_asks_for_the_box_in_the_maps_own_projection() -> None:
    session = FakeSession()
    planned = imagery.plan(EXTENT, 0.5)
    picture = imagery.fetch("https://imagery.example/ImageServer/", planned, session)
    assert picture.startswith(imagery.JPEG_MAGIC)
    url, params = session.calls[0]
    assert url == "https://imagery.example/ImageServer/exportImage"
    assert params["bboxSR"] == "3857" and params["imageSR"] == "3857"
    assert params["size"] == f"{planned.width},{planned.height}"
    assert params["format"] == "jpg"


def test_fetch_refuses_an_answer_that_is_not_a_picture() -> None:
    session = FakeSession(b'{"error": {"message": "too large"}}')
    with pytest.raises(imagery.ImageryError, match="no picture"):
        imagery.fetch("https://imagery.example/ImageServer", imagery.plan(EXTENT, 0.5), session)


def built_site(site_dir: Path, extra: str = "") -> None:
    with (site_dir / "site.yaml").open("a", encoding="utf-8") as handle:
        handle.write(extra)
    raw = site_dir / "raw"
    raw.mkdir(exist_ok=True)
    shutil.copy(FIXTURES / "overpass_small.json", raw / overpass.CACHE_NAME)
    shutil.copy(FIXTURES / "places_small.yaml", site_dir / "places.yaml")
    assert main(["build", str(site_dir)]) == 0


IMAGERY_SETTING = (
    "imagery:\n"
    "  source: https://imagery.example/ImageServer\n"
    "  attribution: Imagery from an example\n"
    "  resolution_m: 0.5\n"
)


def test_command_stores_the_photograph_and_build_offers_it(site_dir: Path) -> None:
    built_site(site_dir, IMAGERY_SETTING)
    assert not (site_dir / "overlays.json").exists()

    session = FakeSession()
    assert run_imagery(load_site(site_dir), session) == 0
    image_path, description_path = imagery.paths(site_dir)
    assert image_path.read_bytes().startswith(imagery.JPEG_MAGIC)
    description = json.loads(description_path.read_text(encoding="utf-8"))
    assert description["source"] == "https://imagery.example/ImageServer"
    assert len(description["corners"]) == 4

    assert main(["build", str(site_dir)]) == 0
    document = json.loads((site_dir / "overlays.json").read_text(encoding="utf-8"))
    validate(document, "overlays")
    (entry,) = document["overlays"]
    assert entry["id"] == "aerial"
    assert entry["name"] == "Aerial photo"
    assert entry["image"] == "imagery/aerial.jpg"
    assert entry["attribution"] == "Imagery from an example"
    assert entry["corners"] == description["corners"]
    assert "fit" not in entry


def test_command_needs_the_setting(site_dir: Path) -> None:
    built_site(site_dir)
    assert run_imagery(load_site(site_dir), FakeSession()) == 1
