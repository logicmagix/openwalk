import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { controls, openMap } from './app';
import { SITE_ID, config } from './site';

// Settings: light or dark for every map on the device, and which optional
// buttons this map shows.

function settings(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  return {
    dialog,
    follow: dialog.getByRole('radio', { name: 'Follow my device' }),
    light: dialog.getByRole('radio', { name: 'Light' }),
    dark: dialog.getByRole('radio', { name: 'Dark' }),
    zoom: dialog.getByRole('checkbox', { name: 'Zoom buttons' }),
    nearest: dialog.getByRole('checkbox', { name: 'Nearest buttons' }),
    spots: dialog.getByRole('checkbox', { name: 'My spots button' }),
    close: dialog.getByRole('button', { name: 'Close settings' }),
  };
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Map legend' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(settings(page).dialog).toBeVisible();
}

/** The colour the page is drawn on, which is the surface colour of the theme in force. */
const surface = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const LIGHT = 'rgb(255, 255, 255)';
const DARK = 'rgb(32, 33, 36)';

// A choice is written to the device's store a moment after it is made.
async function revisit(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.reload();
  await openMap(page);
}

test.describe('on a device set to light', () => {
  test.use({ colorScheme: 'light' });

  test('the app follows the device until told otherwise', async ({ page }) => {
    await openMap(page);
    expect(await surface(page)).toBe(LIGHT);
    await openSettings(page);
    await expect(settings(page).follow).toBeChecked();
  });

  test('choosing dark applies at once, is kept, and reaches the privacy page', async ({ page }) => {
    await openMap(page);
    await openSettings(page);
    await settings(page).dark.check();
    expect(await surface(page)).toBe(DARK);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await revisit(page);
    expect(await surface(page)).toBe(DARK);
    await openSettings(page);
    await expect(settings(page).dark).toBeChecked();

    await page.goto(`/privacy/?site=${SITE_ID}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    expect(await surface(page)).toBe(DARK);
  });

  test('the choice is in force before the page is drawn', async ({ page }) => {
    await openMap(page);
    await openSettings(page);
    await settings(page).dark.check();
    // Stop the app's own code from loading: only the small early script runs.
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await surface(page)).toBe(DARK);
  });

  test('following the device again undoes the choice', async ({ page }) => {
    await openMap(page);
    await openSettings(page);
    await settings(page).dark.check();
    await settings(page).follow.check();
    expect(await surface(page)).toBe(LIGHT);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });
});

test.describe('on a device set to dark', () => {
  test.use({ colorScheme: 'dark' });

  test('choosing light overrides the device', async ({ page }) => {
    await openMap(page);
    expect(await surface(page)).toBe(DARK);
    await openSettings(page);
    await settings(page).light.check();
    expect(await surface(page)).toBe(LIGHT);
  });
});

test('the zoom buttons can be taken off this map, and put back', async ({ page }) => {
  await openMap(page);
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await expect(zoomIn).toBeVisible();
  await openSettings(page);
  await expect(settings(page).zoom).toBeChecked();
  await settings(page).zoom.uncheck();
  await expect(zoomIn).toBeHidden();

  await revisit(page);
  await expect(zoomIn).toBeHidden();
  await openSettings(page);
  await expect(settings(page).zoom).not.toBeChecked();
  await settings(page).zoom.check();
  await expect(zoomIn).toBeVisible();
});

test('the spots button can be taken off, and the search and location stay', async ({ page }) => {
  await openMap(page);
  const spotsButton = page.getByRole('button', { name: 'My spots' });
  await expect(spotsButton).toBeVisible();
  await openSettings(page);
  await settings(page).spots.uncheck();
  await settings(page).close.click();
  await expect(spotsButton).toBeHidden();
  await expect(controls(page).search).toBeVisible();
  await expect(controls(page).locate).toBeVisible();
});

test('the nearest buttons can be taken off where a site has them', async ({ page }) => {
  await openMap(page);
  await openSettings(page);
  if ((config.nearest ?? []).length === 0) {
    // Nothing to show or hide, so the switch is not offered.
    await expect(settings(page).nearest).toHaveCount(0);
    return;
  }
  const row = page.getByRole('group', { name: 'Find the nearest' });
  const spotsButton = page.getByRole('button', { name: 'My spots' });
  const before = await spotsButton.boundingBox();
  await settings(page).nearest.uncheck();
  await settings(page).close.click();
  await expect(row).toBeHidden();
  // The spots button moves up into the room the row left.
  const after = await spotsButton.boundingBox();
  expect(after!.y).toBeLessThan(before!.y);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the panel passes accessibility checks in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openMap(page);
    await openSettings(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#settings')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
