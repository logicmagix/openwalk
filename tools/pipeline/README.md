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
