import { expect, test } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, config, farAway, farthestPair, places, reading } from './site';

// The browser is told where it is; nothing here needs a real GPS.
const { from, to } = farthestPair();

test.describe('with location allowed', () => {
  test.use({ permissions: ['geolocation'] });

  test('directions give a distance, a time and a heading', async ({ page, context }) => {
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    const { locate, directions } = controls(page);
    await locate.click();
    await expect(locate).toHaveAttribute('aria-pressed', 'true');
    await choosePlace(page, to);
    await expect(directions).toContainText(/\d+(\.\d+)? (ft|mi|m|km), \d+ min/);
    await expect(directions).toContainText(/Head (north|south|east|west)/);
  });

  test('walking to the destination ends with arrival', async ({ page, context }) => {
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    const { locate, directions } = controls(page);
    await locate.click();
    await choosePlace(page, to);
    await expect(directions).toContainText(/\d+ min/);
    // The person is now standing where the directions end.
    await context.setGeolocation(reading(arrivalPoint(to)));
    await expect(directions).toContainText('You have arrived.');
  });

  test('turning location on from the directions panel starts the directions', async ({
    page,
    context,
  }) => {
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    await choosePlace(page, to);
    const { directions, locate } = controls(page);
    await directions.getByRole('button', { name: 'Turn on location' }).click();
    await expect(locate).toHaveAttribute('aria-pressed', 'true');
    await expect(directions).toContainText(/\d+ min/);
  });

  test('a nearest button picks a place of its category', async ({ page, context }) => {
    const nearest = config.nearest?.[0];
    test.skip(nearest === undefined, 'the site configures no nearest buttons');
    await context.setGeolocation(reading(arrivalPoint(from)));
    await openMap(page);
    await page.getByRole('button', { name: `Nearest ${nearest!.label.toLowerCase()}` }).click();
    const names = places
      .filter((p) => p.properties.category === nearest!.category)
      .map((p) => p.properties.name);
    const { directions } = controls(page);
    await expect(directions.getByRole('heading')).toHaveText(
      new RegExp(names.map(escape).join('|')),
    );
  });

  test('away from the site there is no position and no route', async ({ page, context }) => {
    await context.setGeolocation(reading(farAway()));
    await openMap(page);
    const { locate, notice, directions } = controls(page);
    await locate.click();
    await expect(notice).toContainText(`You need to be at ${config.name}`);
    await expect(locate).toHaveAttribute('aria-pressed', 'false');
    // Choosing a destination still plans nothing.
    await choosePlace(page, to);
    await expect(directions).toContainText(`Directions start when you are at ${config.name}.`);
    await expect(directions).not.toContainText(/\d+ min/);
  });
});

test('with location refused the map still works and says why there is no position', async ({
  page,
}) => {
  await openMap(page);
  const { locate, notice } = controls(page);
  await locate.click();
  await expect(notice).toContainText('Location access is off');
  await choosePlace(page, to);
});

/** Escapes a name for use inside a regular expression. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
