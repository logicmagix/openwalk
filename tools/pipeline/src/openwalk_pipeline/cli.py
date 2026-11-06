"""Command-line entry point: ``openwalk-pipeline``."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from openwalk_pipeline import __version__, debug, graph, osm, overlay, overpass, places, walkways
from openwalk_pipeline.site import Site, load_site
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

    check = commands.add_parser("debug", help="write a map page for checking the generated files by eye")
    check.add_argument("site", type=Path, help="site directory, for example sites/<site-id>")
    check.add_argument("--out", type=Path, help="where to write the page (default: <site>/debug.html)")
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
    conversion = osm.convert(elements)
    for skipped in conversion.skipped:
        print(f"{site.id}: skipped {skipped} (no usable geometry)", file=sys.stderr)

    by_osm_id = {feature["id"]: feature for feature in conversion.features}

    selection = walkways.select_walkways(
        conversion.features, site.walkway_highways, site.unpaved, site.parking_aisles
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

    built = graph.build_graph(walkway_collection, curated, by_osm_id, site.max_connector_m, site.snap_m)
    for warning in built.warnings:
        print(f"{site.id}: {warning}", file=sys.stderr)
    validate(built.document, "graph")
    write_json(site.graph_path, built.document)
    document = built.document
    print(
        f"{site.id}: graph with {len(document['nodes'])} nodes and {len(document['edges'])} edges"
        f" in {built.component_count} connected pieces, in {site.graph_path}"
    )
    if built.unreachable:
        print(f"{site.id}: unreachable from the main network: {', '.join(built.unreachable)}", file=sys.stderr)

    if site.overlays:
        document = overlay.build_overlays(site.overlays, site.directory, by_osm_id)
        validate(document, "overlays")
        write_json(site.overlays_path, document)
        for entry in document["overlays"]:
            fit = entry["fit"]
            print(
                f"{site.id}: overlay {entry['id']} fitted from {fit['control_points']} points,"
                f" rms {fit['rms_m']} m, max {fit['max_m']} m"
            )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    site = load_site(args.site)
    if args.command == "fetch":
        return run_fetch(site, refresh=args.refresh, endpoint=args.endpoint)
    if args.command == "debug":
        path = debug.write(site, args.out)
        print(f"{site.id}: wrote {path}; open it in a browser")
        return 0
    return run_build(site)


if __name__ == "__main__":
    sys.exit(main())
