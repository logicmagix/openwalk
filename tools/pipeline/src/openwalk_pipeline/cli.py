"""Command-line entry point: ``openwalk-pipeline``."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from openwalk_pipeline import __version__, osm, overpass, walkways
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

    collection = walkways.select_walkways(conversion.features, site.walkway_highways)
    validate(collection, "walkways")
    write_json(site.walkways_path, collection)
    print(f"{site.id}: {len(collection['features'])} walkways in {site.walkways_path}")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    site = load_site(args.site)
    if args.command == "fetch":
        return run_fetch(site, refresh=args.refresh, endpoint=args.endpoint)
    return run_build(site)


if __name__ == "__main__":
    sys.exit(main())
