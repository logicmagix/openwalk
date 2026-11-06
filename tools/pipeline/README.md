# OpenWalk data pipeline

Build-time scripts that turn a site's configuration and OpenStreetMap data into the
files the app serves: `places.geojson`, `walkways.geojson`, and `graph.json` under
`sites/<site-id>/`. The output is committed, so the running application never needs
Python or network access.

## Setup

Requires Python 3.12 or newer. From this directory:

```
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
```

## Checks

```
.venv/bin/pytest
.venv/bin/pyright
```

Tests use small fixtures and never reach the network.

## Usage

Each command takes a site directory. `fetch` downloads OpenStreetMap data for the
boundary in `site.yaml` and caches it in `raw/`; it never contacts the network again
for the same query unless `--refresh` is given. `build` turns the cached data into the
generated files and validates each against the schemas in `packages/schema/schemas/`.

```
.venv/bin/openwalk-pipeline fetch sites/<site-id>
.venv/bin/openwalk-pipeline build sites/<site-id>
```
