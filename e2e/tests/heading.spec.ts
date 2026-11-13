import { expect, test, type Page } from '@playwright/test';
import { controls, openMap } from './app';
import { arrivalPoint, places, reading } from './site';

// The fan beside the position dot that shows which way the person faces. A
// phone's compass is stood in for by sending the page the event a compass sends.

test.use({ permissions: ['geolocation'] });

const wedge = (page: Page) => page.locator('.heading-wedge');

/**
 * Tells the page the phone points this many degrees clockwise from north. The
 * event is a plain one given the fields a compass event carries, because not
 * every browser engine lets a page construct the real kind.
 */
async function pointPhone(page: Page, heading: number): Promise<void> {
  await page.evaluate(
    (alpha) => {
      const event = new Event('deviceorientationabsolute');
      // An absolute reading counts counter-clockwise from north.
      Object.assign(event, { alpha, beta: 0, gamma: 0, absolute: true });
      window.dispatchEvent(event);
    },
    (360 - heading) % 360,
  );
}

async function locate(page: Page): Promise<void> {
  await controls(page).locate.click();
  await expect(controls(page).locate).toHaveAttribute('aria-pressed', 'true');
}

test('no fan is drawn while the phone gives no direction', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  await locate(page);
  await page.waitForTimeout(600);
  await expect(wedge(page)).toHaveCount(0);
});

/** How far the fan is turned, in degrees, read from the rotation the map library gives it. */
async function turnOf(page: Page): Promise<number> {
  const style = (await wedge(page).getAttribute('style')) ?? '';
  return Number(/rotateZ\(([\d.]+)deg\)/.exec(style)?.[1] ?? NaN);
}

test('the fan points the way the compass says, and turns with it', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  await locate(page);
  // A compass reading is for a phone held upright; the app allows for the
  // screen being turned, and a test browser's screen may report that it is.
  const screenTurn = await page.evaluate(() => window.screen.orientation?.angle ?? 0);
  const facing = (heading: number) => (heading + screenTurn) % 360;

  await pointPhone(page, 90);
  await expect(wedge(page)).toHaveCount(1);
  await expect.poll(() => turnOf(page)).toBe(facing(90));

  // A steady new reading is followed, a step at a time, until it is reached.
  for (let i = 0; i < 40; i += 1) await pointPhone(page, 180);
  await expect.poll(() => turnOf(page)).toBeCloseTo(facing(180), 0);
});

test('the fan goes when location is switched off', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  await locate(page);
  await pointPhone(page, 45);
  await expect(wedge(page)).toHaveCount(1);
  await controls(page).locate.click();
  await expect(wedge(page)).toHaveCount(0);
  // Nothing is listening once location is off.
  await pointPhone(page, 45);
  await page.waitForTimeout(300);
  await expect(wedge(page)).toHaveCount(0);
});

test('the fan is for looking at: presses pass through to the map', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  await locate(page);
  await pointPhone(page, 0);
  await expect(wedge(page)).toHaveCount(1);
  const passes = await wedge(page).evaluate(
    (element) => getComputedStyle(element).pointerEvents === 'none',
  );
  expect(passes).toBe(true);
});
