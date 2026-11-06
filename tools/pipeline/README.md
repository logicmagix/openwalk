# OpenWalk data pipeline

Build-time scripts that turn a site's configuration and OpenStreetMap data into the
files the app serves: `places.geojson`, `walkways.geojson`, `graph.json` and the base
map `basemap.pmtiles` under `sites/<site-id>/`. The output is committed, so the running
application never needs Python or network access.

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
.venv/bin/openwalk-pipeline tiles sites/<site-id>
.venv/bin/openwalk-pipeline debug sites/<site-id>
```

`tiles` writes `basemap.pmtiles`, the site's base map. A PMTiles archive is a single
file holding map tiles with an index at the front, so a plain file server can serve it
and a client fetches only the tiles it needs by HTTP range request. The command reads a
planet-wide archive the same way: from the URL in `tiles.source` in `site.yaml` it takes
only the tiles covering the site's walkways and places, plus a margin, at every zoom
level, and copies them unchanged. A campus comes to a few megabytes and about thirty
tiles. Dated Protomaps basemap builds (`https://build.protomaps.com/<date>.pmtiles`)
are a suitable source; the attribution they carry is kept in the output and the app
shows it.

`debug` writes `debug.html` into the site directory: a map of the generated files over
satellite imagery for checking by eye. The root README describes the whole process of
adding a site.
