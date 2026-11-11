import { expect, test } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, farthestPair, reading } from './site';

test.use({ permissions: ['geolocation'] });

test('after one visit the app works with no network', async ({ page, context }) => {
  const { from, to } = farthestPair();
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  // The app says when everything it needs has been stored on the device.
  await expect(page.getByText('Ready to use offline')).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await page.reload();
  const { search, locate, directions } = controls(page);
  await expect(search).toBeEnabled();
  await expect(page.locator('#map canvas')).toBeVisible();
  await locate.click();
  await choosePlace(page, to);
  await expect(directions).toContainText(/\d+ min/);
});
