"""Fetching OpenStreetMap data for a site boundary through the Overpass API.

Results are cached in the site's ``raw/`` directory. Overpass asks that clients send
one request at a time and keep what they receive, and the cache does both: the pipeline
can be rerun as often as needed without touching the network.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Protocol

import requests

from openwalk_pipeline import __version__
from openwalk_pipeline.site import Boundary

DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = f"openwalk-pipeline/{__version__} (https://openwalk.app)"
CACHE_NAME = "overpass.json"
QUERY_NAME = "overpass.ql"

# Everything the pipeline may need about a site: buildings and their entrances, every
# highway (filtered into walkways later), parking, and point features such as
# emergency call boxes and amenities. ``out geom`` inlines coordinates so no second
# request is needed to resolve node references.
QUERY_BODY = """(
  way["building"]{area};
  relation["building"]{area};
  way["highway"]{area};
  way["amenity"]{area};
  way["leisure"]{area};
  node["amenity"]{area};
  node["emergency"]{area};
  node["entrance"]{area};
);
out geom;
"""


class Fetcher(Protocol):
    """The part of ``requests.Session`` the fetch uses; tests supply a fake."""

    def post(self, url: str, *, data: dict[str, str], headers: dict[str, str], timeout: float) -> Any: ...


def build_query(boundary: Boundary, timeout: int = 90) -> str:
    """Return the Overpass QL text for the given boundary."""
    if boundary.kind == "bbox":
        south, west, north, east = boundary.value  # type: ignore[misc]
        header = f"[out:json][timeout:{timeout}][bbox:{south},{west},{north},{east}];\n"
        area = ""
    else:
        element = "way" if boundary.kind == "osm_way" else "rel"
        header = f"[out:json][timeout:{timeout}];\n{element}({boundary.value})->.boundary;\n.boundary map_to_area->.a;\n"
        area = "(area.a)"
    return header + QUERY_BODY.replace("{area}", area)


def fetch(
    query: str,
    raw_dir: Path,
    *,
    endpoint: str = DEFAULT_ENDPOINT,
    refresh: bool = False,
    session: Fetcher | None = None,
    timeout: float = 120.0,
) -> dict[str, Any]:
    """Return the Overpass result for ``query``, from ``raw_dir`` when cached.

    The query text is saved beside the result so a reader can see what produced it.
    A cached result is reused unless ``refresh`` is set or the saved query differs.
    """
    raw_dir.mkdir(parents=True, exist_ok=True)
    cache_path = raw_dir / CACHE_NAME
    query_path = raw_dir / QUERY_NAME

    cached_query = query_path.read_text(encoding="utf-8") if query_path.exists() else None
    if cache_path.exists() and cached_query == query and not refresh:
        with cache_path.open(encoding="utf-8") as handle:
            return json.load(handle)

    http = session or requests.Session()
    response = http.post(
        endpoint, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=timeout
    )
    response.raise_for_status()
    result: dict[str, Any] = response.json()
    if "elements" not in result:
        raise ValueError("Overpass response has no 'elements' key")

    query_path.write_text(query, encoding="utf-8")
    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    return result
