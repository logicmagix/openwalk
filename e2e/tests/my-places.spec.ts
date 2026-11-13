import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { MAP_PATH, SITE_ID, farthestPair, labelOf } from './site';

// "My places": looking over what is saved, removing it, sending it to another
// device and adding what another device sent. Nothing here involves a server.

const { from, to } = farthestPair();

function panel(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'My places' });
  return {
    dialog,
    status: dialog.getByRole('status'),
    rows: dialog.locator('.kept-list li'),
    link: dialog.getByRole('textbox', { name: 'Link', exact: true }),
    pasted: dialog.getByRole('textbox', { name: 'Paste a link' }),
    add: dialog.getByRole('button', { name: 'Add', exact: true }),
    close: dialog.getByRole('button', { name: 'Close my places' }),
  };
}

async function openMyPlaces(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Map legend' }).click();
  await page.getByRole('button', { name: 'My places' }).click();
  await expect(panel(page).dialog).toBeVisible();
}

/** Saves the destination as a place, and the walk to it from the start as a route. */
async function saveOneOfEach(page: Page): Promise<void> {
  await choosePlace(page, to);
  await page.getByRole('button', { name: 'Save this place' }).click();
  await page.getByRole('button', { name: /^From:/ }).click();
  await page.getByRole('combobox', { name: 'Choose where to start' }).fill(from.properties.name);
  await controls(page)
    .results.getByRole('option')
    .filter({ hasText: labelOf(from) })
    .first()
    .click();
  await page.getByRole('button', { name: 'Save route' }).click();
  await page.getByRole('button', { name: 'Close directions' }).click();
}

/** The link the panel offers for what is saved. */
async function linkOf(page: Page): Promise<string> {
  await openMyPlaces(page);
  const link = await panel(page).link.inputValue();
  await panel(page).close.click();
  return link;
}

test('with nothing saved the panel says so and offers nothing to send', async ({ page }) => {
  await openMap(page);
  await openMyPlaces(page);
  await expect(panel(page).dialog).toContainText('Nothing saved yet');
  await expect(
    panel(page).dialog.getByRole('heading', { name: 'Send to another device' }),
  ).toBeHidden();
  await expect(panel(page).pasted).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page).dialog).toBeHidden();
});

test('saved places and routes are listed and each can be removed', async ({ page }) => {
  await openMap(page);
  await saveOneOfEach(page);
  await openMyPlaces(page);
  const { rows, dialog, status } = panel(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(labelOf(to));
  await expect(rows.nth(0)).toContainText('Saved place');
  await expect(rows.nth(1)).toContainText(`${labelOf(from)} → ${labelOf(to)}`);
  await expect(rows.nth(1)).toContainText('Saved route');

  await dialog.getByRole('button', { name: `Remove ${labelOf(to)}`, exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(status).toContainText('Removed');
  await rows.getByRole('button').click();
  await expect(dialog).toContainText('Nothing saved yet');

  // The search list no longer leads with them.
  await panel(page).close.click();
  await controls(page).search.fill('');
  await controls(page).search.click();
  await expect(controls(page).results.locator('li.saved, li.route')).toHaveCount(0);
});

test('removing a place from the panel empties its star in open directions', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  const star = page.getByRole('button', { name: 'Save this place' });
  await star.click();
  await openMyPlaces(page);
  await panel(page).rows.getByRole('button').click();
  await panel(page).close.click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
});

test('recent places can be cleared', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  await page.getByRole('button', { name: 'Close directions' }).click();
  await openMyPlaces(page);
  const clear = panel(page).dialog.getByRole('button', { name: 'Clear recent places' });
  await clear.click();
  await expect(clear).toBeHidden();
  await panel(page).close.click();
  await controls(page).search.fill('');
  await controls(page).search.click();
  await expect(controls(page).results.locator('li.recent')).toHaveCount(0);
});

test('what is saved is offered as a code to scan and a link to this map', async ({
  page,
  baseURL,
}) => {
  await openMap(page);
  await saveOneOfEach(page);
  await openMyPlaces(page);
  const { dialog, link } = panel(page);
  await expect(dialog.getByRole('img', { name: /carries your saved places/ })).toBeVisible();
  const address = await link.inputValue();
  expect(address.startsWith(`${new URL(baseURL!).origin}${MAP_PATH}#places=`)).toBe(true);
  // Names of places only: nothing that looks like a position.
  const carried = Buffer.from(address.split('#places=')[1]!, 'base64url').toString('utf8');
  expect(JSON.parse(carried)).toEqual({ v: 1, s: SITE_ID, p: [to.id], r: [[from.id, to.id]] });
});

test('a link pasted on another device adds what it carries', async ({ page, browser }) => {
  await openMap(page);
  await saveOneOfEach(page);
  const link = await linkOf(page);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await openMap(otherPage);
  await openMyPlaces(otherPage);
  const there = panel(otherPage);
  await there.pasted.fill(link);
  await there.add.click();
  await expect(there.status).toHaveText('Added 1 place and 1 route.');
  await expect(there.rows).toHaveCount(2);
  // Adding it again changes nothing.
  await there.pasted.fill(link);
  await there.add.click();
  await expect(there.status).toHaveText('Nothing new: you already have these.');
  await expect(there.rows).toHaveCount(2);
  await other.close();
});

test('opening such a link offers what it carries and takes nothing unasked', async ({
  page,
  browser,
}) => {
  await openMap(page);
  await saveOneOfEach(page);
  const link = await linkOf(page);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  const there = panel(otherPage);
  await expect(there.dialog).toBeVisible();
  await expect(there.status).toContainText('Press Add');
  await expect(there.rows).toHaveCount(0);
  // The data is gone from the address, so a reload does not offer it again.
  expect(new URL(otherPage.url()).hash).toBe('');
  await there.add.click();
  await expect(there.status).toHaveText('Added 1 place and 1 route.');
  await expect(there.rows).toHaveCount(2);
  await other.close();
});

test('what cannot be added is refused with a reason', async ({ page }) => {
  await openMap(page);
  await openMyPlaces(page);
  const { pasted, add, status, rows } = panel(page);
  await pasted.fill('see you at the library');
  await add.click();
  await expect(status).toHaveText('That is not a link or a file of saved places.');

  const elsewhere = Buffer.from(JSON.stringify({ v: 1, s: 'another-place', p: ['somewhere'] }));
  await pasted.fill(
    `https://maps.example/s/another-place/#places=${elsewhere.toString('base64url')}`,
  );
  await add.click();
  await expect(status).toHaveText('Those places belong to a different map.');

  const gone = Buffer.from(JSON.stringify({ v: 1, s: SITE_ID, p: ['no-such-place', to.id] }));
  await pasted.fill(gone.toString('base64url'));
  await add.click();
  await expect(status).toContainText('Added 1 place.');
  await expect(status).toContainText('1 was left out');
  await expect(rows).toHaveCount(1);
});

test('a file saved on one device can be chosen on another', async ({ page, browser }) => {
  await openMap(page);
  await saveOneOfEach(page);
  await openMyPlaces(page);
  const download = page.waitForEvent('download');
  await panel(page).dialog.getByRole('button', { name: 'Save as a file' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe(`openwalk-${SITE_ID}-places.json`);
  const path = await saved.path();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await openMap(otherPage);
  await openMyPlaces(otherPage);
  await otherPage.locator('#my-places-file').setInputFiles(path);
  await expect(panel(otherPage).status).toHaveText('Added 1 place and 1 route.');
  await other.close();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the panel passes accessibility checks in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openMap(page);
    await saveOneOfEach(page);
    await openMyPlaces(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .include('#my-places')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test('the panel is open again when the app restarts while it was open', async ({ page }) => {
  await openMap(page);
  await openMyPlaces(page);
  // As when a phone starts the app afresh on returning to it from another.
  await page.waitForTimeout(250);
  await page.reload();
  await expect(panel(page).dialog).toBeVisible();

  // Closed on purpose, it stays closed.
  await panel(page).close.click();
  await page.waitForTimeout(250);
  await page.reload();
  await openMap(page);
  await expect(panel(page).dialog).toBeHidden();
});

test('no field has text small enough to make a phone enlarge the page', async ({ page }) => {
  await openMap(page);
  await openMyPlaces(page);
  const sizes = await page
    .locator('input[type="text"], input[type="search"], input:not([type])')
    .evaluateAll((fields) => fields.map((field) => parseFloat(getComputedStyle(field).fontSize)));
  expect(sizes.length).toBeGreaterThan(2);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
});
