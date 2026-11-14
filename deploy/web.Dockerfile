# syntax=docker/dockerfile:1
# Builds the OpenWalk web bundle and packages it into an nginx image.
# Build context is the repository root (see deploy/compose.yaml).
#
# There are three parts, each a stage that can be built by name with --target:
#
#   build    Node, the built app and the add-sites command. No site.
#   server   nginx and its configuration. Nothing to serve yet.
#   (last)   the server with the sites named in SITES put in: what runs.
#
# The first two hold everything that does not depend on a site, so a site can
# be put into the app without this repository: add-sites in the one, its
# output copied into the other.

# The sites baked into the image: one id, or several separated by spaces,
# each a directory under sites/. The default is the example site; a real site
# is cloned into sites/<its id>/ and named here, for example
# --build-arg SITES="north-campus south-campus". With one site the root path
# opens it; with several it lists them.
ARG SITES=tuscawilla-park

# What the Strict-Transport-Security header says: for how long a browser that
# has reached this host over HTTPS is to refuse plain HTTP for it. A year, and
# for this host alone. Whoever runs the host may want otherwise, for example
# --build-arg HSTS="max-age=31536000; includeSubDomains", or --build-arg HSTS=""
# to send none because a proxy in front already does.
ARG HSTS="max-age=31536000"

# ---- build: the app, built with Node, and the command that adds sites ------
FROM node:24-alpine AS build
WORKDIR /src

# Copy only the manifests first so the dependency layer is cached between
# builds whenever package-lock.json has not changed.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/routing/package.json packages/routing/
COPY packages/search/package.json packages/search/
COPY packages/schema/package.json packages/schema/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages packages
RUN npm run build

COPY --chmod=755 deploy/add-sites.sh /usr/local/bin/add-sites
# What add-sites has the header say unless told otherwise.
ENV HSTS="max-age=31536000"

# ---- server: nginx as a non-root user, with nothing yet to serve -----------
# The "unprivileged" variant of the official image runs as uid 101 (nginx)
# and listens on 8080, so no root is needed to bind a port. It does not start
# until add-sites' output has been copied in: its configuration includes the
# header lines that command writes.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS server

# The base image is rebuilt only now and then, and fixes to its system packages
# come out in between. Take those that exist today; installing needs root for
# this one step.
USER root
RUN apk upgrade --no-cache
USER 101

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# Docker and Swarm use this to decide whether the container is
# healthy. wget is BusyBox's, present in every Alpine image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

# ---- sites: the chosen sites put into the built app ------------------------
FROM build AS sites
ARG SITES
ARG HSTS
COPY sites sites
RUN HSTS="$HSTS" add-sites $SITES

# ---- the image that runs: the server with the app and its sites ------------
FROM server
COPY --from=sites /out/ /
