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

test('a marked spot is kept, and leads back from somewhere else', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  await openMenu(page);
  await spots(page).park.click();
  await expect(spots(page).markers).toHaveCount(1);

  await context.setGeolocation(reading(arrivalPoint(to)));
  await revisit(page);
  await expect(spots(page).markers).toHaveCount(1);
  await controls(page).locate.click();
  await openMenu(page);
  await spots(page).menu.getByRole('button', { name: 'Directions to My car' }).click();
  const { directions } = controls(page);
  await expect(directions).toContainText('My car');
  await expect(directions).toContainText(/\d+(\.\d+)? (ft|mi|m|km), \d+ min/);
  // A spot is the person's own already: there is nothing to star.
  await expect(page.getByRole('button', { name: 'Save this place' })).toBeHidden();

  // Walking back to it ends with arrival.
  await context.setGeolocation(reading(arrivalPoint(from)));
  await expect(directions).toContainText('You have arrived.');
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
