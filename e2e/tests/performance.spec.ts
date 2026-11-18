import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { openMap } from './app';
import { MAP_PATH } from './site';

// Two coarse alarms, for the app growing slow to open without anyone noticing.
// Neither is a measurement to tune against: the limits sit well above what the
// app needs today, so that they ring for a real change and not for a busy machine.

/** The app notes the moment its map is first drawn whole under this name. */
const MAP_DRAWN_MARK = 'openwalk-map-drawn';

/** The longest the map may take to be drawn, from the page starting to load. */
const MAP_DRAWN_WITHIN_MS = 6000;

/**
 * The most each file a first visit downloads may weigh, compressed as a web
 * server sends it, in thousands of bytes: the app's script, the map library's
 * worker, and the stylesheet.
 */
const LIMITS_KB = { script: 370, worker: 165, styles: 18 };

test('the map is drawn soon after the page opens', async ({ page }) => {
  await openMap(page);
  const drawn = () =>
    page.evaluate(
      (name) => performance.getEntriesByName(name)[0]?.startTime ?? null,
      MAP_DRAWN_MARK,
    );
  await expect.poll(drawn, { timeout: 15_000 }).not.toBeNull();
  const ms = Math.round((await drawn())!);
  test.info().annotations.push({ type: 'map drawn after', description: `${ms} ms` });
  expect(ms).toBeLessThan(MAP_DRAWN_WITHIN_MS);
});

test('the files a first visit downloads stay within their weight', async ({ request }) => {
  const html = await (await request.get(MAP_PATH)).text();
  const script = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  const styles = /href="(\/assets\/index-[^"]+\.css)"/.exec(html)?.[1];
  expect(script, 'the page names its script').toBeDefined();
  expect(styles, 'the page names its stylesheet').toBeDefined();
  const scriptBody = await (await request.get(script!)).body();
  // The script names the worker it starts, a file of the map library's.
  const worker = /assets\/(maplibre-gl-worker-[\w-]+\.mjs)/.exec(scriptBody.toString('utf8'))?.[1];
  expect(worker, 'the script names its worker').toBeDefined();
  const weigh = (body: Buffer) => Math.round(gzipSync(body).length / 1000);
  const weights = {
    script: weigh(scriptBody),
    worker: weigh(await (await request.get(`/assets/${worker!}`)).body()),
    styles: weigh(await (await request.get(styles!)).body()),
  };
  test.info().annotations.push({ type: 'weights in kB', description: JSON.stringify(weights) });
  for (const [file, limit] of Object.entries(LIMITS_KB)) {
    expect(weights[file as keyof typeof weights], file).toBeLessThanOrEqual(limit);
  }
});
