import { expect, test } from '@playwright/test';
import { controls, openMap } from './app';
import { config, reading } from './site';

// The short message near the bottom of the map: it can be closed, and most
// messages go away by themselves. The page's clock is taken over so a test
// does not sit through the wait.

test.describe('with location allowed', () => {
  test.use({ permissions: ['geolocation'] });

  test('a message can be closed with its button', async ({ page, context }) => {
    await context.setGeolocation(reading([0, 0]));
    await openMap(page);
    await controls(page).locate.click();
    const { notice } = controls(page);
    await expect(notice).toContainText(`You need to be at ${config.name}`);
    await notice.getByRole('button', { name: 'Close this message' }).click();
    await expect(notice).toBeHidden();
  });

  test('a message goes away by itself after a few seconds', async ({ page, context }) => {
    await context.setGeolocation(reading([0, 0]));
    await page.clock.install();
    await openMap(page);
    await controls(page).locate.click();
    const { notice } = controls(page);
    await expect(notice).toBeVisible();
    // Still there well before the time is up.
    await page.clock.fastForward(5000);
    await expect(notice).toBeVisible();
    await page.clock.fastForward(5000);
    await expect(notice).toBeHidden();
  });

  test('a message is read out when it appears', async ({ page, context }) => {
    await context.setGeolocation(reading([0, 0]));
    await openMap(page);
    await controls(page).locate.click();
    await expect(controls(page).notice.getByRole('status')).toContainText('You need to be at');
  });
});

test('a message about something that stops the app stays until closed', async ({ page }) => {
  await page.clock.install();
  await page.goto('/not-a-map');
  const { notice } = controls(page);
  await expect(notice).toContainText('No site in the address');
  await page.clock.fastForward(60_000);
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Close this message' }).click();
  await expect(notice).toBeHidden();
});

test('the close button works from the keyboard', async ({ page }) => {
  await page.goto('/not-a-map');
  const { notice } = controls(page);
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Close this message' }).focus();
  await page.keyboard.press('Enter');
  await expect(notice).toBeHidden();
});
