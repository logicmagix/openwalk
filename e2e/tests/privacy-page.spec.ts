import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Request } from '@playwright/test';
import { controls, openMap } from './app';
import { MAP_PATH, SITE_ID, config } from './site';

// The page that says, in plain words, what the app does with a person's
// position. It is reached from the foot of the legend and from the list of maps.

const PRIVACY_FROM_SITE = `/privacy/?site=${SITE_ID}`;

test('the legend leads to the privacy page, which leads back to the map', async ({ page }) => {
  await openMap(page);
  await page.getByRole('button', { name: 'Map legend' }).click();
  await page
    .getByRole('group', { name: 'Map legend' })
    .getByRole('link', { name: 'Privacy' })
    .click();
  await expect(page).toHaveURL(PRIVACY_FROM_SITE);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('where you are stays on your phone')).toBeVisible();

  await page.getByRole('link', { name: 'Back to the map' }).click();
  await expect(page).toHaveURL(MAP_PATH);
  await expect(controls(page).search).toBeEnabled();
});

test('the page names who runs the site when the site says', async ({ page }) => {
  await page.goto(PRIVACY_FROM_SITE);
  const section = page.getByRole('heading', { name: 'Who runs this map' });
  if (config.operator === undefined) {
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(section).toBeHidden();
    return;
  }
  await expect(section).toBeVisible();
  await expect(
    page.getByText(`${config.name} on OpenWalk is run by ${config.operator.name}.`),
  ).toBeVisible();
});

test('opened by itself the page stands alone and leads to the list of maps', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who runs this map' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Back to the map' })).toHaveAttribute('href', '/');
});

test('the way back is right even before the site has answered', async ({ page }) => {
  // The site's settings are held up; the link must not wait for them.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/sites/${SITE_ID}/site.json`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(PRIVACY_FROM_SITE);
  await expect(page.getByRole('link', { name: 'Back to the map' })).toHaveAttribute(
    'href',
    MAP_PATH,
  );
  release();
});

test('a site that looks real but is not here leads back to the list of maps', async ({ page }) => {
  await page.goto('/privacy/?site=no-such-place');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the map' })).toHaveAttribute('href', '/');
});

test('a site given in the address that does not exist changes nothing', async ({ page }) => {
  await page.goto('/privacy/?site=../../etc');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the map' })).toHaveAttribute('href', '/');
});

test('the page asks nothing of any other host and carries the policy', async ({
  page,
  baseURL,
}) => {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  await page.goto(PRIVACY_FROM_SITE);
  await page.waitForLoadState('networkidle');
  const origin = new URL(baseURL!).origin;
  expect(requests.filter((request) => new URL(request.url()).origin !== origin)).toEqual([]);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
});

test('after a visit to the map the privacy page opens with no network', async ({
  page,
  context,
}) => {
  await openMap(page);
  await expect(page.getByText('Ready to use offline')).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  await page.goto(PRIVACY_FROM_SITE);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the map' })).toHaveAttribute(
    'href',
    MAP_PATH,
  );
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the page passes accessibility checks in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(PRIVACY_FROM_SITE);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
