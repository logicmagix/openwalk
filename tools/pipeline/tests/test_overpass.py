import json
from pathlib import Path
from typing import Any

import pytest

from openwalk_pipeline import overpass
from openwalk_pipeline.site import Boundary


class FakeResponse:
    def __init__(self, payload: dict[str, Any], status: int = 200) -> None:
        self.payload = payload
        self.status = status

    def raise_for_status(self) -> None:
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    def json(self) -> dict[str, Any]:
        return self.payload


class FakeSession:
    """Records every request so a test can assert how often the network was used."""

    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def post(self, url: str, *, data: dict[str, str], headers: dict[str, str], timeout: float) -> FakeResponse:
        self.calls.append({"url": url, "data": data, "headers": headers, "timeout": timeout})
        return FakeResponse(self.payload)


def test_query_for_way_boundary_uses_map_to_area() -> None:
    query = overpass.build_query(Boundary("osm_way", 42))
    assert "way(42)->.boundary;" in query
    assert "map_to_area->.a;" in query
    assert 'way["highway"](area.a);' in query
    assert query.rstrip().endswith("out geom;")


def test_query_for_relation_boundary() -> None:
    assert "rel(7)->.boundary;" in overpass.build_query(Boundary("osm_relation", 7))


def test_query_for_bbox_uses_global_bbox_setting() -> None:
    query = overpass.build_query(Boundary("bbox", (10.0, 20.0, 10.1, 20.1)))
    assert "[bbox:10.0,20.0,10.1,20.1]" in query
    assert "(area.a)" not in query
    assert 'way["highway"];' in query


def test_fetch_writes_cache_and_query(tmp_path: Path, overpass_small: dict[str, Any]) -> None:
    session = FakeSession(overpass_small)
    result = overpass.fetch("QUERY", tmp_path, session=session)
    assert result == overpass_small
    assert len(session.calls) == 1
    assert session.calls[0]["data"] == {"data": "QUERY"}
    assert session.calls[0]["headers"]["User-Agent"].startswith("openwalk-pipeline/")
    assert (tmp_path / overpass.QUERY_NAME).read_text() == "QUERY"
    assert json.loads((tmp_path / overpass.CACHE_NAME).read_text()) == overpass_small


def test_fetch_reuses_cache_for_same_query(tmp_path: Path, overpass_small: dict[str, Any]) -> None:
    session = FakeSession(overpass_small)
    overpass.fetch("QUERY", tmp_path, session=session)
    overpass.fetch("QUERY", tmp_path, session=session)
    assert len(session.calls) == 1


def test_fetch_refetches_when_query_changes_or_refresh_is_set(
    tmp_path: Path, overpass_small: dict[str, Any]
) -> None:
    session = FakeSession(overpass_small)
    overpass.fetch("QUERY", tmp_path, session=session)
    overpass.fetch("OTHER", tmp_path, session=session)
    overpass.fetch("OTHER", tmp_path, session=session, refresh=True)
    assert len(session.calls) == 3


def test_fetch_rejects_malformed_response(tmp_path: Path) -> None:
    session = FakeSession({"remark": "runtime error"})
    with pytest.raises(ValueError, match="elements"):
        overpass.fetch("QUERY", tmp_path, session=session)
    assert not (tmp_path / overpass.CACHE_NAME).exists()
