"""Loading a site directory: ``site.yaml`` plus the conventional file locations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from openwalk_pipeline.validate import validate
from openwalk_pipeline.walkways import DEFAULT_ROADS, DEFAULT_UNPAVED

BoundaryKind = Literal["osm_way", "osm_relation", "bbox"]

# A place whose entrance lies further than this from a walkway probably needs a
# hand-placed entrance; the build reports it.
DEFAULT_MAX_CONNECTOR_M = 30.0

# A hand-drawn walkway's end within this distance of a mapped walkway is joined to it.
DEFAULT_SNAP_M = 5.0

# How far beyond the site's data the base map extract reaches.
DEFAULT_MARGIN_M = 500.0

# Highway values that pedestrians may use, unless the site overrides the list.
DEFAULT_WALKWAY_HIGHWAYS: tuple[str, ...] = (
    "footway",
    "path",
    "steps",
    "pedestrian",
    "corridor",
    "living_street",
)


@dataclass(frozen=True)
class Boundary:
    """The region to fetch: an OpenStreetMap way or relation id, or a bbox (S, W, N, E)."""

    kind: BoundaryKind
    value: int | tuple[float, float, float, float]


@dataclass(frozen=True)
class Tiles:
    """Where the base map is extracted from and how far it reaches."""

    source: str
    margin_m: float
    max_zoom: int | None


@dataclass(frozen=True)
class Site:
    directory: Path
    id: str
    name: str
    boundary: Boundary
    walkway_highways: tuple[str, ...]
    unpaved: tuple[str, ...]
    max_connector_m: float
    snap_m: float
    parking_aisles: bool
    roads: tuple[str, ...]
    tiles: Tiles | None
    config: dict[str, Any]

    @property
    def raw_dir(self) -> Path:
        return self.directory / "raw"

    @property
    def places_yaml_path(self) -> Path:
        return self.directory / "places.yaml"

    @property
    def walkways_yaml_path(self) -> Path:
        return self.directory / "walkways.yaml"

    @property
    def walkways_path(self) -> Path:
        return self.directory / "walkways.geojson"

    @property
    def places_path(self) -> Path:
        return self.directory / "places.geojson"

    @property
    def overlays_path(self) -> Path:
        return self.directory / "overlays.json"

    @property
    def graph_path(self) -> Path:
        return self.directory / "graph.json"

    @property
    def basemap_path(self) -> Path:
        return self.directory / "basemap.pmtiles"

    @property
    def view(self) -> tuple[tuple[float, float], float] | None:
        """The default view as ((lon, lat), zoom), if the site sets one."""
        view = self.config.get("view")
        if view is None:
            return None
        return ((float(view["center"][0]), float(view["center"][1])), float(view["zoom"]))

    @property
    def overlays(self) -> list[dict[str, Any]]:
        return list(self.config.get("overlays", []))


def parse_boundary(config: dict[str, Any]) -> Boundary:
    if "osm_way" in config:
        return Boundary("osm_way", int(config["osm_way"]))
    if "osm_relation" in config:
        return Boundary("osm_relation", int(config["osm_relation"]))
    south, west, north, east = (float(v) for v in config["bbox"])
    return Boundary("bbox", (south, west, north, east))


def load_site(directory: Path) -> Site:
    """Read and validate ``site.yaml``; the directory name must equal the site id."""
    with (directory / "site.yaml").open(encoding="utf-8") as handle:
        config: dict[str, Any] = yaml.safe_load(handle)
    validate(config, "site")
    if config["id"] != directory.name:
        raise ValueError(f"site id {config['id']!r} does not match directory {directory.name!r}")
    walkways: dict[str, Any] = config.get("walkways", {})
    tiles_config: dict[str, Any] | None = config.get("tiles")
    tiles = None
    if tiles_config is not None:
        max_zoom = tiles_config.get("max_zoom")
        tiles = Tiles(
            source=str(tiles_config["source"]),
            margin_m=float(tiles_config.get("margin_m", DEFAULT_MARGIN_M)),
            max_zoom=None if max_zoom is None else int(max_zoom),
        )
    return Site(
        directory=directory,
        id=config["id"],
        name=config["name"],
        boundary=parse_boundary(config["boundary"]),
        walkway_highways=tuple(walkways.get("highway", DEFAULT_WALKWAY_HIGHWAYS)),
        unpaved=tuple(walkways.get("unpaved", DEFAULT_UNPAVED)),
        max_connector_m=float(walkways.get("max_connector_m", DEFAULT_MAX_CONNECTOR_M)),
        snap_m=float(walkways.get("snap_m", DEFAULT_SNAP_M)),
        parking_aisles=bool(walkways.get("parking_aisles", True)),
        roads=tuple(walkways.get("roads", DEFAULT_ROADS)),
        tiles=tiles,
        config=config,
    )
