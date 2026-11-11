# syntax=docker/dockerfile:1
# Builds the OpenWalk web bundle and packages it into an nginx image.
# Build context is the repository root (see deploy/compose.yaml).

# The sites baked into the image: one id, or several separated by spaces,
# each a directory under sites/. The default is the example site; a real site
# is cloned into sites/<its id>/ and named here, for example
# --build-arg SITES="north-campus south-campus". With one site the root path
# opens it; with several it lists them.
ARG SITES=tuscawilla-park

# ---- stage 1: build the bundle with Node ----------------------------------
FROM node:24-alpine AS build
ARG SITES
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

# Gather the chosen sites into one directory for the next stage, which can
# copy a directory but cannot loop over a list. A site that has not been
# built by the pipeline stops the image build here, not at first use.
COPY sites sites
RUN set -eu; mkdir -p /out/sites; \
    for site in $SITES; do \
      test -f "sites/$site/site.json" \
        || { echo "sites/$site has no site.json: run the pipeline build for it" >&2; exit 1; }; \
      cp -rL "sites/$site" "/out/sites/$site"; \
    done

# Give each site its own copy of the page and its own web app manifest, so it
# installs to a phone as an app named after the site.
RUN node apps/web/scripts/site-pages.mjs apps/web/dist /out/sites

# The content security policy the pages carry as a tag is also sent as a
# header; nginx's lines for it are written from the same source.
RUN node apps/web/scripts/security-headers.mjs /out/security-headers.conf

# ---- stage 2: serve it with nginx as a non-root user -----------------------
# The "unprivileged" variant of the official image runs as uid 101 (nginx)
# and listens on 8080, so no root is needed to bind a port.
FROM nginxinc/nginx-unprivileged:1.31-alpine

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
COPY --from=build /out/sites /usr/share/nginx/html/sites

EXPOSE 8080

# Docker and Swarm use this to decide whether the container is
# healthy. wget is BusyBox's, present in every Alpine image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
