// Handles on the app's controls, found the way a person or a screen reader
// finds them: by role and name.

import { expect, type Page } from '@playwright/test';
import { MAP_PATH, labelOf, places, type Place } from './site';

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

// A site with many places of more than one kind opens its search list on the
// kinds, with "All places" at their head; a small site lists its places at once.
const GROUPS_ABOVE = 12;
const kinds = new Set(places.map((place) => place.properties.category));
const GROUPED = places.length > GROUPS_ABOVE && kinds.size > 1;

/** Rows in the full list of places that are not places: the way back to the kinds. */
export const LIST_EXTRA_ROWS = GROUPED ? 1 : 0;

/** With the search list open and nothing typed, brings every place into it. */
export async function showEveryPlace(page: Page): Promise<void> {
  if (!GROUPED) return;
  await controls(page).results.getByRole('option', { name: 'All places' }).click();
}
