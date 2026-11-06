// What the search box lists: every destination when nothing is typed, otherwise
// the places ranked against the text. Pure, so the ordering is testable.

import { search, type PlaceFeature, type SearchIndex } from '@openwalk/search';
import type { PlacesDocument } from '../site/types';

export interface Listing {
  readonly place: PlaceFeature;
  /** The number and name, as shown on the map. */
  readonly label: string;
  /** The annotation, or an empty string. */
  readonly detail: string;
}

export function labelOf(place: PlaceFeature): string {
  const { number, name } = place.properties;
  return number === undefined ? name : `${number} ${name}`;
}

/** Numbers first in numeric order, then everything else by name. */
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
  const byName = a.properties.name.localeCompare(b.properties.name);
  if (byName !== 0) return byName;
  return (a.properties.annotation ?? '').localeCompare(b.properties.annotation ?? '');
}

export function listPlaces(
  places: PlacesDocument,
  index: SearchIndex,
  query: string,
  limit = 12,
): Listing[] {
  const chosen =
    query.trim() === ''
      ? [...places.features].sort(compareForDropdown)
      : search(index, query, { limit }).map((result) => result.place);
  return chosen.slice(0, query.trim() === '' ? undefined : limit).map((place) => ({
    place,
    label: labelOf(place),
    detail: place.properties.annotation ?? '',
  }));
}
