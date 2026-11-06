"""Command-line entry point: ``openwalk-pipeline``."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from openwalk_pipeline import __version__


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="openwalk-pipeline",
        description="Prepare a site's places, walkways and pedestrian graph.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    parser.parse_args(argv)
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
