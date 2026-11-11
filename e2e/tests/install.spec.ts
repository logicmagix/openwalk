import { expect, test } from '@playwright/test';
import { MAP_PATH, config } from './site';

// A phone names an installed app from what the server sends, before any script
// runs, so these read the served page and manifest directly.

test('the served page already carries the site name and its own manifest', async ({ request }) => {
  const html = await (await request.get(MAP_PATH)).text();
  expect(html).toContain(`<title>${config.name}`);
  expect(html).toMatch(/<link rel="manifest" href="\/sites\/[a-z0-9-]+\/manifest\.webmanifest"/);
  const shortName = config.short_name ?? config.name;
  expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${shortName}"`);
});

test("the site's manifest starts on, and is scoped to, its own map", async ({ page, request }) => {
  await page.goto(MAP_PATH);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await request.get(href!);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await response.json()) as Record<string, unknown>;
  expect(manifest.name).toBe(config.name);
  expect(manifest.short_name).toBe(config.short_name ?? config.name);
  expect(manifest.start_url).toBe(MAP_PATH);
  expect(manifest.scope).toBe(MAP_PATH);
  expect(manifest.display).toBe('standalone');
});
