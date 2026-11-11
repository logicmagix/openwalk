// Handles on the app's controls, found the way a person or a screen reader
// finds them: by role and name.

import { expect, type Page } from '@playwright/test';
import { MAP_PATH, labelOf, type Place } from './site';

export function controls(page: Page) {
  return {
    search: page.getByRole('combobox', { name: 'Search for a place' }),
    results: page.getByRole('listbox', { name: 'Places' }),
    locate: page.getByRole('button', { name: 'Show my location' }),
    directions: page.getByRole('region', { name: 'Directions' }),
    notice: page.locator('#status'),
  };
}

/** Opens the site's map and waits until it is ready to use. */
export async function openMap(page: Page, path: string = MAP_PATH): Promise<void> {
  await page.goto(path);
  await expect(controls(page).search).toBeEnabled();
}

/** Types a place's name into the search box and picks it from the list. */
export async function choosePlace(page: Page, place: Place): Promise<void> {
  const { search, results, directions } = controls(page);
  await search.fill(place.properties.name);
  await results
    .getByRole('option')
    .filter({ hasText: labelOf(place) })
    .first()
    .click();
  await expect(directions).toContainText(place.properties.name);
}
