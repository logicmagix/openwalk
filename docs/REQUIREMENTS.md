# Requirements

What must be true of the finished product. Each requirement has an ID that tests and
other docs cite.

## Product scope

- R1. Generic. The application works for any area on the planet's surface. A "site"
  (a campus, a park, museum grounds, a fairground) is pure configuration plus data: a
  name, a bounding box or boundary, a default view, a list of places with categories
  and annotations, optional overlay images, and an optional walkway network. No site
  facts in application code.
- R2. Selecting a region. An operator defines a site by choosing a region (boundary or
  bounding box) and the pipeline fetches or imports what it needs for that region.
- R3. Usable for real. A first-time visitor to a configured site can use it on a phone
  with no instructions.

## User-facing behavior

- R4. Minimal interface. The map fills the screen. Controls: search box, "locate me",
  a dropdown of destinations with short annotations, a layers control, and a
  directions panel. Dark mode follows the system setting.
- R5. You are here. A position marker with an accuracy circle, updated live while the
  page is open, using the browser Geolocation API. The app remains usable with
  location denied (no marker, no directions, everything else works).
- R6. Search. Find a place by its number, name, or plain words tied to it
  ("cafeteria", "first aid"). Tolerant of small typos. Works offline against local
  data.
- R7. Directions. Shortest walking route from the user's position (or a chosen start)
  to a destination, drawn on the map, with distance, estimated walking time, and a
  bearing arrow. Detects arrival.
- R8. Nearest X. One-tap "nearest parking", "nearest emergency call box", or any other
  category a site configures as a "nearest" category.
- R9. Layers. Street base map, an optional aerial photograph of the site, and an
  optional georeferenced overlay of the site's official map image. Toggle walkways and
  building labels.
- R10. Share a place. Every place has a stable URL (`/p/<site>/<place-id>`) that opens
  the map centered on it. The app hands the URL out from the place itself, as text to
  copy and as a QR code, and through the device's own sharing where the browser has it.
- R11. Installable. Progressive web app: manifest, service worker, works after first
  load without a signal for the map UI, the base map, place data, and routing.
- R12. Accessible. Keyboard operable, screen-reader labels on all controls, visible
  focus, contrast meeting WCAG 2.2 AA in both themes.

## Routing

- R13. A set of shortest-path algorithms (at minimum Dijkstra and A*) over a weighted
  pedestrian graph built from walkway data. Both produce identical path costs on the
  test fixtures, and A* expands fewer nodes.
- R14. Start and end points snap to the nearest graph edge, not just the nearest node.
- R15. Routing runs on the device. No routing service, the operator's or anyone
  else's, receives user coordinates.

## Privacy and security

- R16. Locations are not tracked. No position is logged or sent anywhere. The only
  position kept is a spot the person chooses to mark, and it is kept on the device.
  The web server keeps no access log.
- R17. No accounts in version 1. If accounts are ever added, credentials and keys live
  in secrets files mounted at runtime (Docker secrets), never in images, env files
  committed to git, or source.
- R18. HTTPS only in production, HSTS on, with a strict Content-Security-Policy that
  allows only the app's own origin.
- R19. No analytics, no ads, no third-party scripts.
- R27. No request from the app, to the operator's servers or anyone else's, carries a
  user position or route. Enforced by an end-to-end test that inspects outgoing
  requests.
- R28. Personalization (saved places, saved routes, recents, preferences) is stored on
  the device only, with export and import between devices that needs no server.
- R29. Aerial imagery is one photograph of the site, fetched when the site is prepared
  and stored with its data. The app serves it from its own host, so no phone contacts
  an imagery provider and the layer works without a connection. It is off by default.

## Engineering

- R20. Containerized. The whole application runs from containers; `docker compose up`
  gives a working local instance.
- R21. Deployment target: Docker Swarm behind nginx, DNS and TLS edge via Cloudflare,
  on the operator's domain.
- R22. Zero-downtime updates: rolling service updates with health checks, start-first
  ordering, and automatic rollback on failed health checks.
- R23. Fault resilience: at least two replicas of each stateless service, restart
  policies, health endpoints, and no single container whose loss takes the site down.
- R24. Stack: Node.js for the build and its tooling, nginx as the static server.
  Python is permitted for offline data-preparation scripts.
- R25. Unit tests for all logic modules; end-to-end tests for the main flows with a
  mocked geolocation; tests run in CI on every push.
