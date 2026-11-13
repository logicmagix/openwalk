import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { farthestPair, labelOf } from './site';

// Planning a walk: the way from one chosen place to another, shown whole,
// wherever the person is and whether or not their position is known.

const { from, to } = farthestPair();

const fromLine = (page: Page) => page.getByRole('button', { name: /^From:/ });
const startBox = (page: Page) => page.getByRole('combobox', { name: 'Choose where to start' });

/** Chooses a start for the directions already open, by typing its name. */
async function startFrom(page: Page, name: string, label: string): Promise<void> {
  await fromLine(page).click();
  await startBox(page).fill(name);
  await controls(page).results.getByRole('option').filter({ hasText: label }).first().click();
}

test('directions say they start from the person until told otherwise', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  await expect(fromLine(page)).toHaveText(/From:\s*My location/);
});

test('a start can be chosen, and the walk is shown with no position known', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  const { directions, search } = controls(page);
  await expect(directions).toContainText('Turn on location');

  await fromLine(page).click();
  // The box now asks for a start, and offers the person's own position first.
  await expect(startBox(page)).toBeFocused();
  await expect(controls(page).results.getByRole('option').first()).toContainText('My location');
  await startBox(page).fill(from.properties.name);
  await controls(page)
    .results.getByRole('option')
    .filter({ hasText: labelOf(from) })
    .first()
    .click();

  await expect(fromLine(page)).toContainText(labelOf(from));
  await expect(directions).toContainText(/\d+(\.\d+)? (ft|mi|m|km), \d+ min/);
  // A planned walk is a preview: no heading, no prompt for location.
  await expect(directions).not.toContainText('Head ');
  await expect(page.getByRole('button', { name: 'Turn on location' })).toBeHidden();
  await expect(page.locator('#panel-arrow')).toBeHidden();
  // The box is back to finding a destination, holding the one chosen.
  await expect(search).toHaveValue(labelOf(to));
});

test('choosing my location again returns to directions that follow', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  await startFrom(page, from.properties.name, labelOf(from));
  await expect(controls(page).directions).toContainText(/\d+ min/);

  await fromLine(page).click();
  await controls(page)
    .results.getByRole('option', { name: /My location/ })
    .click();
  await expect(fromLine(page)).toHaveText(/From:\s*My location/);
  await expect(controls(page).directions).toContainText('Turn on location');
});

test('giving up on choosing a start changes nothing', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  await fromLine(page).click();
  await expect(startBox(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(controls(page).search).toHaveValue(labelOf(to));
  await expect(fromLine(page)).toHaveText(/From:\s*My location/);
});

test('closing the directions ends the planning', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, to);
  await startFrom(page, from.properties.name, labelOf(from));
  await page.getByRole('button', { name: 'Close directions' }).click();
  await choosePlace(page, to);
  await expect(fromLine(page)).toHaveText(/From:\s*My location/);
});

test.describe('with a position known', () => {
  test.use({ permissions: ['geolocation'] });

  test('a planned walk does not turn into arriving when the person is there', async ({
    page,
    context,
  }) => {
    const { arrivalPoint, reading } = await import('./site');
    await context.setGeolocation(reading(arrivalPoint(to)));
    await openMap(page);
    await controls(page).locate.click();
    await choosePlace(page, to);
    await expect(controls(page).directions).toContainText('You have arrived.');
    await startFrom(page, from.properties.name, labelOf(from));
    await expect(controls(page).directions).toContainText(/\d+ min/);
    await expect(controls(page).directions).not.toContainText('You have arrived.');
  });
});
