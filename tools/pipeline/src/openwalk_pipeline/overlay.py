"""Georeferencing a site's own map image so the app can draw it over the base map.

The image is tied to the ground by control points: a pixel in the image paired with the
feature it depicts. An affine transform from pixels to a local metric plane is fitted by
least squares, which absorbs rotation, uneven scale and shear, and the image's four
corners are mapped through it. Residuals are reported in metres so a schematic map's
distortion is visible rather than hidden.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from pyproj import Transformer
from shapely.geometry import shape

JsonObject = dict[str, Any]

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class OverlayError(ValueError):
    """An overlay cannot be georeferenced from its configuration."""


@dataclass(frozen=True)
class Fit:
    corners: list[list[float]]
    rms_m: float
    max_m: float
    count: int


def png_size(path: Path) -> tuple[int, int]:
    """Read width and height from a PNG header without decoding the image."""
    with path.open("rb") as handle:
        header = handle.read(24)
    if header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise OverlayError(f"{path} is not a PNG file")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _feature_position(feature: JsonObject) -> tuple[float, float]:
    geometry = feature["geometry"]
    if geometry["type"] == "Point":
        return float(geometry["coordinates"][0]), float(geometry["coordinates"][1])
    point = shape(geometry).centroid
    return point.x, point.y


def resolve_control_points(
    control_points: list[JsonObject], by_osm_id: dict[str, JsonObject]
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Return (pixel, (lon, lat)) pairs, looking up OpenStreetMap references."""
    pairs: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for point in control_points:
        pixel = (float(point["pixel"][0]), float(point["pixel"][1]))
        if "position" in point:
            position = (float(point["position"][0]), float(point["position"][1]))
        else:
            feature = by_osm_id.get(point["osm"])
            if feature is None:
                raise OverlayError(f"control point refers to {point['osm']}, which is not in the fetched data")
            position = _feature_position(feature)
        pairs.append((pixel, position))
    return pairs


def fit_affine(
    pairs: list[tuple[tuple[float, float], tuple[float, float]]], width: int, height: int
) -> Fit:
    """Fit pixel -> ground and return the image corners with the fit's residuals."""
    if len(pairs) < 3:
        raise OverlayError("at least three control points are needed")
    lon0 = sum(p[1][0] for p in pairs) / len(pairs)
    lat0 = sum(p[1][1] for p in pairs) / len(pairs)
    # A local azimuthal equidistant plane: metres, centred on the control points, so
    # the least-squares fit and its residuals are in metres rather than degrees.
    local = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +units=m +datum=WGS84"
    to_local = Transformer.from_crs("EPSG:4326", local, always_xy=True)
    to_lonlat = Transformer.from_crs(local, "EPSG:4326", always_xy=True)

    pixels = np.array([[px, py, 1.0] for (px, py), _ in pairs])
    ground = np.array([to_local.transform(lon, lat) for _, (lon, lat) in pairs])
    coefficients, _, rank, _ = np.linalg.lstsq(pixels, ground, rcond=None)
    if rank < 3:
        raise OverlayError("control points are collinear; spread them across the image")

    residuals = np.linalg.norm(pixels @ coefficients - ground, axis=1)
    corner_pixels = np.array([[0, 0, 1.0], [width, 0, 1.0], [width, height, 1.0], [0, height, 1.0]])
    corners: list[list[float]] = []
    for x, y in corner_pixels @ coefficients:
        lon, lat = to_lonlat.transform(x, y)
        corners.append([round(float(lon), 7), round(float(lat), 7)])
    return Fit(
        corners=corners,
        rms_m=round(float(np.sqrt(np.mean(residuals**2))), 1),
        max_m=round(float(residuals.max()), 1),
        count=len(pairs),
    )


def build_overlays(
    overlays: list[JsonObject], site_dir: Path, by_osm_id: dict[str, JsonObject]
) -> JsonObject:
    """Return the overlays document for ``overlays.json``."""
    output: list[JsonObject] = []
    for overlay in overlays:
        image = site_dir / overlay["image"]
        if not image.exists():
            raise OverlayError(f"overlay image {overlay['image']} not found")
        width, height = png_size(image)
        fit = fit_affine(resolve_control_points(overlay["control_points"], by_osm_id), width, height)
        entry: JsonObject = {
            "id": overlay["id"],
            "name": overlay["name"],
            "image": overlay["image"],
            "width": width,
            "height": height,
            "corners": fit.corners,
            "fit": {"control_points": fit.count, "rms_m": fit.rms_m, "max_m": fit.max_m},
        }
        if "attribution" in overlay:
            entry["attribution"] = overlay["attribution"]
        output.append(entry)
    return {"overlays": output}
