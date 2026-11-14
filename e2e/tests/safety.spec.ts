import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openMap } from './app';
import { config } from './site';

// The Safety panel: the numbers a site lists for someone who needs help, each
// one a link the phone can call. A site that lists none has no panel.

const contacts = config.safety ?? [];

function safety(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Safety' });
  return {
    link: page.getByRole('group', { name: 'Map legend' }).getByRole('button', { name: 'Safety' }),
    dialog,
    rows: dialog.getByRole('link'),
    close: dialog.getByRole('button', { name: 'Close safety' }),
  };
}

async function openLegend(page: Page): Promise<void> {
  await openMap(page);
  await page.getByRole('button', { name: 'Map legend' }).click();
}

test('a site that lists no numbers has no Safety panel', async ({ page }) => {
  test.skip(contacts.length > 0, 'this site lists numbers');
  await openLegend(page);
  await expect(page.getByRole('button', { name: 'My places' })).toBeVisible();
  await expect(safety(page).link).toHaveCount(0);
});

test.describe('a site that lists numbers', () => {
  test.skip(contacts.length === 0, 'this site lists no numbers');

  test('offers each one as a number the phone can call', async ({ page }) => {
    await openLegend(page);
    await safety(page).link.click();
    const { dialog, rows } = safety(page);
    await expect(dialog).toBeVisible();
    await expect(rows).toHaveCount(contacts.length);
    for (const [index, contact] of contacts.entries()) {
      const row = rows.nth(index);
      await expect(row).toContainText(contact.label);
      await expect(row).toContainText(contact.number);
      if (contact.note !== undefined) await expect(row).toContainText(contact.note);
      // A tel: address is the number's digits, with the plus of a country code.
      const plus = contact.number.trim().startsWith('+') ? '+' : '';
      await expect(row).toHaveAttribute('href', `tel:${plus}${contact.number.replace(/\D/g, '')}`);
    }
  });

  test('closes with its button and with Escape', async ({ page }) => {
    await openLegend(page);
    await safety(page).link.click();
    await safety(page).close.click();
    await expect(safety(page).dialog).toBeHidden();
    await page.getByRole('button', { name: 'Map legend' }).click();
    await safety(page).link.click();
    await page.keyboard.press('Escape');
    await expect(safety(page).dialog).toBeHidden();
  });

  test('is there without a connection once the site has been visited', async ({
    page,
    context,
  }) => {
    await openMap(page);
    await expect(page.getByText('Ready to use offline')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await openLegend(page);
    await safety(page).link.click();
    await expect(safety(page).rows).toHaveCount(contacts.length);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`passes accessibility checks in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openLegend(page);
      await safety(page).link.click();
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#safety')
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
