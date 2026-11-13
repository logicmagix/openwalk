import { expect, test, type Page } from '@playwright/test';
import { controls, openMap } from './app';
import { arrivalPoint, farthestPair, reading } from './site';

// Spots: points someone marks for themselves, such as where the car is parked,
// and is later led back to. Marking one needs a position, so the browser is
// told where it is.

const { from, to } = farthestPair();

test.use({ permissions: ['geolocation'] });

function spots(page: Page) {
  const menu = page.getByRole('group', { name: 'My spots' });
  return {
    button: page.getByRole('button', { name: 'My spots' }),
    menu,
    park: menu.getByRole('button', { name: /my car here/ }),
    add: menu.getByRole('button', { name: 'Save a spot here' }),
    rows: menu.locator('.spots-list li'),
    markers: page.locator('.spot-marker'),
  };
}

async function openMenu(page: Page): Promise<void> {
  const { button, menu } = spots(page);
  if (!(await menu.isVisible())) await button.click();
  await expect(menu).toBeVisible();
}

// A spot is written to the device's store a moment after it is marked.
async function revisit(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.reload();
  await openMap(page);
}

test('the menu offers to mark the car and a spot, and lists none to begin with', async ({
  page,
  context,
}) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  const { park, add, rows } = spots(page);
  await expect(park).toHaveText('Park my car here');
  await expect(add).toBeVisible();
  await expect(rows).toHaveCount(0);
});

test('parking with location off turns it on and saves the car where the person is', async ({
  page,
  context,
}) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(controls(page).notice).toContainText('“My car” is saved here.');
  await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'true');
  await expect(spots(page).markers).toHaveCount(1);

  await openMenu(page);
  await expect(spots(page).rows).toHaveCount(1);
  await expect(spots(page).rows).toContainText('My car');
  // There is one car: the offer is now to move it.
  await expect(spots(page).park).toHaveText('Move my car here');
});

test('a marked spot is still there on the next visit', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(spots(page).markers).toHaveCount(1);

  await revisit(page);
  await expect(spots(page).markers).toHaveCount(1);
  await openMenu(page);
  await expect(spots(page).rows).toContainText('My car');
});

test('a spot leads back from somewhere else', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(spots(page).markers).toHaveCount(1);

  // The person walks off, then asks the way back.
  await context.setGeolocation(reading(arrivalPoint(to)));
  await openMenu(page);
  await spots(page).menu.getByRole('button', { name: 'Directions to My car' }).click();
  const { directions } = controls(page);
  await expect(directions).toContainText('My car');
  await expect(directions).toContainText(/\d+(\.\d+)? (ft|mi|m|km), \d+ min/);
  // A spot is the person's own already: there is nothing to star.
  await expect(page.getByRole('button', { name: 'Save this place' })).toBeHidden();
});

test('standing at a spot counts as having arrived at it', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).add.click();
  await expect(spots(page).markers).toHaveCount(1);
  await openMenu(page);
  await spots(page).menu.getByRole('button', { name: 'Directions to My spot' }).click();
  await expect(controls(page).directions).toContainText('You have arrived.');
});

test('further spots are named in turn, and can be renamed and removed', async ({
  page,
  context,
}) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await controls(page).locate.click();
  for (const name of ['My spot', 'My spot 2']) {
    await openMenu(page);
    await spots(page).add.click();
    await expect(controls(page).notice).toContainText(`Saved here as “${name}”.`);
  }
  await openMenu(page);
  const { rows, menu } = spots(page);
  await expect(rows).toHaveCount(2);

  await menu.getByRole('button', { name: 'Rename or remove My spot 2' }).click();
  await menu.getByRole('button', { name: 'Rename', exact: true }).click();
  const name = menu.getByRole('textbox', { name: 'Name for My spot 2' });
  await expect(name).toBeFocused();
  await name.fill('Big bass');
  await page.keyboard.press('Enter');
  await expect(rows.nth(1)).toContainText('Big bass');

  await menu.getByRole('button', { name: 'Rename or remove My spot', exact: true }).click();
  await menu.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(spots(page).markers).toHaveCount(1);

  // The name survives a reload, and the freed name is used again.
  await revisit(page);
  await controls(page).locate.click();
  await openMenu(page);
  await expect(spots(page).rows).toContainText('Big bass');
  await spots(page).add.click();
  await expect(controls(page).notice).toContainText('Saved here as “My spot”.');
});

test('spots head the search list', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(spots(page).markers).toHaveCount(1);
  await controls(page).search.click();
  const first = controls(page).results.getByRole('option').first();
  await expect(first).toContainText('My car');
  await expect(first).toContainText('Where you parked');
});

test('away from the site no spot is marked', async ({ page, context }) => {
  await context.setGeolocation(reading([0, 0]));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(controls(page).notice).toContainText('You need to be at');
  await expect(spots(page).markers).toHaveCount(0);
  await openMenu(page);
  await expect(spots(page).rows).toHaveCount(0);
});

test('the menu works from the keyboard and Escape closes it', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  const { button, menu } = spots(page);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
});

test.describe('a copy of one’s spots in a file', () => {
  const myPlaces = (page: Page) => page.getByRole('dialog', { name: 'My places' });

  async function openMyPlaces(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Map legend' }).click();
    await page.getByRole('button', { name: 'My places' }).click();
    await expect(myPlaces(page)).toBeVisible();
  }

  /** Marks the car, then saves a file from "My places", with spots or without. */
  async function saveFile(page: Page, withSpots: boolean): Promise<{ path: string; text: string }> {
    await openMenu(page);
    await spots(page).park.click();
    await expect(spots(page).markers).toHaveCount(1);
    await openMyPlaces(page);
    const tick = myPlaces(page).getByRole('checkbox', { name: /Include my spots/ });
    await expect(tick).not.toBeChecked();
    if (withSpots) await tick.check();
    const download = page.waitForEvent('download');
    await myPlaces(page).getByRole('button', { name: 'Save as a file' }).click();
    const path = await (await download).path();
    const { readFileSync } = await import('node:fs');
    return { path, text: readFileSync(path, 'utf8') };
  }

  test('spots stay out of the file unless asked for, and never appear in a link', async ({
    page,
    context,
  }) => {
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    const { text } = await saveFile(page, false);
    expect(JSON.parse(text)).not.toHaveProperty('x');
    // With only a spot marked there is nothing a link may carry, so none is offered.
    await expect(myPlaces(page).getByRole('textbox', { name: 'Link', exact: true })).toBeHidden();
  });

  test('a file with spots brings them to another device', async ({ page, context, browser }) => {
    const start = arrivalPoint(from);
    await context.setGeolocation(reading(start));
    await openMap(page);
    const { path, text } = await saveFile(page, true);
    const [spot] = (JSON.parse(text) as { x: { k: string; n: string; c: number[] }[] }).x;
    expect(spot).toMatchObject({ k: 'car', n: 'My car' });
    expect(spot?.c[0]).toBeCloseTo(start[0], 5);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await openMap(otherPage);
    await openMyPlaces(otherPage);
    await otherPage.locator('#my-places-file').setInputFiles(path);
    await expect(myPlaces(otherPage).getByRole('status')).toHaveText('Added 1 spot.');
    await myPlaces(otherPage).getByRole('button', { name: 'Close my places' }).click();
    await expect(spots(otherPage).markers).toHaveCount(1);
    // Choosing the same file again adds nothing.
    await openMyPlaces(otherPage);
    await otherPage.locator('#my-places-file').setInputFiles(path);
    await expect(myPlaces(otherPage).getByRole('status')).toHaveText(
      'Nothing new: you already have these.',
    );
    await other.close();
  });
});

test.describe('marking a spot while the position is still rough', () => {
  /** A reading at the start with the given uncertainty, each a step from the last. */
  let step = 0;
  const fix = (accuracy: number) => {
    const at = reading(arrivalPoint(from));
    step += 1;
    return { longitude: at.longitude, latitude: at.latitude + step * 0.00001, accuracy };
  };

  test('waits for the reading to settle, then marks the spot there', async ({ page, context }) => {
    await context.setGeolocation(fix(80));
    await openMap(page);
    await openMenu(page);
    await spots(page).park.click();
    await expect(controls(page).notice).toContainText('Finding where you are…');
    await page.waitForTimeout(800);
    // Nothing is marked at the rough reading.
    await expect(spots(page).markers).toHaveCount(0);

    await context.setGeolocation(fix(8));
    await expect(controls(page).notice).toContainText('“My car” is saved here.');
    await expect(controls(page).notice).not.toContainText('rough');
    await expect(spots(page).markers).toHaveCount(1);
  });

  test('marks the spot anyway after a while, and says it may be off', async ({ page, context }) => {
    await page.clock.install();
    await context.setGeolocation(fix(80));
    await openMap(page);
    await openMenu(page);
    await spots(page).add.click();
    await expect(controls(page).notice).toContainText('Finding where you are…');
    await page.clock.fastForward(10_000);
    await expect(spots(page).markers).toHaveCount(0);
    await page.clock.fastForward(6_000);
    await expect(controls(page).notice).toContainText('Saved here as “My spot”.');
    await expect(controls(page).notice).toContainText('it may be a little off');
    await expect(spots(page).markers).toHaveCount(1);
  });

  test('gives up when location is switched off before a spot is marked', async ({
    page,
    context,
  }) => {
    await page.clock.install();
    await context.setGeolocation(fix(80));
    await openMap(page);
    await openMenu(page);
    await spots(page).park.click();
    await expect(controls(page).notice).toContainText('Finding where you are…');
    await controls(page).locate.click();
    await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'false');
    await page.clock.fastForward(20_000);
    await expect(spots(page).markers).toHaveCount(0);
  });
});
