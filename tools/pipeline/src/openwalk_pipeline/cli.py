"""Command-line entry point: ``openwalk-pipeline``."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import requests

from openwalk_pipeline import (
    __version__,
    debug,
    gaps,
    graph,
    imagery,
    osm,
    overlay,
    overpass,
    places,
    tiles,
    walkways,
)
from openwalk_pipeline.site import DEFAULT_MARGIN_M, Site, load_site
from openwalk_pipeline.validate import validate


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="openwalk-pipeline",
        description="Prepare a site's places, walkways and pedestrian graph.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    commands = parser.add_subparsers(dest="command", required=True)

    fetch = commands.add_parser("fetch", help="download OpenStreetMap data for the site boundary")
    fetch.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")
    fetch.add_argument("--refresh", action="store_true", help="ignore the cached result")
    fetch.add_argument("--endpoint", default=overpass.DEFAULT_ENDPOINT, help="Overpass API URL")

    build = commands.add_parser("build", help="generate the site's data files from the cache")
    build.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")

    basemap = commands.add_parser("tiles", help="extract the site's base map tiles into basemap.pmtiles")
    basemap.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")
    basemap.add_argument("--source", help="PMTiles archive URL, overriding tiles.source in site.yaml")
    basemap.add_argument("--max-zoom", type=int, help="highest zoom level to extract")

    photo = commands.add_parser(
        "imagery", help="fetch one aerial photograph of the site, to offer as a layer of the map"
    )
    photo.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")

    breaks = commands.add_parser(
        "gaps", help="list places where walkways nearly meet, or cross, without being joined"
    )
    breaks.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")
    breaks.add_argument(
        "--max-gap",
        type=float,
        default=gaps.DEFAULT_MAX_GAP_M,
        help="how close a dead end must be to another walkway to be listed, in meters",
    )
    breaks.add_argument(
        "--min-detour",
        type=float,
        default=gaps.DEFAULT_MIN_DETOUR_M,
        help="list a spot only when the walk round it today is at least this long, in meters",
    )

    check = commands.add_parser("debug", help="write a map page for checking the generated files by eye")
    check.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")
    check.add_argument("--out", type=Path, help="where to write the page (default: <site>/debug.html)")
    check.add_argument(
        "--max-gap",
        type=float,
        default=gaps.DEFAULT_MAX_GAP_M,
        help="draw a suspected gap when a dead end is this close to another walkway, in meters",
    )
    check.add_argument(
        "--min-detour",
        type=float,
        default=gaps.DEFAULT_MIN_DETOUR_M,
        help="draw a suspected gap only when the walk round it today is at least this long, in meters",
    )
    return parser


def write_json(path: Path, data: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
        handle.write("\n")


def run_fetch(site: Site, *, refresh: bool, endpoint: str) -> int:
    query = overpass.build_query(site.boundary)
    result = overpass.fetch(query, site.raw_dir, endpoint=endpoint, refresh=refresh)
    print(f"{site.id}: {len(result['elements'])} elements in {site.raw_dir / overpass.CACHE_NAME}")
    return 0


def run_build(site: Site) -> int:
    cache = site.raw_dir / overpass.CACHE_NAME
    if not cache.exists():
        print(f"{site.id}: no cached data; run 'openwalk-pipeline fetch' first", file=sys.stderr)
        return 1
    with cache.open(encoding="utf-8") as handle:
        elements: list[dict[str, Any]] = json.load(handle)["elements"]

    # The browser reads the configuration as JSON; site.yaml stays the file people edit.
    write_json(site.site_json_path, site.config)

    conversion = osm.convert(elements)
    for skipped in conversion.skipped:
        print(f"{site.id}: skipped {skipped} (no usable geometry)", file=sys.stderr)

    by_osm_id = {feature["id"]: feature for feature in conversion.features}

    selection = walkways.select_walkways(
        conversion.features, site.walkway_highways, site.unpaved, site.parking_aisles, site.roads
    )
    for excluded in selection.excluded:
        print(f"{site.id}: excluded {excluded}", file=sys.stderr)
    walkway_collection = selection.collection
    if site.walkways_yaml_path.exists():
        hand = walkways.load_walkways_yaml(site.walkways_yaml_path)
        walkway_collection = walkways.merge(walkway_collection, hand)
        print(f"{site.id}: {len(hand)} hand-drawn walkways from {site.walkways_yaml_path}")
    validate(walkway_collection, "walkways")
    write_json(site.walkways_path, walkway_collection)
    print(f"{site.id}: {len(walkway_collection['features'])} walkways in {site.walkways_path}")

    curated: list[dict[str, Any]] = []
    if site.places_yaml_path.exists():
        curated = places.load_places_yaml(site.places_yaml_path)
        collection = places.build_places(curated, conversion.features)
        validate(collection, "places")
        write_json(site.places_path, collection)
        print(f"{site.id}: {len(collection['features'])} places in {site.places_path}")

    built = graph.build_graph(
        walkway_collection, curated, by_osm_id, site.max_connector_m, site.snap_m, site.join_crossings
    )
    for warning in built.warnings:
        print(f"{site.id}: {warning}", file=sys.stderr)
    validate(built.document, "graph")
    write_json(site.graph_path, built.document)
    document = built.document
    print(
        f"{site.id}: graph with {len(document['nodes'])} nodes and {len(document['edges'])} edges"
        f" in {built.component_count} connected pieces, in {site.graph_path}"
    )
    if built.joined_crossings:
        print(f"{site.id}: joined {built.joined_crossings} places where walkways cross at ground level")
    if built.unreachable:
        print(f"{site.id}: unreachable from the main network: {', '.join(built.unreachable)}", file=sys.stderr)

    # The aerial photograph, once fetched, is offered first; the site's own maps follow.
    entries: list[dict[str, Any]] = []
    image_path, description_path = imagery.paths(site.directory)
    if site.imagery is not None and image_path.exists() and description_path.exists():
        with description_path.open(encoding="utf-8") as handle:
            entries.append(imagery.overlay_entry(site.imagery, json.load(handle)))
        print(f"{site.id}: overlay {imagery.OVERLAY_ID} from {image_path}")
    elif site.imagery is not None:
        print(f"{site.id}: no aerial photograph yet; run 'openwalk-pipeline imagery'", file=sys.stderr)
    if site.overlays:
        fitted = overlay.build_overlays(site.overlays, site.directory, by_osm_id)["overlays"]
        for entry in fitted:
            fit = entry["fit"]
            print(
                f"{site.id}: overlay {entry['id']} fitted from {fit['control_points']} points,"
                f" rms {fit['rms_m']} m, max {fit['max_m']} m"
            )
        entries.extend(fitted)
    if entries:
        document = {"overlays": entries}
        validate(document, "overlays")
        write_json(site.overlays_path, document)
    return 0


def site_extent(site: Site) -> tiles.Extent | None:
    """The box around the site's walkways and places, or its bounding box if it has neither yet."""
    collections: list[dict[str, Any]] = []
    for path in (site.walkways_path, site.places_path):
        if path.exists():
            with path.open(encoding="utf-8") as handle:
                collections.append(json.load(handle))
    extent = tiles.extent_of(collections)
    if extent is None and site.boundary.kind == "bbox":
        south, west, north, east = (float(v) for v in site.boundary.value)  # type: ignore[union-attr]
        extent = tiles.Extent(west, south, east, north)
    return extent


def run_imagery(site: Site, session: imagery.Fetcher | None = None) -> int:
    config = site.imagery
    if config is None:
        print(f"{site.id}: no imagery in site.yaml", file=sys.stderr)
        return 1
    extent = site_extent(site)
    if extent is None:
        print(f"{site.id}: nothing to cover; run 'openwalk-pipeline build' first", file=sys.stderr)
        return 1
    asked = float(config.get("resolution_m", imagery.DEFAULT_RESOLUTION_M))
    planned = imagery.plan(extent.expand(float(config.get("margin_m", imagery.DEFAULT_MARGIN_M))), asked)
    picture = imagery.fetch(config["source"], planned, session or requests.Session())
    image_path, description_path = imagery.paths(site.directory)
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image_path.write_bytes(picture)
    write_json(description_path, imagery.describe(planned, config["source"]))
    print(
        f"{site.id}: aerial photograph {planned.width} x {planned.height} px at"
        f" {planned.resolution_m} m per pixel, {len(picture) / 1e6:.1f} MB, in {image_path}"
    )
    if planned.resolution_m > asked:
        print(f"{site.id}: the site is too large for {asked} m per pixel in one picture", file=sys.stderr)
    print(f"{site.id}: run 'openwalk-pipeline build' to offer it as a layer")
    return 0


def run_tiles(site: Site, *, source: str | None, max_zoom: int | None, session: tiles.RangeFetcher | None = None) -> int:
    url = source or (site.tiles.source if site.tiles else None)
    if url is None:
        print(f"{site.id}: no tiles.source in site.yaml and no --source given", file=sys.stderr)
        return 1
    margin = site.tiles.margin_m if site.tiles else DEFAULT_MARGIN_M
    if max_zoom is None and site.tiles:
        max_zoom = site.tiles.max_zoom

    extent = site_extent(site)
    if extent is None:
        print(f"{site.id}: nothing to cover; run 'openwalk-pipeline build' first", file=sys.stderr)
        return 1
    view_extent = extent.expand(tiles.VIEW_MARGIN_M)
    extent = extent.expand(margin)

    view = site.view
    fetcher = tiles.RangeSource(url, session or requests.Session())
    result = tiles.extract(
        fetcher.get_bytes,
        extent,
        site.basemap_path,
        name=f"{site.name} base map",
        source=url,
        max_zoom=max_zoom,
        view=view_extent,
        center=view[0] if view else None,
        center_zoom=round(view[1]) if view else None,
    )
    size_kb = site.basemap_path.stat().st_size / 1024
    print(
        f"{site.id}: {result.tiles} tiles, zoom {result.min_zoom} to {result.max_zoom}, {size_kb:.0f} KB"
        f" in {site.basemap_path} ({fetcher.requests} requests, {fetcher.bytes / 1024:.0f} KB read)"
    )
    if result.missing:
        print(f"{site.id}: {result.missing} tiles missing from the source", file=sys.stderr)
    return 0


def run_gaps(site: Site, *, max_gap_m: float, min_detour_m: float) -> int:
    if not site.graph_path.exists():
        print(f"{site.id}: no graph; run 'openwalk-pipeline build' first", file=sys.stderr)
        return 1
    with site.graph_path.open(encoding="utf-8") as handle:
        document: dict[str, Any] = json.load(handle)
    found = gaps.find_gaps(document, max_gap_m, min_detour_m)
    if not found:
        print(f"{site.id}: no suspected gaps in the walkway network")
        return 0
    print(f"{site.id}: {len(found)} suspected gaps in the walkway network, longest way round first")
    for number, gap in enumerate(found, start=1):
        print(gaps.describe(number, gap))
    print("The debug page shows each one by its number.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    site = load_site(args.site)
    if args.command == "fetch":
        return run_fetch(site, refresh=args.refresh, endpoint=args.endpoint)
    if args.command == "tiles":
        return run_tiles(site, source=args.source, max_zoom=args.max_zoom)
    if args.command == "imagery":
        return run_imagery(site)
    if args.command == "gaps":
        return run_gaps(site, max_gap_m=args.max_gap, min_detour_m=args.min_detour)
    if args.command == "debug":
        path = debug.write(site, args.out, args.max_gap, args.min_detour)
        print(f"{site.id}: wrote {path}; open it in a browser")
        return 0
    return run_build(site)


if __name__ == "__main__":
    sys.exit(main())
