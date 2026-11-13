"""Fetching one aerial photograph of a site, to offer as a layer of the map.

The photograph is taken once, when the site is prepared, from an imagery service
the site names, and is stored with the site's data. The app then serves it from
its own host like any other overlay: it works with no network, and no phone ever
asks an imagery provider for anything.

The service is an ArcGIS ImageServer, the kind government mapping agencies run;
its ``exportImage`` operation returns one picture of a requested box. The box is
asked for in Web Mercator, the projection the map itself is drawn in, so the
picture's four corners are exact and need no fitting.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from openwalk_pipeline import __version__
from openwalk_pipeline.tiles import Extent

JsonObject = dict[str, Any]

#: Where the photograph and its description are kept, relative to the site directory.
IMAGE_PATH = "imagery/aerial.jpg"
DESCRIPTION_PATH = "imagery/aerial.json"
#: The overlay id the photograph is offered under.
OVERLAY_ID = "aerial"

DEFAULT_NAME = "Aerial photo"
DEFAULT_RESOLUTION_M = 0.6
#: How far beyond the site's walkways and places the photograph reaches, in meters.
DEFAULT_MARGIN_M = 100.0
#: The longest side asked for, in pixels. Imagery services commonly refuse more than
#: 4000, and a phone cannot draw an image wider than 4096.
MAX_SIDE_PX = 4000

EARTH_RADIUS_M = 6378137.0
JPEG_MAGIC = b"\xff\xd8"


class ImageryError(RuntimeError):
    """The imagery service did not return a photograph."""


class Fetcher(Protocol):
    """The part of ``requests.Session`` the fetch uses; tests supply a fake."""

    def get(self, url: str, *, params: dict[str, str], headers: dict[str, str], timeout: float) -> Any: ...


def to_mercator(lon: float, lat: float) -> tuple[float, float]:
    x = EARTH_RADIUS_M * math.radians(lon)
    y = EARTH_RADIUS_M * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    lon = math.degrees(x / EARTH_RADIUS_M)
    lat = math.degrees(2 * math.atan(math.exp(y / EARTH_RADIUS_M)) - math.pi / 2)
    return lon, lat


@dataclass(frozen=True)
class Plan:
    """One picture to ask for: its box in Web Mercator meters and its size in pixels."""

    west: float
    south: float
    east: float
    north: float
    width: int
    height: int
    #: Meters on the ground per pixel, which is coarser than asked when the site is
    #: too large for the asked resolution to fit in one picture.
    resolution_m: float

    @property
    def corners(self) -> list[list[float]]:
        """Top-left, top-right, bottom-right, bottom-left, as longitude and latitude."""
        points = [(self.west, self.north), (self.east, self.north), (self.east, self.south), (self.west, self.south)]
        return [[round(lon, 7), round(lat, 7)] for lon, lat in (to_lonlat(x, y) for x, y in points)]


def plan(extent: Extent, resolution_m: float, max_side_px: int = MAX_SIDE_PX) -> Plan:
    """The picture covering ``extent`` at ``resolution_m`` or the finest that fits.

    Web Mercator stretches distances by 1 / cos(latitude), so a pixel that is to
    cover ``resolution_m`` on the ground covers more than that in Mercator meters.
    """
    if resolution_m <= 0:
        raise ValueError(f"resolution must be positive, got {resolution_m}")
    west, south = to_mercator(extent.west, extent.south)
    east, north = to_mercator(extent.east, extent.north)
    stretch = 1 / max(math.cos(math.radians((extent.south + extent.north) / 2)), 1e-6)
    ground_width = (east - west) / stretch
    ground_height = (north - south) / stretch
    longest = max(ground_width, ground_height)
    resolution = max(resolution_m, longest / max_side_px)
    return Plan(
        west=west,
        south=south,
        east=east,
        north=north,
        width=max(1, round(ground_width / resolution)),
        height=max(1, round(ground_height / resolution)),
        resolution_m=round(resolution, 3),
    )


def export_params(planned: Plan) -> dict[str, str]:
    """The query for the service's exportImage operation."""
    return {
        "bbox": f"{planned.west},{planned.south},{planned.east},{planned.north}",
        "bboxSR": "3857",
        "imageSR": "3857",
        "size": f"{planned.width},{planned.height}",
        "format": "jpg",
        "compressionQuality": "80",
        "f": "image",
    }


def fetch(source: str, planned: Plan, session: Fetcher, timeout: float = 120.0) -> bytes:
    """Ask the service for the planned picture and return it as JPEG bytes."""
    response = session.get(
        f"{source.rstrip('/')}/exportImage",
        params=export_params(planned),
        headers={"User-Agent": f"openwalk-pipeline/{__version__}"},
        timeout=timeout,
    )
    response.raise_for_status()
    content: bytes = response.content
    # A refusal comes back as a page or a JSON message with a success status.
    if not content.startswith(JPEG_MAGIC):
        raise ImageryError(f"the imagery service returned no picture: {content[:200]!r}")
    return content


def describe(planned: Plan, source: str) -> JsonObject:
    """What is recorded beside the photograph: where it sits and where it came from."""
    return {
        "width": planned.width,
        "height": planned.height,
        "corners": planned.corners,
        "resolution_m": planned.resolution_m,
        "source": source,
    }


def overlay_entry(config: JsonObject, description: JsonObject) -> JsonObject:
    """The photograph as an entry of ``overlays.json``, from the site's settings."""
    entry: JsonObject = {
        "id": OVERLAY_ID,
        "name": config.get("name", DEFAULT_NAME),
        "image": IMAGE_PATH,
        "width": description["width"],
        "height": description["height"],
        "corners": description["corners"],
    }
    if "attribution" in config:
        entry["attribution"] = config["attribution"]
    return entry


def paths(site_dir: Path) -> tuple[Path, Path]:
    return site_dir / IMAGE_PATH, site_dir / DESCRIPTION_PATH
