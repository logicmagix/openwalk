import { expect, test } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, config, farthestPair, places, reading } from './site';

// What someone using a keyboard or a screen reader meets: search first, a
// clear button that answers the keyboard, and directions that are read out
// when they change rather than with every step.

test('the keyboard reaches search before anything in the map', async ({ page }) => {
  await openMap(page);
  await page.keyboard.press('Tab');
  await expect(controls(page).search).toBeFocused();
});

test('the clear button works from the keyboard', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  const place = places[0];
  if (place === undefined) throw new Error('the site has no places');
  await search.fill(place.properties.name);
  const clear = page.getByRole('button', { name: 'Clear search' });
  await clear.focus();
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(results).toBeVisible();
});

test('the map is a named region and takes no keys from a screen reader', async ({ page }) => {
  await openMap(page);
  await expect(page.getByRole('region', { name: 'Map', exact: true })).toHaveCount(1);
  await expect(page.getByRole('application')).toHaveCount(0);
});

test.describe('directions read aloud', () => {
  test.use({ permissions: ['geolocation'] });

  test('a destination and an arrival are each announced', async ({ page, context }) => {
    const { from, to } = farthestPair();
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    const { locate, directions } = controls(page);
    const announcer = directions.getByRole('status');

    await locate.click();
    await choosePlace(page, to);
    await expect(directions).toContainText(/\d+ min/);
    // Only the announcer is live; the visible line changes too often to be.
    await expect(directions).not.toHaveAttribute('aria-live');
    // The destination is named once, with how far and which way.
    await expect(announcer).toContainText(to.properties.name);
    await expect(announcer).toContainText(/\d+ min/);

    await context.setGeolocation(reading(arrivalPoint(to)));
    await expect(announcer).toHaveText('You have arrived.');
  });
});

test('Escape closes the search list and stays in the box', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  await search.focus();
  await expect(results).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(results).toBeHidden();
  await expect(search).toBeFocused();
});

test('the page is named by a heading and search is a landmark', async ({ page }) => {
  await openMap(page);
  await expect(page.getByRole('heading', { level: 1, name: config.name })).toHaveCount(1);
  await expect(page.getByRole('search')).toHaveCount(1);
  // The layers button opens a group of switches, not a menu, and says so.
  await expect(page.getByRole('button', { name: 'Map layers' })).not.toHaveAttribute(
    'aria-haspopup',
  );
});

test('a focused control shows a ring with a contrasting band around it', async ({ page }) => {
  await openMap(page);
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await zoomIn.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(zoomIn).toBeFocused();
  const ring = await zoomIn.evaluate((button) => {
    const style = getComputedStyle(button);
    return { outline: style.outlineStyle, width: style.outlineWidth, halo: style.boxShadow };
  });
  expect(ring.outline).toBe('solid');
  expect(ring.width).toBe('3px');
  // Two bands of the surface colour: one inside the ring and one outside it.
  expect(ring.halo.match(/0px 0px 0px (2|7)px/g)).toHaveLength(2);
});

test.describe('with less motion asked for', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the direction arrow turns without a glide', async ({ page }) => {
    await openMap(page);
    const duration = await page
      .locator('#panel-arrow')
      .evaluate((arrow) => getComputedStyle(arrow).transitionDuration);
    expect(duration).toBe('0s');
  });
});

test('the focus ring on a "nearest" button is not cut off by its row', async ({ page }) => {
  test.skip((config.nearest ?? []).length === 0, 'the site offers no nearest buttons');
  await openMap(page);
  const row = page.getByRole('group', { name: 'Find the nearest' });
  // The ring and its band reach 7px beyond a button; the row clips at its edge.
  const REACH_PX = 7;
  const rowBox = await row.boundingBox();
  const buttons = await row.getByRole('button').all();
  const first = await buttons[0]?.boundingBox();
  if (rowBox === null || first === null || first === undefined) {
    throw new Error('the nearest buttons are not on the page');
  }
  expect(first.x - rowBox.x).toBeGreaterThanOrEqual(REACH_PX);
  expect(first.y - rowBox.y).toBeGreaterThanOrEqual(REACH_PX);
  expect(rowBox.y + rowBox.height - (first.y + first.height)).toBeGreaterThanOrEqual(REACH_PX);
});

test('Tab leaves the search box, closes its list and does not stop on it', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  await search.focus();
  await expect(results).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(results).toBeHidden();
  // The next stop is a control, not the list.
  const stop = await page.evaluate(() => document.activeElement?.tagName);
  expect(stop).toBe('BUTTON');
});
