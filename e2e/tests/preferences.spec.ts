import { expect, test, type Page } from '@playwright/test';
import { openMap } from './app';

// The app remembers, on the device, how someone left a site's map: which layers
// were on and which kinds of place were hidden.

// A choice is written to the device's store a moment after it is made. A test
// reloads faster than a hand can, so it gives the write that moment first.
async function revisit(page: Page): Promise<void> {
  await page.waitForTimeout(250);
  await page.reload();
  await openMap(page);
}

function layers(page: Page) {
  return {
    button: page.getByRole('button', { name: 'Map layers' }),
    panel: page.getByRole('group', { name: 'Map layers' }),
  };
}

function legend(page: Page) {
  return {
    button: page.getByRole('button', { name: 'Map legend' }),
    panel: page.getByRole('group', { name: 'Map legend' }),
  };
}

test('a layer switched off is still off on the next visit', async ({ page }) => {
  await openMap(page);
  const { button, panel } = layers(page);
  await button.click();
  const labels = panel.getByRole('checkbox', { name: 'Place labels' });
  const walkways = panel.getByRole('checkbox', { name: 'Walkways' });
  await expect(labels).toBeChecked();
  await labels.uncheck();

  await revisit(page);
  await button.click();
  await expect(labels).not.toBeChecked();
  // What was left alone is as it was.
  await expect(walkways).toBeChecked();

  // Switching it back on is remembered too.
  await labels.check();
  await revisit(page);
  await button.click();
  await expect(labels).toBeChecked();
});

test('a kind of place hidden in the legend is still hidden on the next visit', async ({ page }) => {
  await openMap(page);
  const { button, panel } = legend(page);
  await button.click();
  const first = panel.getByRole('checkbox').first();
  await first.uncheck();

  await revisit(page);
  await button.click();
  await expect(first).not.toBeChecked();
  const others = await panel.getByRole('checkbox').all();
  for (const box of others.slice(1)) await expect(box).toBeChecked();
});

test('someone new finds every layer and kind as the site sets them', async ({ page }) => {
  await openMap(page);
  await layers(page).button.click();
  await expect(layers(page).panel.getByRole('checkbox', { name: 'Walkways' })).toBeChecked();
  await expect(layers(page).panel.getByRole('checkbox', { name: 'Place labels' })).toBeChecked();
  await page.keyboard.press('Escape');
  await legend(page).button.click();
  for (const box of await legend(page).panel.getByRole('checkbox').all()) {
    await expect(box).toBeChecked();
  }
});
