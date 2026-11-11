import { expect, test } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { arrivalPoint, farthestPair, reading } from './site';

// While locating is on the map keeps the person in the centre. Moving the map
// by hand pauses that, and the locate button brings them back.
const { from, to } = farthestPair();

test.use({ permissions: ['geolocation'] });

/** Drag the map a little way with the pointer, as a finger would. */
async function dragMap(page: import('@playwright/test').Page): Promise<void> {
  const box = await page.locator('#map').boundingBox();
  if (box === null) throw new Error('the map is not on the page');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 6 });
  await page.mouse.up();
}

test('moving the map pauses following and the locate button resumes it', async ({
  page,
  context,
}) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  const { locate } = controls(page);

  await locate.click();
  await expect(locate).toHaveAttribute('aria-pressed', 'true');
  await expect(locate).toHaveAttribute('data-following', 'true');

  // Let the glide to the person's position finish before taking hold of the map.
  await page.waitForTimeout(800);
  await dragMap(page);
  await expect(locate).toHaveAttribute('aria-pressed', 'true');
  await expect(locate).toHaveAttribute('data-following', 'false');

  // One press returns to the person and keeps locating on.
  await locate.click();
  await expect(locate).toHaveAttribute('aria-pressed', 'true');
  await expect(locate).toHaveAttribute('data-following', 'true');

  // A press while centred switches locating off.
  await locate.click();
  await expect(locate).toHaveAttribute('aria-pressed', 'false');
  await expect(locate).toHaveAttribute('data-following', 'false');
});

test('showing a whole route pauses following until asked', async ({ page, context }) => {
  await context.setGeolocation(reading(arrivalPoint(from)));
  await openMap(page);
  const { locate, directions } = controls(page);
  await locate.click();
  await choosePlace(page, to);
  await expect(directions).toContainText(/\d+ min/);
  await expect(locate).toHaveAttribute('data-following', 'false');

  await locate.click();
  await expect(locate).toHaveAttribute('aria-pressed', 'true');
  await expect(locate).toHaveAttribute('data-following', 'true');
});
