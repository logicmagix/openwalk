# Architecture

This document records the technical decisions behind OpenWalk and the reasons for them.

## Map library: MapLibre GL JS with self-hosted PMTiles

Why: the app works offline after first load (R11) and does not leak user activity to
third parties (R16, R19). OpenStreetMap's raster tile policy forbids offline caching,
so the clean path is vector tiles in a single PMTiles file per site, extracted once
(Protomaps basemap build, a few MB for a typical site) and served from the project's
own container. MapLibre reads PMTiles natively through the `pmtiles` protocol, renders
a georeferenced image overlay for a site's official map image (R9), and can rotate the
map to the walking heading (R7). Rejected: Leaflet. Smaller and simpler, but offline
vector tiles need a less mature plugin and rotation is not supported.

Costs accepted: about 250 KB more JavaScript on first load (cached afterwards),
somewhat higher battery use from WebGL while the map is open, and a steeper learning
curve around the style JSON. All MapLibre calls pass through `apps/web/src/map/`
(a small adapter) so the rest of the app never imports MapLibre directly.

## Frontend: TypeScript, no framework, Vite build

Why: a handful of controls around a map does not justify React. Plain TypeScript with
small modules keeps the bundle small for phones and keeps tests simple (Vitest).
A framework can be introduced behind the same module boundaries if the UI grows.

## Static first; a backend only for services that never receive a position

Version 1 is a static site. nginx serves the bundle, the site data, the PMTiles file
and the overlay images, and sets the security headers (R18). Routing, search, and all
personalization run in the browser. No request ever carries a user position, so there
is no location data on any server to breach (R16).

The second stage is a small Node.js (Fastify) service behind nginx for things that do
not involve position: `GET /api/healthz`, an optional feedback endpoint, and
a satellite tile proxy so the imagery provider sees only the server's address. The
rule "no user coordinates in any request" is enforced by a test that inspects every
outgoing request in the end-to-end suite.

Accounts are out of scope.

Routing (R13 to R15) is a pure TypeScript package (`packages/routing`) with no I/O. It
runs in the browser and inside the service worker for offline use; the same package
could run on a server without change.

## Data pipeline: Python scripts, run at build time only

`tools/pipeline/` fetches OpenStreetMap data for a site boundary via Overpass, merges
it with a hand-curated `places.yaml`, and emits `sites/<site-id>/places.geojson`,
`sites/<site-id>/walkways.geojson`, and a prebuilt `graph.json`. Python is used because
geodata tooling (shapely, pyproj, networkx for cross-checking the project's own
algorithms) is strongest there. The pipeline output is committed, so the runtime
containers never need Python or network access to OpenStreetMap.

## Site configuration layout

```
sites/
  <site-id>/
    site.yaml          name, boundary (OSM way id or bbox), default view, tile layers,
                       "nearest" categories, overlay image corners, attribution
    places.yaml        curated list: id, number, name, aliases/keywords, category,
                       annotation, entrance coordinates, OSM id (if any)
    overlay/           the site's official map image + georeference metadata
    raw/               downloaded source files (treated as data only)
    places.geojson     generated
    walkways.geojson   generated
    graph.json         generated
```

Adding a new site is adding a new directory and running the pipeline.

## Repository layout

```
apps/web/        frontend (Vite + TypeScript + MapLibre GL JS)
apps/api/        Fastify service
packages/routing/  graph building, Dijkstra, A*, snapping, haversine; pure, tested
packages/search/   fuzzy search over places; pure, tested
packages/schema/   zod schemas shared by pipeline output, api, and web
sites/           per-site config and data (see Site configuration layout)
tools/pipeline/  Python data preparation
deploy/          Dockerfiles, compose file for local dev, swarm stack file, nginx conf
docs/            this folder
```

npm workspaces, one lockfile, one `npm test` at the root.

## Containers and deployment

- Multi-stage Dockerfiles: build stage with Node, final images `nginx:alpine` (static
  plus proxy) and `node:24-alpine` (API) running as non-root.
- `deploy/compose.yaml` for local development (`docker compose up`).
- `deploy/stack.yaml` for Swarm: `web` (and, once it exists, `api`) with `replicas: 2`,
  `update_config: { order: start-first, parallelism: 1, failure_action: rollback }`,
  `healthcheck` on each image, `restart_policy: on-failure`, overlay network, and
  Docker secrets for anything sensitive (R17, R22, R23).
- Domain: `openwalk.app` (`.app` is HTTPS-only by browser policy). Subdomains:
  `staging.openwalk.app` for the staging stack, `openwalk.app` for production; demo
  sites as paths.
- Hosting: one small cloud VM as a single-node Swarm for staging and first production.
  An organization adopting OpenWalk can host it on its own infrastructure; a static
  site plus a stack file makes that hand-off a configuration exercise.
- Edge: Cloudflare DNS, proxied. Connectivity via a `cloudflared` tunnel service inside
  the Swarm stack, so the host exposes no inbound ports. Origin certificates rejected
  for version 1 (a public IP and open port for no benefit).
- Images are built and pushed by CI on tags; the host pulls and runs
  `docker stack deploy`. No building on the production host.

## Testing

- Vitest for `packages/*` and `apps/api`. Pyright for the pipeline's type checking.
  Routing fixtures: a tiny hand-drawn graph with known answers, plus a real site graph
  with golden routes.
- Playwright for end-to-end: load site, grant mocked geolocation, search, route,
  arrive. Runs against the compose stack in CI.
- axe-core accessibility checks inside the Playwright run (R12).
- Pipeline tests in pytest for schema validity and reconciliation rules.

## Cross-cutting rules

- Site facts live only under `sites/`. No coordinate literal appears in `apps/` or
  `packages/`.
- All external hosts (tile providers, imagery) are listed in `site.yaml` and mirrored
  into the CSP at build time.
- Logging: structured, no request bodies, no coordinates, no IP addresses beyond what
  nginx needs for rate limiting (and those truncated).

## Position provider abstraction

All position reads pass through one interface with three implementations: the browser
Geolocation API, a mocked fixed position for tests, and a GPX replay for demos and
testing away from the site. Nothing else in the app touches `navigator.geolocation`.
The replay build flag is off in production images.

## Personalization lives on the device

Saved places, saved routes, recent searches, preferred layers, theme, and any
checklist progress are stored in the browser (IndexedDB) and never uploaded. An export
and import feature (a small file, and a QR code one phone shows and another scans)
moves that data between devices without a server. Saved routes are treated as the most
sensitive data in the app and never leave the device under any option.

## License and repository

Code is Apache-2.0 (see `LICENSE`). Site data derived from OpenStreetMap stays under
the ODbL and the app shows OpenStreetMap attribution on the map at all times. A site's
official map image remains the property of its owner and is attributed on its layer.
