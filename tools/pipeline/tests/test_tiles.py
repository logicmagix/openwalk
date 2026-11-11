import io
from pathlib import Path
from typing import Any

import pytest
from pmtiles.reader import MemorySource, Reader, all_tiles
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from openwalk_pipeline import tiles


def payload(z: int, x: int, y: int) -> bytes:
    return f"tile {z}/{x}/{y}".encode()


def planet_archive() -> bytes:
    """A complete pyramid for zooms 0 to 3, every tile holding its own address."""
    buffer = io.BytesIO()
    writer = Writer(buffer)
    entries = [(z, x, y) for z in range(4) for x in range(2**z) for y in range(2**z)]
    for z, x, y in sorted(entries, key=lambda zxy: zxy_to_tileid(*zxy)):
        writer.write_tile(zxy_to_tileid(z, x, y), payload(z, x, y))
    writer.finalize(
        {"tile_type": TileType.MVT, "tile_compression": Compression.NONE},
        {"name": "planet", "attribution": "© Someone", "vector_layers": [{"id": "roads"}]},
    )
    return buffer.getvalue()


@pytest.fixture
def planet() -> bytes:
    return planet_archive()


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def raise_for_status(self) -> None:
        pass


class FakeSession:
    """Serves byte ranges of an in-memory archive and counts the requests."""

    def __init__(self, archive: bytes) -> None:
        self.archive = archive
        self.calls: list[str] = []

    def get(self, url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
        start, end = headers["Range"].removeprefix("bytes=").split("-")
        self.calls.append(headers["Range"])
        assert "openwalk-pipeline" in headers["User-Agent"]
        return FakeResponse(self.archive[int(start) : int(end) + 1])


def test_tile_xy_known_positions() -> None:
    assert tiles.tile_xy(0.0, 0.0, 0) == (0, 0)
    assert tiles.tile_xy(0.0, 0.0, 1) == (1, 1)
    assert tiles.tile_xy(-0.1, 0.1, 1) == (0, 0)
    assert tiles.tile_xy(179.99, -80.0, 2) == (3, 3)
    # Positions beyond the projection's limit clamp to the edge tile.
    assert tiles.tile_xy(0.0, 89.0, 3) == (4, 0)


def test_tiles_covering_small_extent_is_one_tile_per_zoom() -> None:
    extent = tiles.Extent(west=10.0, south=10.0, east=10.01, north=10.01)
    found = tiles.tiles_covering(extent, 0, 3)
    assert [z for z, _, _ in found] == [0, 1, 2, 3]
    assert found[1] == (1, 1, 0)


def test_tiles_covering_extent_across_a_tile_boundary() -> None:
    extent = tiles.Extent(west=-1.0, south=-1.0, east=1.0, north=1.0)
    found = tiles.tiles_covering(extent, 1, 1)
    assert sorted(found) == [(1, 0, 0), (1, 0, 1), (1, 1, 0), (1, 1, 1)]


def test_tiles_covering_adds_a_ring_from_a_zoom_level_up() -> None:
    extent = tiles.Extent(west=10.0, south=10.0, east=10.01, north=10.01)
    found = tiles.tiles_covering(extent, 9, 10, ring_from=10, ring=2)
    # One tile below the ring's zoom; the site's tile and two more each way above it.
    assert [zxy for zxy in found if zxy[0] == 9] == [(9, *tiles.tile_xy(10.0, 10.0, 9))]
    ringed = [zxy for zxy in found if zxy[0] == 10]
    x, y = tiles.tile_xy(10.0, 10.0, 10)
    assert len(ringed) == 25
    assert {zxy[1] for zxy in ringed} == set(range(x - 2, x + 3))
    assert {zxy[2] for zxy in ringed} == set(range(y - 2, y + 3))


def test_tiles_covering_ring_stops_at_the_edge_of_the_world() -> None:
    extent = tiles.Extent(west=-179.9, south=84.0, east=-179.8, north=84.5)
    found = tiles.tiles_covering(extent, 3, 3, ring_from=0, ring=2)
    assert all(0 <= x <= 7 and 0 <= y <= 7 for _, x, y in found)
    assert len(found) == 9


def test_covered_extent_is_the_ground_under_one_zoom_level() -> None:
    found = [(1, 0, 0), (2, 1, 1), (2, 2, 1)]
    covered = tiles.covered_extent(found, 2)
    assert covered is not None
    assert (covered.west, covered.east) == (-90.0, 90.0)
    assert covered.south == pytest.approx(0.0, abs=1e-9)
    assert covered.north == pytest.approx(66.5133, abs=1e-3)
    assert tiles.covered_extent(found, 3) is None


def test_widest_view_zoom_follows_the_size_of_the_site() -> None:
    # About 1.1 km across at the equator.
    campus = tiles.Extent(west=0.0, south=0.0, east=0.01, north=0.005)
    # About 11 km long and thin.
    trail = tiles.Extent(west=0.0, south=0.0, east=0.1, north=0.001)
    assert tiles.widest_view_zoom(campus) == 13
    assert tiles.widest_view_zoom(trail) == tiles.widest_view_zoom(campus) - 4 + 1
    assert tiles.widest_view_zoom(tiles.Extent(1.0, 1.0, 1.0, 1.0)) == 0


def test_extract_rings_the_zoom_levels_the_app_can_show(planet: bytes, tmp_path: Path) -> None:
    # A tenth of the world wide: the app could zoom out to level 1 for it.
    extent = tiles.Extent(west=-18.0, south=-10.0, east=18.0, north=10.0)
    assert tiles.widest_view_zoom(extent) == 1
    result = tiles.extract(MemorySource(planet), extent, tmp_path / "out.pmtiles", name="n", source="s")
    found = {zxy for zxy, _ in all_tiles(MemorySource((tmp_path / "out.pmtiles").read_bytes()))}
    assert found == set(tiles.tiles_covering(extent, 0, 3, ring_from=1))
    # Zoom 3 has 8 tiles a side: the site's two middle columns and rows, ringed, fill 6 by 6.
    assert len([zxy for zxy in found if zxy[0] == 3]) == 36
    assert result.missing == 0


def test_extent_of_collections_and_expand() -> None:
    collections = [
        {"features": [{"geometry": {"type": "Point", "coordinates": [10.0, 50.0]}}]},
        {
            "features": [
                {"geometry": {"type": "LineString", "coordinates": [[10.5, 50.2], [10.2, 49.9]]}},
                {"geometry": {"type": "Polygon", "coordinates": [[[9.9, 50.0], [10.0, 50.1], [9.9, 50.0]]]}},
            ]
        },
    ]
    extent = tiles.extent_of(collections)
    assert extent is not None
    assert extent == tiles.Extent(west=9.9, south=49.9, east=10.5, north=50.2)
    grown = extent.expand(1000.0)
    assert grown.north - extent.north == pytest.approx(0.009, abs=0.0001)
    assert extent.west - grown.west == pytest.approx(0.014, abs=0.0005)
    assert tiles.extent_of([{"features": []}]) is None


def test_extract_writes_the_covering_tiles_and_the_ring(planet: bytes, tmp_path: Path) -> None:
    extent = tiles.Extent(west=-1.0, south=-1.0, east=1.0, north=1.0)
    output = tmp_path / "basemap.pmtiles"
    result = tiles.extract(
        MemorySource(planet), extent, output, name="Demo base map", source="memory", center=(0.0, 0.0), center_zoom=2
    )

    reader = Reader(MemorySource(output.read_bytes()))
    header = reader.header()
    assert header["min_zoom"] == 0
    assert header["max_zoom"] == 3
    assert header["tile_type"] == TileType.MVT
    assert header["tile_compression"] == Compression.NONE
    # The archive declares the ground its ringed level covers, not the bare extent:
    # six of zoom 3's eight columns, which is 270 degrees of longitude.
    assert header["min_lon_e7"] == -1_350_000_000
    assert header["max_lon_e7"] == 1_350_000_000
    assert header["max_lat_e7"] > 10_000_000
    assert header["center_zoom"] == 2

    found: dict[tuple[int, int, int], bytes] = {zxy: data for zxy, data in all_tiles(MemorySource(output.read_bytes()))}
    assert set(found) == set(tiles.tiles_covering(extent, 0, 3, ring_from=3))
    assert all(found[(z, x, y)] == payload(z, x, y) for z, x, y in found)
    assert len(found) == 1 + 4 + 4 + 36
    assert result.tiles == len(found)
    assert result.missing == 0
    assert result.attribution == "© Someone"

    metadata = reader.metadata()
    assert metadata["name"] == "Demo base map"
    assert metadata["attribution"] == "© Someone"
    assert metadata["vector_layers"] == [{"id": "roads"}]
    assert metadata["openwalk:source"] == "memory"


def test_extract_caps_zoom_and_reports_missing_tiles(planet: bytes, tmp_path: Path) -> None:
    extent = tiles.Extent(west=10.0, south=10.0, east=10.01, north=10.01)
    result = tiles.extract(MemorySource(planet), extent, tmp_path / "out.pmtiles", name="n", source="s", max_zoom=2)
    assert result.max_zoom == 2
    # One tile at zooms 0 and 1, and the whole of zoom 2: the ring reaches its edges.
    assert result.tiles == 1 + 1 + 16
    assert result.missing == 0


def test_extract_fails_when_nothing_covers_the_extent(tmp_path: Path) -> None:
    buffer = io.BytesIO()
    writer = Writer(buffer)
    writer.write_tile(zxy_to_tileid(3, 0, 0), b"corner")
    writer.finalize({"tile_type": TileType.MVT, "tile_compression": Compression.NONE}, {})
    extent = tiles.Extent(west=100.0, south=10.0, east=100.01, north=10.01)
    with pytest.raises(RuntimeError, match="no tiles"):
        tiles.extract(MemorySource(buffer.getvalue()), extent, tmp_path / "out.pmtiles", name="n", source="s")


def test_range_source_fetches_each_range_once(planet: bytes, tmp_path: Path) -> None:
    session = FakeSession(planet)
    source = tiles.RangeSource("https://example.test/planet.pmtiles", session)
    extent = tiles.Extent(west=10.0, south=10.0, east=10.01, north=10.01)
    result = tiles.extract(source.get_bytes, extent, tmp_path / "out.pmtiles", name="n", source="s")
    assert result.tiles == 28
    # Header, metadata and root directory once each, then one read per tile.
    assert source.requests == len(session.calls) == 3 + 28
    assert source.bytes == sum(len(source.cache[key]) for key in source.cache)


def test_range_source_rejects_a_short_response() -> None:
    class ShortSession:
        def get(self, url: str, *, headers: dict[str, str], timeout: float) -> FakeResponse:
            return FakeResponse(b"x")

    source = tiles.RangeSource("https://example.test/planet.pmtiles", ShortSession())
    with pytest.raises(RuntimeError, match="returned 1"):
        source.get_bytes(0, 127)


def test_extract_metadata_carries_the_extent(planet: bytes, tmp_path: Path) -> None:
    extent = tiles.Extent(west=10.0, south=10.0, east=10.01, north=10.01)
    output = tmp_path / "out.pmtiles"
    tiles.extract(MemorySource(planet), extent, output, name="n", source="s")
    metadata: dict[str, Any] = Reader(MemorySource(output.read_bytes())).metadata()
    assert metadata["openwalk:extent"] == [10.0, 10.0, 10.01, 10.01]
