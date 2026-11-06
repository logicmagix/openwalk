"""Loading a site directory: ``site.yaml`` plus the conventional file locations."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from openwalk_pipeline.validate import validate

BoundaryKind = Literal["osm_way", "osm_relation", "bbox"]

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
class Site:
    directory: Path
    id: str
    name: str
    boundary: Boundary
    walkway_highways: tuple[str, ...]
    config: dict[str, Any]

    @property
    def raw_dir(self) -> Path:
        return self.directory / "raw"

    @property
    def places_yaml_path(self) -> Path:
        return self.directory / "places.yaml"

    @property
    def walkways_path(self) -> Path:
        return self.directory / "walkways.geojson"

    @property
    def places_path(self) -> Path:
        return self.directory / "places.geojson"


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
    highways = tuple(walkways.get("highway", DEFAULT_WALKWAY_HIGHWAYS))
    return Site(
        directory=directory,
        id=config["id"],
        name=config["name"],
        boundary=parse_boundary(config["boundary"]),
        walkway_highways=highways,
        config=config,
    )
