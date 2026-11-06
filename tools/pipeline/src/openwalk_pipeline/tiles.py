"""Extracting a site's base map from a planet-wide PMTiles build.

A PMTiles archive is one file holding every tile with an index at the front, designed
so a client can fetch the index with a few HTTP range requests and then fetch single
tiles the same way. That is how the app reads the site's archive, and it is also how
this module builds it: the tiles covering the site, at every zoom level, are read from
a remote planet build by range request and written into a small archive of their own.
Nothing else is downloaded.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from pmtiles.reader import Reader
from pmtiles.tile import zxy_to_tileid
from pmtiles.writer import Writer

from openwalk_pipeline import __version__

USER_AGENT = f"openwalk-pipeline/{__version__} (https://openwalk.app)"
OUTPUT_NAME = "basemap.pmtiles"

# Web Mercator cannot show latitudes beyond this; tile maths clamps to it.
MAX_LATITUDE = 85.05112878

GetBytes = Callable[[int, int], bytes]


@dataclass(frozen=True)
class Extent:
    """A bounding box in degrees: west, south, east, north."""

    west: float
    south: float
    east: float
    north: float

    def expand(self, metres: float) -> Extent:
        """The box grown by ``metres`` on every side."""
        lat_degrees = metres / 111_195.0
        mid = math.radians((self.south + self.north) / 2)
        lon_degrees = lat_degrees / max(math.cos(mid), 1e-6)
        return Extent(
            west=max(self.west - lon_degrees, -180.0),
            south=max(self.south - lat_degrees, -MAX_LATITUDE),
            east=min(self.east + lon_degrees, 180.0),
            north=min(self.north + lat_degrees, MAX_LATITUDE),
        )

    @property
    def center(self) -> tuple[float, float]:
        return ((self.west + self.east) / 2, (self.south + self.north) / 2)


def extent_of(collections: Iterable[dict[str, Any]]) -> Extent | None:
    """The bounding box of every coordinate in the given GeoJSON collections."""
    lons: list[float] = []
    lats: list[float] = []

    def visit(coordinates: Any) -> None:
        if isinstance(coordinates[0], (int, float)):
            lons.append(float(coordinates[0]))
            lats.append(float(coordinates[1]))
        else:
            for child in coordinates:
                visit(child)

    for collection in collections:
        for feature in collection.get("features", []):
            visit(feature["geometry"]["coordinates"])
    if not lons:
        return None
    return Extent(min(lons), min(lats), max(lons), max(lats))


def tile_xy(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    """The Web Mercator tile containing a position at a zoom level."""
    n = 2**zoom
    lat = max(-MAX_LATITUDE, min(MAX_LATITUDE, lat))
    x = int((lon + 180.0) / 360.0 * n)
    radians = math.radians(lat)
    y = int((1.0 - math.log(math.tan(radians) + 1.0 / math.cos(radians)) / math.pi) / 2.0 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tiles_covering(extent: Extent, min_zoom: int, max_zoom: int) -> list[tuple[int, int, int]]:
    """Every (z, x, y) touching the extent, in archive order (tile id order)."""
    found: list[tuple[int, int, int]] = []
    for zoom in range(min_zoom, max_zoom + 1):
        x0, y0 = tile_xy(extent.west, extent.north, zoom)
        x1, y1 = tile_xy(extent.east, extent.south, zoom)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                found.append((zoom, x, y))
    found.sort(key=lambda zxy: zxy_to_tileid(*zxy))
    return found


class RangeFetcher(Protocol):
    """The part of ``requests.Session`` the range source uses; tests supply a fake."""

    def get(self, url: str, *, headers: dict[str, str], timeout: float) -> Any: ...


class RangeSource:
    """Bytes of a remote archive, fetched by HTTP range request and remembered.

    The index is read again for every tile, so remembering what was fetched turns
    those repeated reads into one request each.
    """

    def __init__(self, url: str, session: RangeFetcher, timeout: float = 60.0) -> None:
        self.url = url
        self.session = session
        self.timeout = timeout
        self.cache: dict[tuple[int, int], bytes] = {}
        self.requests = 0
        self.bytes = 0

    def get_bytes(self, offset: int, length: int) -> bytes:
        key = (offset, length)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        headers = {"Range": f"bytes={offset}-{offset + length - 1}", "User-Agent": USER_AGENT}
        response = self.session.get(self.url, headers=headers, timeout=self.timeout)
        response.raise_for_status()
        data: bytes = response.content
        if len(data) != length:
            raise RuntimeError(f"range request for {length} bytes at {offset} returned {len(data)}")
        self.cache[key] = data
        self.requests += 1
        self.bytes += len(data)
        return data


@dataclass(frozen=True)
class Extraction:
    tiles: int
    missing: int
    min_zoom: int
    max_zoom: int
    extent: Extent
    attribution: str


def extract(
    get_bytes: GetBytes,
    extent: Extent,
    output: Path,
    *,
    name: str,
    source: str,
    max_zoom: int | None = None,
    center: tuple[float, float] | None = None,
    center_zoom: int | None = None,
) -> Extraction:
    """Write the tiles of the source archive that cover ``extent`` to ``output``.

    The source's tile format, compression, layer list and attribution are carried
    over unchanged, so the result renders with the same style as the source.
    """
    reader = Reader(get_bytes)
    header = reader.header()
    metadata = reader.metadata()
    min_zoom = int(header["min_zoom"])
    top = int(header["max_zoom"]) if max_zoom is None else min(max_zoom, int(header["max_zoom"]))
    wanted = tiles_covering(extent, min_zoom, top)

    written = 0
    missing = 0
    with output.open("wb") as handle:
        writer = Writer(handle)
        for zoom, x, y in wanted:
            data = reader.get(zoom, x, y)
            if data is None:
                missing += 1
                continue
            writer.write_tile(zxy_to_tileid(zoom, x, y), data)
            written += 1
        if written == 0:
            raise RuntimeError("the source has no tiles for the site's extent")
        lon, lat = center if center is not None else extent.center
        out_header: dict[str, Any] = {
            "tile_type": header["tile_type"],
            "tile_compression": header["tile_compression"],
            "min_lon_e7": round(extent.west * 1e7),
            "min_lat_e7": round(extent.south * 1e7),
            "max_lon_e7": round(extent.east * 1e7),
            "max_lat_e7": round(extent.north * 1e7),
            "center_lon_e7": round(lon * 1e7),
            "center_lat_e7": round(lat * 1e7),
            "center_zoom": top if center_zoom is None else min(center_zoom, top),
        }
        out_metadata = dict(metadata)
        out_metadata["name"] = name
        out_metadata["openwalk:source"] = source
        out_metadata["openwalk:extent"] = [extent.west, extent.south, extent.east, extent.north]
        writer.finalize(out_header, out_metadata)

    return Extraction(
        tiles=written,
        missing=missing,
        min_zoom=min_zoom,
        max_zoom=top,
        extent=extent,
        attribution=str(metadata.get("attribution", "")),
    )
