import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { MAP_PATH, SITE_ID, arrivalPoint, farthestPair, reading } from './site';

// The content security policy: the page tells the browser to take code and data
// from its own host only. These check that the rule is stated, that the app
// itself lives within it, and that something added to the page by someone else
// is refused.

/** Collects what the browser refused under the policy, as "directive: address". */
async function watchRefusals(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const refused: string[] = [];
    (window as unknown as { refused: string[] }).refused = refused;
    document.addEventListener('securitypolicyviolation', (event) => {
      refused.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { refused: string[] }).refused);
}

const FOREIGN = 'https://added-by-someone-else.example/script.js';

/**
 * Serves the page as a network in between might: with a script from another
 * host, and one written straight into the page, added at the end.
 */
async function addForeignScripts(page: Page, options: { keepHeader: boolean }): Promise<void> {
  await page.route(FOREIGN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'window.foreignRan = true;' }),
  );
  await page.route(`**${MAP_PATH}`, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if (!options.keepHeader) delete headers['content-security-policy'];
    const added = `<script src="${FOREIGN}"></script><script>window.inlineRan = true;</script>`;
    const body = (await response.text()).replace('</body>', `${added}</body>`);
    await route.fulfill({ response, headers, body });
  });
}

test('the page states the policy in a tag and the server sends it as a header', async ({
  request,
}) => {
  const response = await request.get(MAP_PATH);
  const header = response.headers()['content-security-policy'] ?? '';
  const html = await response.text();
  const tag = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? '';
  expect(tag).toContain("default-src 'none'");
  expect(tag).toContain("script-src 'self'");
  expect(tag).toContain("connect-src 'self'");
  // The header says everything the tag says, and forbids framing as well.
  expect(header.startsWith(tag)).toBe(true);
  expect(header).toContain("frame-ancestors 'none'");
  // The tag comes before any script, so it is in force when they are reached.
  expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
});

test('the server tells browsers to use only HTTPS for the host, with every kind of file', async ({
  request,
}) => {
  // A browser heeds this only over HTTPS, so it changes nothing for a copy
  // reached over plain HTTP on one's own machine; the header is sent all the same.
  for (const path of [MAP_PATH, '/sw.js', `/sites/${SITE_ID}/site.json`, '/favicon.svg']) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()['strict-transport-security'] ?? '', path).toMatch(/^max-age=\d+/);
  }
});

test.describe('living within the policy', () => {
  test.use({ permissions: ['geolocation'] });

  test('the app itself asks for nothing the policy refuses', async ({ page, context }) => {
    const refusals = await watchRefusals(page);
    const { from, to } = farthestPair();
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    const { locate, directions } = controls(page);
    await locate.click();
    await choosePlace(page, to);
    await expect(directions).toContainText(/\d+ min/);
    await page.getByRole('button', { name: 'Map layers' }).click();
    await page.getByRole('button', { name: 'Map legend' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('#map canvas')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await refusals()).toEqual([]);
  });
});

for (const keepHeader of [true, false]) {
  const how = keepHeader ? 'with the header and the tag' : "with the page's own tag alone";
  test(`a script added to the page by someone else does not run, ${how}`, async ({ page }) => {
    const refusals = await watchRefusals(page);
    await addForeignScripts(page, { keepHeader });
    await openMap(page);
    await page.waitForLoadState('networkidle');
    const ran = await page.evaluate(() => {
      const w = window as unknown as { foreignRan?: boolean; inlineRan?: boolean };
      return { foreign: w.foreignRan === true, inline: w.inlineRan === true };
    });
    expect(ran).toEqual({ foreign: false, inline: false });
    const refused = await refusals();
    expect(refused.some((entry) => entry.includes('added-by-someone-else.example'))).toBe(true);
    expect(refused.some((entry) => entry.includes('inline'))).toBe(true);
    // The app is unharmed.
    await expect(controls(page).search).toBeEnabled();
  });
}
