import { describe, expect, it } from 'vitest';
import { buildIndex } from '@openwalk/search';
import type { PlacesDocument } from '../site/types';
import { labelOf, listPlaces } from './listing';

const places: PlacesDocument = {
  type: 'FeatureCollection',
  features: [
    { id: 'gate', name: 'Main Gate' },
    { id: 'b12', name: 'Library', number: '12' },
    { id: 'b2', name: 'Lecture Hall', number: '2' },
    { id: 'shelter-s', name: 'Shelter', annotation: 'South' },
    { id: 'shelter-n', name: 'Shelter', annotation: 'North' },
  ].map(({ id, name, number, annotation }) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Point' as const, coordinates: [0, 0] as const },
    properties: {
      name,
      category: 'x',
      keywords: [],
      verified: false,
      ...(number ? { number } : {}),
      ...(annotation ? { annotation } : {}),
    },
  })),
};
const index = buildIndex(places);

describe('listPlaces', () => {
  it('lists every place with numbers first in numeric order when nothing is typed', () => {
    const ids = listPlaces(places, index, '').map((l) => l.place.id);
    expect(ids).toEqual(['b2', 'b12', 'gate', 'shelter-n', 'shelter-s']);
  });

  it('shows the number with the name and the annotation as the detail', () => {
    const [first, , , north] = listPlaces(places, index, '  ');
    expect(first?.label).toBe('2 Lecture Hall');
    expect(north?.label).toBe('Shelter');
    expect(north?.detail).toBe('North');
  });

  it('ranks matches when something is typed', () => {
    expect(listPlaces(places, index, '12').map((l) => l.place.id)).toEqual(['b12']);
    expect(listPlaces(places, index, 'shelter').map((l) => l.place.id)).toEqual([
      'shelter-n',
      'shelter-s',
    ]);
    expect(listPlaces(places, index, 'zzz')).toEqual([]);
  });

  it('caps a search but not the full list', () => {
    expect(listPlaces(places, index, 'l', 1)).toHaveLength(1);
    expect(listPlaces(places, index, '', 2)).toHaveLength(5);
  });
});

it('labels a place with its number when it has one', () => {
  expect(labelOf(places.features[1] as (typeof places.features)[number])).toBe('12 Library');
  expect(labelOf(places.features[0] as (typeof places.features)[number])).toBe('Main Gate');
});
