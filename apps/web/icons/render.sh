#!/usr/bin/env sh
# Regenerate the app icons from the SVG masters in this directory.
#
# The two SVGs are the editable source of truth:
#   icon.svg           rounded tile, used for the browser favicon and the
#                      "any" manifest icons
#   icon-maskable.svg  full-bleed background with the figure inside the safe
#                      zone, used for Android "maskable" icons and the iOS
#                      apple-touch-icon (iOS applies its own rounded corners)
#
# Outputs land in ../public. Requires rsvg-convert (librsvg).
set -eu

here="$(dirname "$0")"
pub="$here/../public"
icons="$pub/icons"
mkdir -p "$icons"

rsvg-convert -w 192 -h 192 "$here/icon.svg" -o "$icons/icon-192.png"
rsvg-convert -w 512 -h 512 "$here/icon.svg" -o "$icons/icon-512.png"
rsvg-convert -w 192 -h 192 "$here/icon-maskable.svg" -o "$icons/maskable-192.png"
rsvg-convert -w 512 -h 512 "$here/icon-maskable.svg" -o "$icons/maskable-512.png"
rsvg-convert -w 180 -h 180 "$here/icon-maskable.svg" -o "$icons/apple-touch-icon.png"
cp "$here/icon.svg" "$pub/favicon.svg"

echo "Icons written to $pub"
