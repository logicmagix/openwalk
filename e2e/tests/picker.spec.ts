import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { controls } from './app';
import { MAP_PATH, SITE_ID, config } from './site';

// The root address of a host. What it shows depends on how many sites the host
// serves, so these tests answer the request for the list of sites themselves.

async function serveSites(page: Page, sites: { id: string; name: string }[]): Promise<void> {
  await page.route('**/sites/index.json', (route) => route.fulfill({ json: { sites } }));
}

const here = { id: SITE_ID, name: config.name };
const elsewhere = { id: 'another-place', name: 'Another Place' };

test('a host with one site opens it', async ({ page }) => {
  await serveSites(page, [here]);
  await page.goto('/');
  await expect(page).toHaveURL(MAP_PATH);
  await expect(controls(page).search).toBeEnabled();
});

test('a host with several sites lists them, and choosing one opens its map', async ({ page }) => {
  await serveSites(page, [elsewhere, here]);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'OpenWalk' })).toBeVisible();
  const links = page.getByRole('main').getByRole('list').getByRole('link');
  await expect(links).toHaveText([elsewhere.name, here.name]);
  // The map's own controls belong to a site and are not offered yet.
  await expect(controls(page).search).toBeHidden();
  await expect(controls(page).locate).toBeHidden();

  await links.filter({ hasText: here.name }).click();
  await expect(page).toHaveURL(MAP_PATH);
  await expect(page).toHaveTitle(new RegExp(config.name));
  await expect(controls(page).search).toBeEnabled();
});

test('a host with no sites says so', async ({ page }) => {
  await serveSites(page, []);
  await page.goto('/');
  await expect(controls(page).notice).toHaveText('There are no maps here yet.');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the list of sites passes accessibility checks in the ${scheme} theme`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: scheme });
    const page = await context.newPage();
    await serveSites(page, [elsewhere, here]);
    await page.goto('/');
    await expect(page.getByRole('main').getByRole('list').getByRole('link')).toHaveCount(2);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await context.close();
  });
}

test('the list of maps leads to the privacy page', async ({ page }) => {
  await serveSites(page, [elsewhere, here]);
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL('/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
});
