# syntax=docker/dockerfile:1
# Builds the OpenWalk web bundle and packages it into an nginx image.
# Build context is the repository root (see deploy/compose.yaml).

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

# ---- stage 1: build the bundle with Node ----------------------------------
FROM node:24-alpine AS build
ARG SITES
ARG HSTS
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

# Gather the chosen sites for the next stage, taking from each only the files
# the app reads. A site's directory also holds the sources its data is
# generated from, notes and downloaded reference files; those are not the
# image's to serve. A site that has not been built by the pipeline stops the
# image build here, not at first use.
COPY sites sites
RUN node apps/web/scripts/gather-sites.mjs sites /out/sites $SITES

# Give each site its own copy of the page and its own web app manifest, so it
# installs to a phone as an app named after the site.
RUN node apps/web/scripts/site-pages.mjs apps/web/dist /out/sites

# Stamp the service worker with a fingerprint of the app and the sites'
# data together, so a phone that has the app saved is offered the new version
# when either changes. This comes after everything that writes those files.
RUN node apps/web/scripts/stamp-worker.mjs apps/web/dist /out/sites

# The content security policy the pages carry as a tag is also sent as a
# header; nginx's lines for it are written from the same source, and beside
# them the line for the strict transport security header.
RUN HSTS="$HSTS" node apps/web/scripts/security-headers.mjs \
      /out/security-headers.conf /out/transport-headers.conf

# ---- stage 2: serve it with nginx as a non-root user -----------------------
# The "unprivileged" variant of the official image runs as uid 101 (nginx)
# and listens on 8080, so no root is needed to bind a port.
FROM nginxinc/nginx-unprivileged:1.31-alpine

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /out/transport-headers.conf /etc/nginx/snippets/transport-headers.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
COPY --from=build /out/sites /usr/share/nginx/html/sites

EXPOSE 8080

# Docker and Swarm use this to decide whether the container is
# healthy. wget is BusyBox's, present in every Alpine image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
