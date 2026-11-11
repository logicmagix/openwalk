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

test('a request added to the page by the network does not stop it becoming ready', async ({
  page,
}) => {
  // Some networks add a script of their own to the pages they serve, which
  // reports back to an address on the same host. It is not one of the app's
  // files and cannot be fetched again, so it must not be waited for.
  await page.route('**/added-by-the-network', (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    navigator.sendBeacon('/added-by-the-network');
  });
  await openMap(page);
  await expect(page.getByText('Ready to use offline')).toBeVisible({ timeout: 30_000 });
});
