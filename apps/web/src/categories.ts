// The kinds of place a site has, each with a readable name and a color: what
// the map draws its dots in, and what the legend lists. Pure; no DOM, no map.

import type { PlacesDocument } from '@openwalk/search';
import type { SiteConfig } from './site/types';
import type { Theme } from './theme';

export interface Category {
  /** The value places carry, such as `call_box`. */
  readonly id: string;
  /** What a person reads, such as "Call boxes". */
  readonly label: string;
  /** How many of the site's places are of this kind. */
  readonly count: number;
  /** The color of its dots, in the light and in the dark theme. */
  readonly color: Readonly<Record<Theme, string>>;
}

// A fixed palette of colors that stay apart for people with the common forms of
// color blindness (after Okabe and Ito, and Tol). Each has a deeper shade for the
// light map and a lighter one for the dark map. Dots are also outlined in a color
// that contrasts with the map, so a dot never depends on its fill alone to be seen.
// Walkways are drawn in blue and routes in purple, so those hues are kept out of
// the way: there is no purple, and the one blue comes last.
const PALETTE: readonly Readonly<Record<Theme, string>>[] = [
  { light: '#d55e00', dark: '#f28c4b' }, // vermilion
  { light: '#009e73', dark: '#33c4a0' }, // green
  { light: '#cc79a7', dark: '#e9b3d0' }, // pink
  { light: '#e69f00', dark: '#f5b942' }, // orange
  { light: '#f0e442', dark: '#f5ec6b' }, // yellow
  { light: '#737373', dark: '#b5b5b5' }, // gray
  { light: '#882255', dark: '#c0507f' }, // wine
  { light: '#56b4e9', dark: '#8fd0f5' }, // sky
];

/** The dot color for a place whose kind is not in the list. */
export const FALLBACK_COLOR: Readonly<Record<Theme, string>> = {
  light: '#737373',
  dark: '#b5b5b5',
};

/** A readable name made from a category value: `call_box` becomes "Call box". */
export function humanize(id: string): string {
  const words = id.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The site's kinds of place, in the order the legend shows them: first those the
 * site lists in its configuration, in its order and with its names, then any
 * other kind its places use, by name. Colors follow that order, so a site that
 * lists its categories also decides which color each gets. A listed kind that
 * no place uses is left out.
 */
export function siteCategories(
  config: Pick<SiteConfig, 'categories'>,
  places: PlacesDocument,
): Category[] {
  const counts = new Map<string, number>();
  for (const place of places.features) {
    const id = place.properties.category;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const listed = (config.categories ?? []).filter((entry) => counts.has(entry.id));
  const listedIds = new Set(listed.map((entry) => entry.id));
  const others = [...counts.keys()]
    .filter((id) => !listedIds.has(id))
    .map((id) => ({ id, label: humanize(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...listed, ...others].map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    count: counts.get(entry.id) ?? 0,
    color: PALETTE[index % PALETTE.length] ?? FALLBACK_COLOR,
  }));
}
