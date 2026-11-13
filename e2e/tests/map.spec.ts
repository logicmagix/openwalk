import { expect, test } from '@playwright/test';
import { LIST_EXTRA_ROWS, choosePlace, controls, openMap, showEveryPlace } from './app';
import { MAP_PATH, config, labelOf, places } from './site';

test('the map opens, named after the site', async ({ page }) => {
  await openMap(page);
  await expect(page).toHaveTitle(new RegExp(config.name));
  await expect(page.locator('#map canvas')).toBeVisible();
  await expect(controls(page).locate).toBeEnabled();
});

test('the search box lists every place before anything is typed', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  await search.click();
  await showEveryPlace(page);
  await expect(results.getByRole('option')).toHaveCount(places.length + LIST_EXTRA_ROWS);
});

test('search finds a place by the start of its name', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  const place = places[0]!;
  await search.fill(place.properties.name.slice(0, 4));
  await expect(
    results
      .getByRole('option')
      .filter({ hasText: labelOf(place) })
      .first(),
  ).toBeVisible();
});

test('search forgives a typing slip', async ({ page }) => {
  await openMap(page);
  const { search, results } = controls(page);
  // A long word from some place's name, with two neighboring letters swapped.
  const place = places.find((p) => /[a-z]{8,}/i.test(p.properties.name));
  test.skip(place === undefined, 'no place has a word long enough to mistype');
  const word = /[a-z]{8,}/i.exec(place!.properties.name)![0];
  const slip = word.slice(0, 3) + word[4] + word[3] + word.slice(5);
  await search.fill(slip);
  await expect(
    results
      .getByRole('option')
      .filter({ hasText: labelOf(place!) })
      .first(),
  ).toBeVisible();
});

test('the keyboard alone can choose a place', async ({ page }) => {
  await openMap(page);
  const { search, directions } = controls(page);
  const place = places[0]!;
  await search.focus();
  await page.keyboard.type(place.properties.name);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(directions).toContainText(place.properties.name);
});

test('choosing a place without location offers to turn it on', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, places[0]!);
  const { directions } = controls(page);
  await expect(directions).toContainText('Turn on location to get directions.');
  await expect(directions.getByRole('button', { name: 'Turn on location' })).toBeVisible();
});

test('a share link opens the map on its place', async ({ page }) => {
  const place = places[0]!;
  await openMap(page, `/p/${MAP_PATH.split('/')[2]}/${place.id}`);
  await expect(controls(page).directions).toContainText(place.properties.name);
});

test('a share link to a place that does not exist says so', async ({ page }) => {
  await openMap(page, `/p/${MAP_PATH.split('/')[2]}/no-such-place`);
  await expect(controls(page).notice).toHaveText('That place is not on this map.');
});
