# syntax=docker/dockerfile:1
# Builds the OpenWalk web bundle and packages it into an nginx image.
# Build context is the repository root (see deploy/compose.yaml).

# ---- stage 1: build the bundle with Node ----------------------------------
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

# ---- stage 2: serve it with nginx as a non-root user -----------------------
# The "unprivileged" variant of the official image runs as uid 101 (nginx)
# and listens on 8080, so no root is needed to bind a port.
FROM nginxinc/nginx-unprivileged:1.31-alpine

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

# Docker and Swarm use this to decide whether the container is
# healthy. wget is BusyBox's, present in every Alpine image.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
