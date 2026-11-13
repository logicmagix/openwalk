import { expect, test } from '@playwright/test';
import { controls, openMap } from './app';
import { arrivalPoint, config, places, reading } from './site';

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

test.describe('a position that is still rough', () => {
  test.use({ permissions: ['geolocation'] });

  const MESSAGE = 'Finding a more exact position…';
  /**
   * A reading at the site with the given uncertainty, in meters. Each is a step
   * from the last, as a real one would be.
   */
  let step = 0;
  const fix = (accuracy: number) => {
    const at = reading(arrivalPoint(places[0]!));
    step += 1;
    return { longitude: at.longitude, latitude: at.latitude + step * 0.00001, accuracy };
  };

  test('is said so, until the reading tightens', async ({ page, context }) => {
    await context.setGeolocation(fix(80));
    await openMap(page);
    await controls(page).locate.click();
    const { notice } = controls(page);
    await expect(notice).toContainText(MESSAGE);
    // The dot is still shown: a rough position is better than none.
    await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'true');

    await context.setGeolocation(fix(8));
    await expect(notice).toBeHidden();
  });

  test('is not mentioned when the first reading is already good', async ({ page, context }) => {
    await context.setGeolocation(fix(8));
    await openMap(page);
    await controls(page).locate.click();
    await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);
    await expect(controls(page).notice).toBeHidden();
  });

  test('goes with the position when location is switched off', async ({ page, context }) => {
    await context.setGeolocation(fix(80));
    await openMap(page);
    await controls(page).locate.click();
    await expect(controls(page).notice).toContainText(MESSAGE);
    await controls(page).locate.click();
    await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'false');
    await expect(controls(page).notice).toBeHidden();
  });

  test('stays closed once closed, while the reading is still rough', async ({ page, context }) => {
    await context.setGeolocation(fix(80));
    await openMap(page);
    await controls(page).locate.click();
    const { notice } = controls(page);
    await expect(notice).toContainText(MESSAGE);
    await notice.getByRole('button', { name: 'Close this message' }).click();
    await context.setGeolocation(fix(70));
    await page.waitForTimeout(500);
    await expect(notice).toBeHidden();
  });
});

test.describe('a message that no position could be had', () => {
  test.use({ permissions: ['geolocation'] });

  test('goes once a position arrives', async ({ page, context }) => {
    const here = reading(arrivalPoint(places[0]!));
    await context.setGeolocation(here);
    await openMap(page);
    await controls(page).locate.click();
    await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'true');
    // Changing the position the browser reports makes it say, for a moment,
    // that it has none, and then give the new one.
    await context.setGeolocation({ ...here, latitude: here.latitude + 0.00002 });
    await page.waitForTimeout(1500);
    await expect(controls(page).notice).toBeHidden();
  });
});
