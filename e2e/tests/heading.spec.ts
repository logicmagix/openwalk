import { expect, test, type Page } from '@playwright/test';
import { controls, openMap } from './app';
import { arrivalPoint, places, reading } from './site';

// The fan beside the position dot that shows which way the person faces. A
// phone's compass is stood in for by sending the page the event a compass sends.

test.use({ permissions: ['geolocation'] });

const wedge = (page: Page) => page.locator('.heading-wedge');

/** Whether this browser has the compass event at all; a desktop engine may not. */
const hasCompass = (page: Page) =>
  page.evaluate(() => typeof DeviceOrientationEvent !== 'undefined');

/** Tells the page the phone points this many degrees clockwise from north. */
async function pointPhone(page: Page, heading: number): Promise<void> {
  await page.evaluate(
    (alpha) => {
      // An absolute reading counts counter-clockwise from north.
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientationabsolute', {
          alpha,
          beta: 0,
          gamma: 0,
          absolute: true,
        }),
      );
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

test('the fan points the way the compass says, and turns with it', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  test.skip(!(await hasCompass(page)), 'this browser has no compass event');
  await locate(page);
  await pointPhone(page, 90);
  await expect(wedge(page)).toHaveCount(1);
  // The map library turns a marker with a rotation in its transform.
  await expect(wedge(page)).toHaveAttribute('style', /rotateZ\(90deg\)/);

  // A steady new reading is followed, a step at a time, until it is reached.
  for (let i = 0; i < 40; i += 1) await pointPhone(page, 180);
  await expect
    .poll(async () => {
      const style = (await wedge(page).getAttribute('style')) ?? '';
      return Number(/rotateZ\(([\d.]+)deg\)/.exec(style)?.[1] ?? NaN);
    })
    .toBeGreaterThan(179);
});

test('the fan goes when location is switched off', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(places[0]!)));
  await openMap(page);
  test.skip(!(await hasCompass(page)), 'this browser has no compass event');
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
  test.skip(!(await hasCompass(page)), 'this browser has no compass event');
  await locate(page);
  await pointPhone(page, 0);
  await expect(wedge(page)).toHaveCount(1);
  const passes = await wedge(page).evaluate(
    (element) => getComputedStyle(element).pointerEvents === 'none',
  );
  expect(passes).toBe(true);
});
