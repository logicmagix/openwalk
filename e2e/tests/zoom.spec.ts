import { expect, test } from '@playwright/test';
import { openMap } from './app';

test('the zoom buttons step the map and stop at its limits', async ({ page }) => {
  await openMap(page);
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  await expect(zoomIn).toBeEnabled();
  await expect(zoomOut).toBeEnabled();

  // Zooming out ends where the whole site is in view; the button then goes gray.
  for (let step = 0; step < 12 && (await zoomOut.isEnabled()); step += 1) {
    await zoomOut.click();
    await page.waitForTimeout(350);
  }
  await expect(zoomOut).toBeDisabled();
  await expect(zoomIn).toBeEnabled();

  // One step back in gives room to zoom out again.
  await zoomIn.click();
  await expect(zoomOut).toBeEnabled();
});

test('the zoom buttons work from the keyboard', async ({ page }) => {
  await openMap(page);
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  await zoomOut.focus();
  for (let step = 0; step < 12 && (await zoomOut.isEnabled()); step += 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
  }
  await expect(zoomOut).toBeDisabled();
});

test('tapping a control twice quickly does not zoom the whole page', async ({ page }) => {
  await openMap(page);
  // The page asks the browser not to treat a double tap as "zoom the page"; a
  // real double-tap zoom cannot be produced here, so the request itself is checked.
  for (const name of ['Zoom in', 'Zoom out', 'Show my location', 'Map layers', 'Map legend']) {
    const action = await page
      .getByRole('button', { name })
      .evaluate((button) => getComputedStyle(button).touchAction);
    expect(action, name).toBe('manipulation');
  }
});
