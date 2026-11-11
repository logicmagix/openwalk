import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { choosePlace, controls, openMap } from './app';
import { places } from './site';

// Automated accessibility checks (axe) on the states a person passes through.
// They catch missing names, roles and poor contrast in the app's own controls;
// the drawn map is a picture and is left out.

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .exclude('#map canvas')
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`,
  );
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('the map as it opens', async ({ page }) => {
      await openMap(page);
      expect(await violations(page)).toEqual([]);
    });

    test('the search list open', async ({ page }) => {
      await openMap(page);
      await controls(page).search.click();
      await expect(controls(page).results).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test('a destination chosen', async ({ page }) => {
      await openMap(page);
      await choosePlace(page, places[0]!);
      expect(await violations(page)).toEqual([]);
    });

    test('the layers panel open', async ({ page }) => {
      await openMap(page);
      await page.getByRole('button', { name: 'Map layers' }).click();
      expect(await violations(page)).toEqual([]);
    });
  });
}
