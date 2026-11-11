import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { controls, openMap } from './app';
import { SITE_ID, labelOf, places } from './site';

// A site with many places lists its kinds of place first. The example site is
// small, so these tests hand the page a longer list: the site's own places plus a
// batch of made-up ones of a kind of their own.

// The made-up places are served in place of a file the page requests directly;
// a service worker would fetch it out of the test's reach.
test.use({ serviceWorkers: 'block' });

const EXTRA = 12;
const extras = Array.from({ length: EXTRA }, (_, i) => ({
  type: 'Feature',
  id: `extra-${i + 1}`,
  geometry: places[0]!.geometry,
  properties: { name: `Extra Place ${i + 1}`, category: 'made_up', keywords: [], verified: false },
}));
const kinds = [...new Set(places.map((place) => place.properties.category)), 'made_up'];

async function openLargeSite(page: Page): Promise<void> {
  await page.route(`**/sites/${SITE_ID}/places.geojson`, (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [...places, ...extras] } }),
  );
  await openMap(page);
}

test('with nothing typed, a large site lists its kinds of place', async ({ page }) => {
  await openLargeSite(page);
  const { search, results } = controls(page);
  await search.click();
  await expect(results.getByRole('option')).toHaveCount(kinds.length);
  await expect(results.getByRole('option').filter({ hasText: 'Made up' })).toContainText(
    `${EXTRA} places`,
  );
});

test('a kind opens onto its places, and a place can be chosen from there', async ({ page }) => {
  await openLargeSite(page);
  const { search, results, directions } = controls(page);
  const place = places[0]!;
  const sameKind = places.filter((p) => p.properties.category === place.properties.category);
  await search.click();
  // Open the kind the first real place belongs to, by its row's count.
  const words = sameKind.length === 1 ? '1 place' : `${sameKind.length} places`;
  await results.getByRole('option').filter({ hasText: words }).first().click();
  await expect(results.getByRole('option').first()).toContainText('All categories');
  await expect(results.getByRole('option')).toHaveCount(sameKind.length + 1);
  await results
    .getByRole('option')
    .filter({ hasText: labelOf(place) })
    .first()
    .click();
  await expect(directions).toContainText(place.properties.name);
  await expect(results).toBeHidden();
});

test('the way back returns to the kinds', async ({ page }) => {
  await openLargeSite(page);
  const { search, results } = controls(page);
  await search.click();
  await results.getByRole('option').filter({ hasText: 'Made up' }).click();
  await expect(results.getByRole('option')).toHaveCount(EXTRA + 1);
  await results.getByRole('option').filter({ hasText: 'All categories' }).click();
  await expect(results.getByRole('option')).toHaveCount(kinds.length);
});

test('typing searches every place, whichever kind is open', async ({ page }) => {
  await openLargeSite(page);
  const { search, results } = controls(page);
  const place = places[0]!;
  await search.click();
  await results.getByRole('option').filter({ hasText: 'Made up' }).click();
  await search.fill(place.properties.name);
  await expect(
    results
      .getByRole('option')
      .filter({ hasText: labelOf(place) })
      .first(),
  ).toBeVisible();
  await expect(results.getByRole('option').filter({ hasText: 'All categories' })).toHaveCount(0);
});

test('the keyboard can browse into a kind and back out', async ({ page }) => {
  await openLargeSite(page);
  const { search, results } = controls(page);
  await search.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(results.getByRole('option').first()).toContainText('All categories');
  // Enter with no row highlighted does not guess while browsing.
  await page.keyboard.press('Enter');
  await expect(results.getByRole('option').first()).toContainText('All categories');
  // Backspace in the empty field steps back out.
  await page.keyboard.press('Backspace');
  await expect(results.getByRole('option')).toHaveCount(kinds.length);
  await page.keyboard.press('Escape');
  await expect(results).toBeHidden();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the list of kinds passes accessibility checks in the ${scheme} theme`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    await openLargeSite(page);
    const { search, results } = controls(page);
    await search.click();
    await results.getByRole('option').filter({ hasText: 'Made up' }).click();
    await expect(results.getByRole('option').first()).toContainText('All categories');
    const found = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('#map canvas')
      .analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await context.close();
  });
}
