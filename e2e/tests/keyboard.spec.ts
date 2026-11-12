import { expect, test } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, farthestPair, places, reading } from './site';

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
