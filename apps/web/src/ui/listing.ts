// What the search box lists. With text typed: the places ranked against it. With
// nothing typed: every place on a small site, and on a larger one the kinds of
// place, each opening onto its own places, so a long list is never one scroll.
// Pure, so the ordering is testable.

import { search, type PlaceFeature, type SearchIndex } from '@openwalk/search';
import type { Category } from '../categories';
import type { PlacesDocument } from '../site/types';

/** One row of the list. */
export type Listing =
  /** A destination; choosing it asks for directions there. */
  | {
      readonly kind: 'place';
      readonly place: PlaceFeature;
      /** The number and name, as shown on the map. */
      readonly label: string;
      /** The annotation, or an empty string. */
      readonly detail: string;
    }
  /** A kind of place; choosing it lists the places of that kind. */
  | {
      readonly kind: 'category';
      readonly category: Category;
      readonly label: string;
      /** How many places it holds, in words. */
      readonly detail: string;
    }
  /** Every place in one list, for someone who would rather scroll than choose a kind. */
  | { readonly kind: 'all'; readonly label: string; readonly detail: string }
  /** The way back from one kind's places to the list of kinds. */
  | { readonly kind: 'back'; readonly label: string; readonly detail: string };

/** A site with more places than this lists its kinds first when nothing is typed. */
export const GROUP_ABOVE = 12;

export const BACK_LABEL = 'All categories';
export const ALL_LABEL = 'All places';

/** What is being browsed when it is every place and not one kind. */
export const ALL_PLACES = '*';

function countOf(places: number): string {
  return places === 1 ? '1 place' : `${places} places`;
}

export function labelOf(place: PlaceFeature): string {
  const { number, name } = place.properties;
  return number === undefined ? name : `${number} ${name}`;
}

/**
 * Numbers first in numeric order, then everything else by name. Digits inside a
 * name count as numbers too, so "Lot 2" comes before "Lot 12".
 */
export function compareForDropdown(a: PlaceFeature, b: PlaceFeature): number {
  const an = a.properties.number;
  const bn = b.properties.number;
  if (an !== undefined && bn !== undefined) {
    const byNumber = an.localeCompare(bn, undefined, { numeric: true });
    if (byNumber !== 0) return byNumber;
  } else if (an !== undefined) {
    return -1;
  } else if (bn !== undefined) {
    return 1;
  }
  const byName = a.properties.name.localeCompare(b.properties.name, undefined, { numeric: true });
  if (byName !== 0) return byName;
  return (a.properties.annotation ?? '').localeCompare(b.properties.annotation ?? '');
}

function placeRow(place: PlaceFeature): Listing {
  return {
    kind: 'place',
    place,
    label: labelOf(place),
    detail: place.properties.annotation ?? '',
  };
}

export interface ListingSource {
  readonly places: PlacesDocument;
  readonly index: SearchIndex;
  /** The site's kinds of place, in legend order. */
  readonly categories: readonly Category[];
}

/**
 * The rows for the text typed and the kind being browsed, if any (or
 * `ALL_PLACES`). Typing always searches every place, whichever kind was open.
 */
export function listFor(
  source: ListingSource,
  query: string,
  browsing: string | null = null,
  limit = 12,
): Listing[] {
  if (query.trim() !== '') {
    return search(source.index, query, { limit })
      .slice(0, limit)
      .map((result) => placeRow(result.place));
  }
  const all = [...source.places.features].sort(compareForDropdown);
  const grouped = all.length > GROUP_ABOVE && source.categories.length > 1;
  if (grouped && browsing === ALL_PLACES) {
    return [{ kind: 'back', label: BACK_LABEL, detail: ALL_LABEL }, ...all.map(placeRow)];
  }
  const open = source.categories.find((category) => category.id === browsing);
  if (open !== undefined) {
    const inside = all.filter((place) => place.properties.category === open.id);
    return [{ kind: 'back', label: BACK_LABEL, detail: open.label }, ...inside.map(placeRow)];
  }
  if (grouped) {
    return [
      { kind: 'all', label: ALL_LABEL, detail: countOf(all.length) },
      ...source.categories.map((category): Listing => ({
        kind: 'category',
        category,
        label: category.label,
        detail: countOf(category.count),
      })),
    ];
  }
  return all.map(placeRow);
}
