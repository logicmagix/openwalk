import { expect, test, type Page } from '@playwright/test';
import { LIST_EXTRA_ROWS, choosePlace, controls, openMap, showEveryPlace } from './app';
import { SITE_ID, config, places } from './site';

const kinds = [...new Set(places.map((place) => place.properties.category))];

function legend(page: Page) {
  return {
    button: page.getByRole('button', { name: 'Map legend' }),
    panel: page.getByRole('group', { name: 'Map legend' }),
  };
}

test('the legend lists every kind of place with how many there are', async ({ page }) => {
  await openMap(page);
  const { button, panel } = legend(page);
  await expect(panel).toBeHidden();
  await button.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('checkbox')).toHaveCount(kinds.length);
  for (const box of await panel.getByRole('checkbox').all()) await expect(box).toBeChecked();
  // The numbers beside the kinds add up to every place on the map.
  const counts = await panel.locator('.legend-count').allTextContents();
  expect(counts.map(Number).reduce((sum, n) => sum + n, 0)).toBe(places.length);
});

test('hiding a kind leaves search finding every place', async ({ page }) => {
  await openMap(page);
  const { button, panel } = legend(page);
  await button.click();
  const first = panel.getByRole('checkbox').first();
  await first.uncheck();
  await expect(first).not.toBeChecked();
  // Tapping outside closes the legend; the choice is kept.
  const { search, results } = controls(page);
  await search.click();
  await expect(panel).toBeHidden();
  await showEveryPlace(page);
  await expect(results.getByRole('option')).toHaveCount(places.length + LIST_EXTRA_ROWS);
  await page.keyboard.press('Escape');
  await button.click();
  await expect(panel.getByRole('checkbox').first()).not.toBeChecked();
});

test('the legend works from the keyboard and Escape closes it', async ({ page }) => {
  await openMap(page);
  const { button, panel } = legend(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(panel.getByRole('checkbox').first()).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
});

test('the legend moves clear of the directions panel', async ({ page }) => {
  await openMap(page);
  const { button } = legend(page);
  const before = await button.boundingBox();
  const { directions } = controls(page);
  const place = places[0];
  if (place === undefined) throw new Error('the site has no places');
  await choosePlace(page, place);
  await expect(directions).toBeVisible();
  const after = await button.boundingBox();
  const panelBox = await directions.boundingBox();
  expect(after!.y).toBeLessThan(before!.y);
  expect(after!.y + after!.height).toBeLessThanOrEqual(panelBox!.y);
});

test('on a host with one site the legend offers no other locations', async ({ page }) => {
  await page.route('**/sites/index.json', (route) =>
    route.fulfill({ json: { sites: [{ id: SITE_ID, name: config.name }] } }),
  );
  await openMap(page);
  await legend(page).button.click();
  await expect(legend(page).panel.getByRole('checkbox').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Other locations' })).toHaveCount(0);
});

// The numbers to call for help have a link only on a site that lists some.
const SAFETY = config.safety === undefined ? [] : ['Safety'];

test('the links under the legend run from what is kept to what the app promises', async ({
  page,
}) => {
  await openMap(page);
  await legend(page).button.click();
  const foot = legend(page).panel.locator('.legend-links');
  await expect(foot.getByRole('link', { name: 'Privacy' })).toBeVisible();
  const labels = await foot.locator('a:visible, button:visible').allTextContents();
  expect(labels.filter((label) => label !== 'Other locations')).toEqual([
    'My places',
    ...SAFETY,
    'Settings',
    'Privacy',
  ]);
});

test.describe('other sites on the host', () => {
  // The test answers the request for the list of sites itself, which it can only
  // do for requests the page makes directly, not those made through a service worker.
  test.use({ serviceWorkers: 'block' });

  test('on a host with several sites the legend leads to the others', async ({ page }) => {
    await page.route('**/sites/index.json', (route) =>
      route.fulfill({
        json: {
          sites: [
            { id: SITE_ID, name: config.name },
            { id: 'another-place', name: 'Another Place' },
          ],
        },
      }),
    );
    await openMap(page);
    await legend(page).button.click();
    await page.getByRole('link', { name: 'Other locations' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('main').getByRole('list').getByRole('link')).toHaveCount(2);
  });

  const severalSites = {
    sites: [
      { id: SITE_ID, name: config.name },
      { id: 'another-place', name: 'Another Place' },
    ],
  };

  test('the others come after My places and before the rest', async ({ page }) => {
    await page.route('**/sites/index.json', (route) => route.fulfill({ json: severalSites }));
    await openMap(page);
    await legend(page).button.click();
    const foot = legend(page).panel.locator('.legend-links');
    await expect(foot.getByRole('link', { name: 'Other locations' })).toBeVisible();
    expect(await foot.locator('a:visible, button:visible').allTextContents()).toEqual([
      'My places',
      'Other locations',
      ...SAFETY,
      'Settings',
      'Privacy',
    ]);
  });

  test('an app opened from the home screen offers no other locations', async ({ page }) => {
    // An installed app is one site's app. An iPhone says it runs as one this way.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
    });
    await page.route('**/sites/index.json', (route) => route.fulfill({ json: severalSites }));
    await openMap(page);
    await legend(page).button.click();
    await expect(legend(page).panel.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole('link', { name: 'Other locations' })).toHaveCount(0);
  });
});
