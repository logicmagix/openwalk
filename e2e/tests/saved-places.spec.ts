import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { labelOf, places } from './site';

// Someone's own places: those they star, and the last few they asked the way to,
// kept on the device and listed first when the search box is opened.

const [first, second] = places;
if (first === undefined || second === undefined) throw new Error('the site needs two places');

const star = (page: Page) => page.getByRole('button', { name: 'Save this place' });

// A choice is written to the device's store a moment after it is made. A test
// reloads faster than a hand can, so it gives the write that moment first.
async function revisit(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.reload();
  await openMap(page);
}

/** The rows at the head of the untyped list that are the person's own. */
function own(page: Page, mark: 'saved' | 'recent') {
  return controls(page).results.locator(`li.${mark}`);
}

test('a starred place heads the search list, and stays after a reload', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, first);
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
  await star(page).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');

  await revisit(page);
  await controls(page).search.click();
  await expect(own(page, 'saved')).toHaveCount(1);
  await expect(own(page, 'saved')).toContainText(labelOf(first));
  await expect(own(page, 'saved')).toContainText('Saved');

  // Choosing it from there opens it, with its star still filled.
  await own(page, 'saved').click();
  await expect(controls(page).directions).toContainText(first.properties.name);
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
});

test('pressing the star again forgets the place', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, first);
  await star(page).click();
  await star(page).click();
  await expect(star(page)).toHaveAttribute('aria-pressed', 'false');
  await revisit(page);
  await controls(page).search.click();
  await expect(own(page, 'saved')).toHaveCount(0);
});

test('places lately chosen are listed as recent, newest first', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, first);
  await page.getByRole('button', { name: 'Close directions' }).click();
  await choosePlace(page, second);
  await page.getByRole('button', { name: 'Close directions' }).click();

  await revisit(page);
  await controls(page).search.click();
  await expect(own(page, 'recent')).toHaveCount(2);
  await expect(own(page, 'recent').first()).toContainText(labelOf(second));
  await expect(own(page, 'recent').first()).toContainText('Recent');
});

test('someone new has no places of their own listed', async ({ page }) => {
  await openMap(page);
  await controls(page).search.click();
  await expect(own(page, 'saved')).toHaveCount(0);
  await expect(own(page, 'recent')).toHaveCount(0);
});

test('the star works from the keyboard', async ({ page }) => {
  await openMap(page);
  await choosePlace(page, first);
  await star(page).focus();
  await page.keyboard.press('Enter');
  await expect(star(page)).toHaveAttribute('aria-pressed', 'true');
});
