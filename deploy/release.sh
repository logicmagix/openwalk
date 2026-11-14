#!/bin/sh
# Builds, checks and scans the two images a release publishes, and with --push
# sends them to the registry.
#
#   deploy/release.sh <version> [--push]
#
#   <prefix>/openwalk-build    Node, the built app and the add-sites command
#   <prefix>/openwalk-server   nginx and its configuration
#
# Neither holds a site. A site's own repository builds its image from the two;
# docs/DEPLOYMENT.md shows how. PREFIX, in the environment, is the registry and
# owner the images are named under, such as ghcr.io/example; without it they
# are named for this machine only. SCAN=no leaves the scan out, for a run that
# only needs to know the images still build and serve.
#
# Run from the repository root. Needs Docker and curl.
set -eu

version=${1:-}
push=${2:-}
if [ -z "$version" ] || { [ -n "$push" ] && [ "$push" != --push ]; }; then
  echo "usage: deploy/release.sh <version> [--push]" >&2
  exit 2
fi

prefix=${PREFIX:-local}
build_image=$prefix/openwalk-build
server_image=$prefix/openwalk-server
check_image=openwalk-release-check:$version
example=tuscawilla-park

# The scanner, by exact version and content, so that what runs here is what
# was looked at when the version was chosen.
trivy=aquasec/trivy:0.76.2@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb

work=$(mktemp -d)
container=
cleanup() {
  [ -n "$container" ] && docker rm -f "$container" >/dev/null 2>&1
  docker rmi -f "$check_image" >/dev/null 2>&1
  rm -rf "$work"
}
trap cleanup EXIT

echo "== building $build_image:$version and $server_image:$version"
for part in build server; do
  docker build --file deploy/web.Dockerfile --target "$part" \
    --label "org.opencontainers.image.version=$version" \
    --label "org.opencontainers.image.revision=$(git rev-parse HEAD)" \
    --label "org.opencontainers.image.source=${SOURCE_URL:-}" \
    --tag "$prefix/openwalk-$part:$version" --tag "$prefix/openwalk-$part:latest" .
done

# The check: put the example site into the two images the way a site's own
# repository would, from the site's directory and nothing else, and see that
# the result serves.
echo "== building the example site from the two images"
cp -R "sites/$example/." "$work/"
cat > "$work/Dockerfile" <<DOCKERFILE
FROM $build_image:$version AS build
COPY . /src/sites/$example
RUN add-sites $example

FROM $server_image:$version
COPY --from=build /out/ /
DOCKERFILE
docker build --tag "$check_image" "$work"

echo "== running it"
container=$(docker run --detach --read-only \
  --tmpfs /tmp --tmpfs /var/cache/nginx --tmpfs /var/run \
  --publish 127.0.0.1::8080 "$check_image")
address=http://$(docker port "$container" 8080/tcp | head -n 1)
tries=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy ]; do
  tries=$((tries + 1))
  if [ "$tries" -gt 30 ]; then
    echo "the example site did not become healthy" >&2
    docker logs "$container" >&2
    exit 1
  fi
  sleep 2
done
expect() { # a path, and text its response headers or status line must hold
  if ! curl --silent --show-error --head "$address$1" | grep --ignore-case --quiet "$2"; then
    echo "FAIL $1: no '$2' in the response" >&2
    exit 1
  fi
  echo "ok   $1 ($2)"
}
expect / '^HTTP/1.1 200'
expect "/s/$example/" '^HTTP/1.1 200'
expect "/s/$example/" '^content-security-policy:'
expect "/s/$example/" '^strict-transport-security:'
expect "/sites/$example/site.json" '^HTTP/1.1 200'
expect "/sites/$example/manifest.webmanifest" 'application/manifest+json'

scan() { # an image, and the exit code for a finding
  docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock "$trivy" image \
    --quiet --ignore-unfixed --severity HIGH,CRITICAL --exit-code "$2" "$1"
}
if [ "${SCAN:-yes}" = no ]; then
  echo "== not scanned (SCAN=no)"
else
  # What gets deployed must be clean: the server, and a site built on it.
  echo "== scanning what is deployed for known vulnerabilities with a fix"
  scan "$server_image:$version" 1
  scan "$check_image" 1
  # The build image is a tool that runs once and is thrown away; its findings
  # are shown, and do not stop a release.
  echo "== scanning the build image (shown, does not stop the release)"
  scan "$build_image:$version" 0
fi

if [ "$push" = --push ]; then
  echo "== publishing"
  for part in build server; do
    docker push "$prefix/openwalk-$part:$version"
    docker push "$prefix/openwalk-$part:latest"
  done
else
  echo "== not published (no --push)"
fi
