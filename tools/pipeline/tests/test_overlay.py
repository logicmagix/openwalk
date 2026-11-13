import math
import struct
import zlib
from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import osm, overlay
from openwalk_pipeline.validate import validate


def write_png(path: Path, width: int, height: int) -> None:
    """A minimal valid PNG: enough header for the size reader, one gray row repeated."""
    raw = b"".join(b"\x00" + b"\x80" * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    path.write_bytes(
        overlay.PNG_SIGNATURE + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    )


def test_png_size_reads_the_header(tmp_path: Path) -> None:
    write_png(tmp_path / "map.png", 40, 30)
    assert overlay.png_size(tmp_path / "map.png") == (40, 30)


def test_png_size_rejects_other_files(tmp_path: Path) -> None:
    (tmp_path / "map.png").write_bytes(b"not a png")
    with pytest.raises(overlay.OverlayError, match="not a PNG"):
        overlay.png_size(tmp_path / "map.png")


def synthetic_pairs() -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Pixels placed on a known map: north is to the right, 0.5 m per pixel."""
    lon0, lat0 = 20.0, 10.0
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = m_per_deg_lat * math.cos(math.radians(lat0))
    pairs: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for px, py in [(0, 0), (400, 0), (400, 300), (0, 300), (200, 150), (100, 250)]:
        east_m, north_m = py * 0.5, px * 0.5  # row runs east, column runs north
        pairs.append(((px, py), (lon0 + east_m / m_per_deg_lon, lat0 + north_m / m_per_deg_lat)))
    return pairs


def test_fit_recovers_an_exact_affine() -> None:
    fit = overlay.fit_affine(synthetic_pairs(), width=400, height=300)
    assert fit.count == 6
    assert fit.rms_m < 0.01 and fit.max_m < 0.01
    top_left, top_right, bottom_right, bottom_left = fit.corners
    assert top_left == pytest.approx([20.0, 10.0], abs=1e-6)
    assert top_right[1] > top_left[1] and top_right[0] == pytest.approx(top_left[0], abs=1e-6)
    assert bottom_left[0] > top_left[0] and bottom_left[1] == pytest.approx(top_left[1], abs=1e-6)
    assert bottom_right[0] == pytest.approx(bottom_left[0], abs=1e-6)


def test_fit_reports_residuals_when_a_point_is_off() -> None:
    pairs = synthetic_pairs()
    (px, py), (lon, lat) = pairs[4]
    pairs[4] = ((px, py), (lon, lat + 20 / 111_320.0))  # moved 20 m north
    fit = overlay.fit_affine(pairs, width=400, height=300)
    assert 5 < fit.max_m < 20
    assert 0 < fit.rms_m < fit.max_m


def test_fit_rejects_too_few_or_collinear_points() -> None:
    pairs = synthetic_pairs()
    with pytest.raises(overlay.OverlayError, match="three"):
        overlay.fit_affine(pairs[:2], width=400, height=300)
    with pytest.raises(overlay.OverlayError, match="collinear"):
        overlay.fit_affine([pairs[0], pairs[1], ((800, 0), (20.0, 10.0036))], width=400, height=300)


def test_build_overlays_resolves_osm_references(tmp_path: Path, overpass_small: dict[str, Any]) -> None:
    write_png(tmp_path / "map.png", 100, 100)
    features = osm.convert(overpass_small["elements"]).features
    by_osm_id = {f["id"]: f for f in features}
    config = [
        {
            "id": "sketch",
            "name": "Sketch",
            "image": "map.png",
            "attribution": "Someone",
            "control_points": [
                {"pixel": [10, 10], "osm": "node/1"},
                {"pixel": [50, 80], "osm": "way/12"},
                {"pixel": [90, 20], "osm": "node/2"},
                {"pixel": [60, 60], "position": [20.0012, 10.0012]},
            ],
        }
    ]
    document = overlay.build_overlays(config, tmp_path, by_osm_id)
    validate(document, "overlays")
    entry = document["overlays"][0]
    assert (entry["width"], entry["height"]) == (100, 100)
    assert entry["attribution"] == "Someone"
    assert entry["fit"]["control_points"] == 4
    assert len(entry["corners"]) == 4


def test_build_overlays_reports_missing_image_and_reference(tmp_path: Path) -> None:
    config: list[dict[str, Any]] = [{"id": "x", "name": "X", "image": "missing.png", "control_points": []}]
    with pytest.raises(overlay.OverlayError, match="not found"):
        overlay.build_overlays(config, tmp_path, {})
    write_png(tmp_path / "missing.png", 10, 10)
    config[0]["control_points"] = [{"pixel": [0, 0], "osm": "way/999"}] * 3
    with pytest.raises(overlay.OverlayError, match="way/999"):
        overlay.build_overlays(config, tmp_path, {})
