// Gathers the sites an image will serve, taking only the files the app reads.
//
//   node apps/web/scripts/gather-sites.mjs <sites-dir> <out-dir> <site-id>...
//
// For each site id this copies, from <sites-dir>/<id> to <out-dir>/<id>:
//   the files every site needs (settings, places, walkways, graph, base map);
//   overlays.json and the images it names, less any overlay the site's
//   settings mark `publish: false`;
//   traces/*.gpx, the recorded walks used in demonstrations.
// Everything else in a site's directory stays out of the image. A site that
// lacks a needed file stops the build here, not at first use.
// Node runs the TypeScript module below directly, ignoring its type annotations.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  OVERLAYS_FILE,
  REQUIRED_FILES,
  TRACES_DIRECTORY,
  isInsideSite,
  isTrace,
  publishedOverlays,
  publishedSettings,
  withheldOverlays,
} from '../src/site/publish.ts';

const [sitesDir, outDir, ...siteIds] = process.argv.slice(2);
if (!sitesDir || !outDir || siteIds.length === 0) {
  console.error('usage: gather-sites.mjs <sites-dir> <out-dir> <site-id>...');
  process.exit(2);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

for (const siteId of siteIds) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(siteId)) {
    throw new Error(`"${siteId}" is not a site id`);
  }
  const from = join(sitesDir, siteId);
  const to = join(outDir, siteId);
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(from, file))) {
      throw new Error(`sites/${siteId} has no ${file}: run the pipeline build for it`);
    }
  }
  mkdirSync(to, { recursive: true });

  const settings = readJson(join(from, 'site.json'));
  const withheld = withheldOverlays(settings);
  writeJson(join(to, 'site.json'), publishedSettings(settings));
  for (const file of REQUIRED_FILES) {
    if (file !== 'site.json') copy(join(from, file), join(to, file));
  }

  let overlayCount = 0;
  if (existsSync(join(from, OVERLAYS_FILE))) {
    const overlays = publishedOverlays(readJson(join(from, OVERLAYS_FILE)), withheld);
    overlayCount = overlays.overlays.length;
    if (overlayCount > 0) {
      writeJson(join(to, OVERLAYS_FILE), overlays);
      for (const overlay of overlays.overlays) {
        if (!isInsideSite(overlay.image)) {
          throw new Error(`sites/${siteId}: overlay image "${overlay.image}" is outside the site`);
        }
        copy(join(from, overlay.image), join(to, overlay.image));
      }
    }
  }

  const tracesDir = join(from, TRACES_DIRECTORY);
  const traces = existsSync(tracesDir) ? readdirSync(tracesDir).filter(isTrace) : [];
  for (const trace of traces) {
    copy(join(tracesDir, trace), join(to, TRACES_DIRECTORY, trace));
  }

  const held = withheld.size > 0 ? `, ${withheld.size} held back` : '';
  console.log(`${siteId}: gathered with ${overlayCount} overlays${held}, ${traces.length} traces`);
}
