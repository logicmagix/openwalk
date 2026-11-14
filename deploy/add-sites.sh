#!/bin/sh
# Puts sites into the built app, ready for the web server's image.
#
#   add-sites <site-id>...
#
# Each site is a directory under /src/sites, as the pipeline leaves it. With one
# site the root address opens it; with several it lists them. The result is
# written under /out, laid out as the server's image expects, so that one line
# of a Dockerfile takes it across:
#
#   COPY --from=build /out/ /
#
# HSTS, in the environment, sets what the Strict-Transport-Security header
# says; empty sends none.
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: add-sites <site-id>..." >&2
  exit 2
fi

cd /src
html=/out/usr/share/nginx/html
snippets=/out/etc/nginx/snippets
# The sites are gathered beside the app and moved into it at the end, so the
# app's files and the sites' files are each counted once in the fingerprint.
gathered=/tmp/add-sites

# Start from the app as it was built, so running this again begins afresh.
rm -rf /out "$gathered"
mkdir -p "$html" "$snippets"
cp -R apps/web/dist/. "$html/"

# Take from each site only the files the app reads. A site's directory also
# holds the sources its data is generated from, notes and downloaded
# reference files; those are not the image's to serve. A site that has not
# been built by the pipeline stops here, not at first use.
node apps/web/scripts/gather-sites.mjs sites "$gathered" "$@"

# Give each site its own copy of the page and its own web app manifest, so it
# installs to a phone as an app named after the site.
node apps/web/scripts/site-pages.mjs "$html" "$gathered"

# Stamp the service worker with a fingerprint of the app and the sites' data
# together, so a phone that has the app saved is offered the new version when
# either changes. This comes after everything that writes those files.
node apps/web/scripts/stamp-worker.mjs "$html" "$gathered"
mv "$gathered" "$html/sites"

# The content security policy the pages carry as a tag is also sent as a
# header; nginx's lines for it are written from the same source, and beside
# them the line for the strict transport security header.
node apps/web/scripts/security-headers.mjs \
  "$snippets/security-headers.conf" "$snippets/transport-headers.conf"
