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
algorithms) is strongest there. The pipeline output is committed in the site's
repository, so the runtime containers never need Python or network access to
OpenStreetMap.

## Site configuration layout

```
sites/
  <site-id>/
    site.yaml          name, boundary (OSM way id or bbox), default view, tile layers,
                       "nearest" categories, overlay image corners, attribution
    places.yaml        curated list: id, number, name, aliases/keywords, category,
                       annotation, entrances, OSM id (if any)
    overlay/           the site's official map image + georeference metadata
    raw/               downloaded source files (treated as data only)
    places.geojson     generated
    walkways.geojson   generated
    graph.json         generated
```

Adding a new site is adding a new directory and running the pipeline.

## Site data lives outside the application repository

This repository contains the application, the pipeline, the schemas, and one example
site used to demonstrate and test the pipeline. A real site is its own repository with
the layout above, cloned to `sites/<site-id>/` for local work; everything under
`sites/` except the example is ignored by git. For deployment, a site repository builds
its own image from the published generic web image and copies its directory in. The
application repository therefore never carries an institution's names, coordinates, or
map images, and a site owner can withdraw their data by deleting one repository.

## Each site installs as its own app

One host can serve several sites, and each installs to a phone's home screen as a
separate app, named after the site and opening on its own map (R11). A phone takes an
installed app's name and starting address from the page and the web app manifest as
the server sends them; values set later by script are not honoured. So each site is
served its own copy of the page, with its title and home-screen name filled in, and
its own manifest whose start address and scope are the site's map, `/s/<site-id>/`.

The image build writes these for the sites it carries, from each site's `site.json`,
and the development server produces the same on request, so both behave alike. The
application bundle and the service worker stay shared by every site on the host; the
worker keeps each site's page under its own key. Sites share the application's icon
and are told apart by name; a site with a long name sets a `short_name` for the label
under its icon.

The worker answers from its saved copy first, so a phone needs a signal that the
server has something newer. That signal is the worker's own file: the build stamps it
with a fingerprint of everything the image serves, the application's files and every
site's data together. A changed walkway is therefore a new version just as a changed
script is, and the app offers to reload into it.

The root address is for someone who arrives at the bare host: it lists the sites,
read from a small index the image build writes beside them, and opens the site
directly when there is only one. There is no control for changing site inside a map.
An installed app is one site's app, and a site that has not been visited is not
available offline, so moving between sites is done from the root address or from the
home screen.

## Repository layout

```
apps/web/        frontend (Vite + TypeScript + MapLibre GL JS)
apps/api/        Fastify service
packages/routing/  graph building, Dijkstra, A*, snapping, haversine; pure, tested
packages/search/   fuzzy search over places; pure, tested
packages/schema/   JSON Schema files shared by pipeline output, api, and web
sites/           the example site; real sites are separate repositories cloned here
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
- Logging: the web server keeps no access log, since every file it serves is the
  same for everyone and a log would hold little but visitors' addresses. It reports
  only its own failures. Any later service logs no request bodies, no coordinates,
  and no IP addresses beyond what rate limiting needs (and those truncated).
- The privacy page, `/privacy/`, says in plain words what the app does with a
  person's position, what it keeps on the phone and what the server sees. It is one
  static page for every site, linked from the legend and from the list of maps;
  opened from a site it also names the site's `operator` when one is set. What it
  promises is what the browser tests check: no request leaves the host and none
  carries a position.

## Content security policy

The app needs nothing from any host but its own, and it tells the browser so (R18,
R19): a content security policy that takes scripts, styles, images, fonts and
connections from its own origin only, allows no inline or generated code, and refuses
everything it does not name. A script added to a page by anyone else, including a
network between the server and the phone, is not run.

The policy has one source, `apps/web/src/policy.ts`. The build writes it into the page
as a tag, which travels with the page to any host, and the image build writes the
same policy as an nginx header, which also forbids showing the page in a frame on
another site. The development server's page carries no policy, because Vite's live
reload works by adding scripts and styles to the page. A browser test adds a script
from another host, and one written into the page, and checks neither runs; another
checks the app itself asks for nothing the policy refuses.

## Position provider abstraction

All position reads pass through one interface with three implementations: the browser
Geolocation API, a mocked fixed position for tests, and a GPX replay for demos and
testing away from the site. Nothing else in the app touches `navigator.geolocation`.
The replay build flag is off in production images.

## Personalization lives on the device

How a site's map was left (layers, hidden kinds of place), saved places, saved walks
between two places, and recently chosen places are stored in the browser (IndexedDB),
per site, and never uploaded. What is read back is checked against what the site has
now, so anything that has gone drops out.

Saved places and walks move between devices without a server: as a small file, or as
a link that carries them after its `#`, the part of an address a browser never sends
to a host. The link is also shown as a QR code for another device's camera. An
installed app on some phones keeps its own storage apart from the browser's, so a
link opened by the camera may land in the browser and not the app; the link can
therefore also be pasted into the app, and a file chosen from it. What arrives is read
strictly, must name the same site, and is added to what the device holds, never put in
its place. Only place ids travel: no position, and not the recent places.

A walk is saved as two place ids.

A spot is the one thing kept that is a position: a point the person marked, such as
where the car is parked, with a name. It is stored only when asked for, shown on the
map, and offered as a destination; it is not in the routing graph, so directions end
at the point itself, leaving the network at the nearest walkway. A spot never goes in
a link or a code. A saved file carries spots only when the person ticks the box for
them, and a file's spots are taken on another device only where they lie on the site.

Settings are of two kinds. How the app looks (light, dark, or following the device)
is about the person's eyes and screen, so it is kept once for the device, in
`localStorage`, and a small script loaded ahead of everything else applies it before
the page is drawn. Which optional buttons a map shows is kept per site with the rest
of how that map was left. Search, location, layers and the compass are not optional.

## License and repository

Code is Apache-2.0 (see `LICENSE`). Site data derived from OpenStreetMap stays under
the ODbL and the app shows OpenStreetMap attribution on the map at all times. A site's
official map image remains the property of its owner and is attributed on its layer.
