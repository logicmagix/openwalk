import { expect, test } from '@playwright/test';
import { SITE_ID } from './site';

// A site's directory holds the sources its data is generated from, and notes
// and reference files beside them. Only the generated files the app reads are
// served; the rest is not the host's to hand out.

const SITE = `/sites/${SITE_ID}`;

test('the files the app reads are served', async ({ request }) => {
  for (const file of ['site.json', 'places.geojson', 'walkways.geojson', 'graph.json']) {
    expect((await request.get(`${SITE}/${file}`)).status(), file).toBe(200);
  }
});

test('the sources and working files of a site are not served', async ({ request }) => {
  for (const file of [
    'site.yaml',
    'places.yaml',
    'walkways.yaml',
    'debug.html',
    'README.md',
    'DATA_SOURCES.md',
    '.gitignore',
    'raw/overpass.json',
  ]) {
    expect((await request.get(`${SITE}/${file}`)).status(), file).toBe(404);
  }
});
