// Writes each site's own page and web app manifest into a built app.
//
//   node apps/web/scripts/site-pages.mjs <dist-dir> <sites-dir>
//
// For every site directory under <sites-dir> this writes
//   <sites-dir>/<id>/manifest.webmanifest   the site's manifest
//   <dist-dir>/s/<id>/index.html            the app's page, named for the site
// Node runs the TypeScript module below directly, ignoring its type annotations.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteManifest, sitePageHtml } from '../src/site/pages.ts';

const [distDir, sitesDir] = process.argv.slice(2);
if (!distDir || !sitesDir) {
  console.error('usage: site-pages.mjs <dist-dir> <sites-dir>');
  process.exit(2);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf8');
for (const entry of readdirSync(sitesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const siteDir = join(sitesDir, entry.name);
  const config = JSON.parse(readFileSync(join(siteDir, 'site.json'), 'utf8'));
  if (config.id !== entry.name) {
    throw new Error(`${siteDir}: site.json is for "${config.id}", not "${entry.name}"`);
  }
  writeFileSync(
    join(siteDir, 'manifest.webmanifest'),
    `${JSON.stringify(siteManifest(config), null, 2)}\n`,
  );
  const pageDir = join(distDir, 's', config.id);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(join(pageDir, 'index.html'), sitePageHtml(html, config));
  console.log(`${config.id}: page and manifest written as "${config.name}"`);
}
