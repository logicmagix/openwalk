#!/usr/bin/env sh
# Copies the glyphs and sprites the base map style needs into the web app, from a
# pinned commit of the Protomaps basemaps-assets repository (fonts under the SIL Open
# Font License, see OFL.txt beside them). The app serves these itself so that no
# third-party host is contacted while the map is in use.
#
# Glyphs come in files of 256 code points. The default fetches every range below
# 2048 (Latin, Greek, Cyrillic, Hebrew, Arabic). A site whose labels use another
# script needs the ranges that cover it: pass the first code point of each, for
# example `fetch.sh 12288 19968` for Japanese kana and the first CJK block.
#
# Usage, from the repository root: sh tools/basemap-assets/fetch.sh [range-start ...]
set -eu

COMMIT="028c18f713baecad011301ff7a69acc39bcc2ae7"
BASE="https://raw.githubusercontent.com/protomaps/basemaps-assets/$COMMIT"
OUT="apps/web/public/basemap"
FONTS="Noto Sans Regular|Noto Sans Medium|Noto Sans Italic"
THEMES="light dark"

if [ "$#" -gt 0 ]; then
  starts="$*"
else
  starts=$(seq 0 256 1792)
fi

get() {
  # $1: path within the repository, $2: destination file
  mkdir -p "$(dirname "$2")"
  curl -sSfL --retry 3 -o "$2" "$BASE/$1"
}

get fonts/OFL.txt "$OUT/fonts/OFL.txt"
echo "$FONTS" | tr '|' '\n' | while IFS= read -r font; do
  encoded=$(printf '%s' "$font" | sed 's/ /%20/g')
  for start in $starts; do
    end=$((start + 255))
    get "fonts/$encoded/$start-$end.pbf" "$OUT/fonts/$font/$start-$end.pbf"
  done
  echo "$font: $(ls "$OUT/fonts/$font" | wc -l) ranges"
done

for theme in $THEMES; do
  for suffix in "" "@2x"; do
    get "sprites/v4/$theme$suffix.json" "$OUT/sprites/$theme$suffix.json"
    get "sprites/v4/$theme$suffix.png" "$OUT/sprites/$theme$suffix.png"
  done
done
echo "sprites: $THEMES"
