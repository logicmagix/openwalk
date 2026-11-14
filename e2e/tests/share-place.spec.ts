import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { SITE_ID, arrivalPoint, labelOf, places, reading } from './site';

// Sharing a place: its link, handed out from the directions panel as a code to
// scan, as text to copy, and through the device's own sharing where there is any.

const place = places[0]!;

function sharing(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Share this place' });
  return {
    button: page.getByRole('button', { name: 'Share this place' }),
    dialog,
    status: dialog.getByRole('status'),
    link: dialog.getByRole('textbox', { name: 'Link', exact: true }),
    copy: dialog.getByRole('button', { name: 'Copy link' }),
    send: dialog.getByRole('button', { name: 'Share another way' }),
    close: dialog.getByRole('button', { name: 'Close sharing' }),
  };
}

async function openSharing(page: Page): Promise<void> {
  await choosePlace(page, place);
  await sharing(page).button.click();
  await expect(sharing(page).dialog).toBeVisible();
}

/** Stands in for the device's own sharing, and keeps what it was handed. */
async function withDeviceSharing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: (data: unknown) => {
        (window as unknown as { handed: unknown }).handed = data;
        return Promise.resolve();
      },
    });
  });
}

async function withoutDeviceSharing(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
  });
}

test('a place is offered as a code to scan and a link that opens it', async ({ page, baseURL }) => {
  await openMap(page);
  await openSharing(page);
  const { dialog, link, close } = sharing(page);
  await expect(dialog.getByRole('heading', { name: labelOf(place) })).toBeVisible();
  await expect(dialog.getByRole('img', { name: /A code that opens/ })).toBeVisible();
  const address = await link.inputValue();
  // The site and the place, and nothing more.
  expect(address).toBe(`${new URL(baseURL!).origin}/p/${SITE_ID}/${place.id}`);

  await close.click();
  await expect(dialog).toBeHidden();
  await openMap(page, new URL(address).pathname);
  await expect(controls(page).directions).toContainText(place.properties.name);
});

test('the link can be copied, or is left selected to copy by hand', async ({ page }) => {
  await openMap(page);
  await openSharing(page);
  await sharing(page).copy.click();
  // A browser may refuse the clipboard; either way the person is told what happened.
  await expect(sharing(page).status).toHaveText(/Link copied\.|Select the link and copy it\./);
});

test('the device’s own sharing is handed the link where there is any', async ({
  page,
  baseURL,
}) => {
  await withDeviceSharing(page);
  await openMap(page);
  await openSharing(page);
  await sharing(page).send.click();
  const handed = await page.evaluate(() => (window as unknown as { handed: unknown }).handed);
  expect(handed).toEqual({
    title: labelOf(place),
    url: `${new URL(baseURL!).origin}/p/${SITE_ID}/${place.id}`,
  });
});

test('a browser with no sharing of its own offers the code and the link only', async ({ page }) => {
  await withoutDeviceSharing(page);
  await openMap(page);
  await openSharing(page);
  await expect(sharing(page).copy).toBeVisible();
  await expect(sharing(page).send).toBeHidden();
});

test('Escape closes the panel and returns to the button that opened it', async ({ page }) => {
  await openMap(page);
  await openSharing(page);
  await page.keyboard.press('Escape');
  await expect(sharing(page).dialog).toBeHidden();
  await expect(sharing(page).button).toBeFocused();
});

test.describe('a spot the person marked', () => {
  test.use({ permissions: ['geolocation'] });

  test('has no link to hand out', async ({ page, context }) => {
    await context.setGeolocation(reading(arrivalPoint(place)));
    await openMap(page);
    await page.getByRole('button', { name: 'My spots' }).click();
    const menu = page.getByRole('group', { name: 'My spots' });
    await menu.getByRole('button', { name: /my car here/ }).click();
    await expect(page.locator('.spot-marker')).toHaveCount(1);
    if (!(await menu.isVisible())) await page.getByRole('button', { name: 'My spots' }).click();
    await menu.getByRole('button', { name: 'Directions to My car' }).click();
    await expect(controls(page).directions).toContainText('My car');
    await expect(sharing(page).button).toBeHidden();

    // A place chosen afterwards has its link again.
    await choosePlace(page, place);
    await expect(sharing(page).button).toBeVisible();
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the panel passes accessibility checks in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openMap(page);
    await openSharing(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#share-place')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
