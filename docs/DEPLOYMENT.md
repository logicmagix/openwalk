# Deployment

How to run OpenWalk for real: one image, served by Docker Swarm, reached through a
Cloudflare tunnel. `deploy/stack.yaml` is the whole description; this page explains
it and gives the commands in order.

Swarm is Docker's built-in way of keeping a set of containers running: it is told how
many copies of a service there should be and keeps that true, restarting what fails
and replacing copies one at a time when the image changes. It needs nothing installed
beyond Docker itself.

## What the stack runs

- **web**: nginx serving the built app and the sites' data. Two copies, so one can
  fail or be replaced while the other serves. No port is published.
- **cloudflared**: an outbound connection to Cloudflare, which sends visitors' requests
  back down it to `web`. The host opens no port to the internet. Two copies, both
  connected to the same tunnel.

On one machine, two copies protect against a container failing and make updates
seamless. They do not protect against the machine failing; that takes a swarm of
several machines, which the same file serves unchanged.

## 1. Build the image

There are two ways, and they produce the same image.

### From the site's own repository

Each OpenWalk release publishes two images: `openwalk-build`, which holds the built
app and a command, `add-sites`, that puts a site into it, and `openwalk-server`, the
web server the result is copied into. A site's repository needs only a short
`Dockerfile` of its own and none of OpenWalk's source:

```dockerfile
# The OpenWalk release to build on.
ARG OPENWALK=1.0.0

FROM ghcr.io/logicmagix/openwalk-build:${OPENWALK} AS build
COPY . /src/sites/<site-id>
RUN add-sites <site-id>

FROM ghcr.io/logicmagix/openwalk-server:${OPENWALK}
COPY --from=build /out/ /
```

```
docker build -t <registry>/<name>:<tag> .
```

The site's directory must already hold the files the pipeline generates. A
`.dockerignore` naming `.git`, `raw` and `debug.html` keeps the build quick;
`add-sites` takes only the files the app reads in any case. A newer release of
OpenWalk is taken by changing the version and building again.

For several sites in one image, copy each to `/src/sites/<its id>` and name them
all: `RUN add-sites north-campus south-campus`. With one site the root address opens
it; with several it lists them.

### From this repository

With the sites present under `sites/`, a real site being cloned to
`sites/<site-id>/` first:

```
docker build -f deploy/web.Dockerfile \
  --build-arg SITES="<site-id>" \
  -t <registry>/<name>:<tag> .
```

`SITES` takes one id or several separated by spaces. Without it the image carries the
example site, which is the quick way to try the app: `docker compose -f
deploy/compose.yaml up --build`, then `http://localhost:8080`.

### Either way

- The `Strict-Transport-Security` header says a year, for the one host, unless told
  otherwise. From a site's repository, `RUN HSTS="..." add-sites <site-id>`; from
  this one, `--build-arg HSTS="..."`. An empty value sends none, for a host whose
  own proxy does.
- Give every build its own tag, such as a date or a version. Swarm updates when the
  tag changes, and the tag says which build is running.

## 2. Get the image to the host

With a registry, push it and let the host pull:

```
docker push <registry>/<name>:<tag>
```

Without one, a single machine can be handed the image directly:

```
docker save <registry>/<name>:<tag> | ssh <host> docker load
```

A swarm of several machines needs a registry, since each machine fetches the image
for itself.

## 3. Prepare the host, once

Make the machine a swarm of one:

```
docker swarm init
```

Create the tunnel in the Cloudflare dashboard (Zero Trust, Networks, Tunnels), give it
a public hostname that points at `http://web:8080`, and copy its token. Store the
token as a Swarm secret, which keeps it encrypted on the host and shows it only to
the service that asks for it:

```
docker secret create cloudflare_tunnel_token -
```

The command waits for input: paste the token, press Enter, then Ctrl-D. Typed this
way the token is not left in the shell's history or in any file.

## 4. Deploy

Copy `deploy/stack.yaml` to the host, or clone the repository there, and run:

```
WEB_IMAGE=<registry>/<name>:<tag> docker stack deploy -c deploy/stack.yaml openwalk
```

Check that both services have their copies:

```
docker service ls
docker service ps openwalk_web
```

`REPLICAS` should read `2/2` for each within a minute. Then check what a browser is
sent, from anywhere:

```
curl -sI https://<your-host>/ | grep -i -E 'strict-transport|content-security'
```

## 5. Update

Build and deliver an image with a new tag, then run the deploy command again with it.
Swarm starts one new copy, waits for its health check to pass, stops one old copy,
and repeats. Visitors are served throughout. Watch it with:

```
docker service ps openwalk_web
```

If a new copy does not become healthy, Swarm puts the previous image back by itself.
To go back by hand after an update that is healthy but wrong:

```
docker service rollback openwalk_web
```

People who have the app installed are offered the new version the next time they
open it with a connection.

## 6. Settings at Cloudflare

Two of the zone's defaults work against what the app promises, and are worth changing
before the first visitor:

- **Web Analytics** (Analytics & Logs): switch off automatic setup for the host.
  Left on, Cloudflare adds its own measuring script to every page. The app's content
  security policy refuses to run it, but it should not be sent at all.
- **Browser Cache TTL** (Caching, Configuration): set to "Respect Existing Headers".
  The default overrides the server's instructions for some files, including the
  service worker, so phones can be slow to notice a new version.

The browser tests can then check the deployed site from outside:

```
E2E_BASE_URL=https://<your-host> E2E_SITE=<site-id> npm run test:e2e -- privacy policy install
```

## Without Cloudflare

An organization with its own HTTPS proxy or load balancer does not need the tunnel.
A second file, given after the first, switches it off and publishes the web service
on a port for the proxy to reach:

```yaml
# stack.local.yaml
services:
  web:
    ports:
      - '8080:8080'
  cloudflared:
    deploy:
      replicas: 0
```

```
WEB_IMAGE=... docker stack deploy -c deploy/stack.yaml -c stack.local.yaml openwalk
```

The secret must still exist, with any content, because the stack names it. The proxy
in front is then responsible for HTTPS, and should pass the app's response headers
through unchanged.
