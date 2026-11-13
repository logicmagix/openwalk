import { describe, expect, it } from 'vitest';
import { buildIndex } from '@openwalk/search';
import type { PlacesDocument } from '../site/types';
import { siteCategories } from '../categories';
import {
  ALL_LABEL,
  ALL_PLACES,
  BACK_LABEL,
  GROUP_ABOVE,
  HERE_LABEL,
  labelOf,
  listFor,
} from './listing';

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
const source = { places, index, categories: siteCategories({}, places) };
const ids = (rows: ReturnType<typeof listFor>) =>
  rows.map((row) => (row.kind === 'place' ? row.place.id : `${row.kind}:${row.label}`));

describe('listFor on a small site', () => {
  it('lists every place with numbers first in numeric order when nothing is typed', () => {
    expect(ids(listFor(source, ''))).toEqual(['b2', 'b12', 'gate', 'shelter-n', 'shelter-s']);
  });

  it('shows the number with the name and the annotation as the detail', () => {
    const [first, , , north] = listFor(source, '  ');
    expect(first?.label).toBe('2 Lecture Hall');
    expect(north?.label).toBe('Shelter');
    expect(north?.detail).toBe('North');
  });

  it('ranks matches when something is typed', () => {
    expect(ids(listFor(source, '12'))).toEqual(['b12']);
    expect(ids(listFor(source, 'shelter'))).toEqual(['shelter-n', 'shelter-s']);
    expect(listFor(source, 'zzz')).toEqual([]);
  });

  it('caps a search but not the full list', () => {
    expect(listFor(source, 'l', null, 1)).toHaveLength(1);
    expect(listFor(source, '', null, 2)).toHaveLength(5);
  });
});

describe('listFor on a site with many places', () => {
  // Twenty halls and three gates: more than fit in one comfortable list.
  const many: PlacesDocument = {
    type: 'FeatureCollection',
    features: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `hall-${i + 1}`,
        name: 'Hall',
        number: String(i + 1),
        category: 'building',
      })),
      ...['North', 'South', 'East'].map((side) => ({
        id: `gate-${side.toLowerCase()}`,
        name: `${side} Gate`,
        number: undefined,
        category: 'gate',
      })),
    ].map(({ id, name, number, category }) => ({
      type: 'Feature' as const,
      id,
      geometry: { type: 'Point' as const, coordinates: [0, 0] as const },
      properties: { name, category, keywords: [], verified: false, ...(number ? { number } : {}) },
    })),
  };
  const config = {
    categories: [
      { id: 'gate', label: 'Gates' },
      { id: 'building', label: 'Buildings' },
    ],
  };
  const big = { places: many, index: buildIndex(many), categories: siteCategories(config, many) };

  it('has more places than a single list holds', () => {
    expect(many.features.length).toBeGreaterThan(GROUP_ABOVE);
  });

  it('lists every place under a way back when "all places" is opened', () => {
    const rows = listFor(big, '', ALL_PLACES);
    expect(rows[0]).toEqual({ kind: 'back', label: BACK_LABEL, detail: ALL_LABEL });
    expect(rows).toHaveLength(24);
    expect(ids(rows.slice(1, 3))).toEqual(['hall-1', 'hall-2']);
  });

  it('lists every place first, then the kinds in the site order, when nothing is typed', () => {
    const rows = listFor(big, '');
    expect(rows.map((row) => [row.kind, row.label, row.detail])).toEqual([
      ['all', ALL_LABEL, '23 places'],
      ['category', 'Gates', '3 places'],
      ['category', 'Buildings', '20 places'],
    ]);
  });

  it('opens a kind onto its places, under a way back', () => {
    const rows = listFor(big, '', 'gate');
    expect(rows[0]).toEqual({ kind: 'back', label: BACK_LABEL, detail: 'Gates' });
    expect(ids(rows.slice(1))).toEqual(['gate-east', 'gate-north', 'gate-south']);
    expect(listFor(big, '', 'building')).toHaveLength(21);
  });

  it('searches every place when something is typed, whichever kind is open', () => {
    expect(ids(listFor(big, 'north', 'building'))).toEqual(['gate-north']);
    expect(listFor(big, 'hall').every((row) => row.kind === 'place')).toBe(true);
  });

  it('falls back to the kinds when the open kind is not one of the site', () => {
    expect(listFor(big, '', 'no-such-kind').map((row) => row.kind)).toEqual([
      'all',
      'category',
      'category',
    ]);
  });

  it('says "1 place" for a kind with a single place', () => {
    const one: PlacesDocument = {
      type: 'FeatureCollection',
      features: [
        ...many.features,
        {
          ...many.features[0]!,
          id: 'well',
          properties: { ...many.features[0]!.properties, category: 'water' },
        },
      ],
    };
    const rows = listFor(
      { places: one, index: buildIndex(one), categories: siteCategories({}, one) },
      '',
    );
    expect(rows.find((row) => row.label === 'Water')?.detail).toBe('1 place');
  });
});

it('orders names that end in numbers by the number', () => {
  const lots: PlacesDocument = {
    type: 'FeatureCollection',
    features: ['Lot P12', 'Lot P2', 'Lot P19W', 'Lot P4'].map((name) => ({
      type: 'Feature' as const,
      id: name.toLowerCase().replace(' ', '-'),
      geometry: { type: 'Point' as const, coordinates: [0, 0] as const },
      properties: { name, category: 'parking', keywords: [], verified: false },
    })),
  };
  const rows = listFor({ places: lots, index: buildIndex(lots), categories: [] }, '');
  expect(rows.map((row) => row.label)).toEqual(['Lot P2', 'Lot P4', 'Lot P12', 'Lot P19W']);
});

it('labels a place with its number when it has one', () => {
  expect(labelOf(places.features[1] as (typeof places.features)[number])).toBe('12 Library');
  expect(labelOf(places.features[0] as (typeof places.features)[number])).toBe('Main Gate');
});

describe("the person's own places", () => {
  const own = {
    ...source,
    saved: ['shelter-n', 'b12'],
    recent: ['gate', 'b12', 'b2', 'shelter-s'],
  };

  it('head the list when nothing is typed: saved by name, then the last few chosen', () => {
    const rows = listFor(own, '');
    expect(
      rows.slice(0, 4).map((row) => (row.kind === 'place' ? [row.place.id, row.mark] : [])),
    ).toEqual([
      ['b12', 'saved'],
      ['shelter-n', 'saved'],
      ['gate', 'recent'],
      ['b2', 'recent'],
    ]);
    // Every place still follows, unmarked.
    expect(ids(rows.slice(5))).toEqual(['b2', 'b12', 'gate', 'shelter-n', 'shelter-s']);
  });

  it('say why they are there, ahead of the annotation', () => {
    const [library, shelter, gate] = listFor(own, '');
    expect(library?.detail).toBe('Saved');
    expect(shelter?.detail).toBe('Saved · North');
    expect(gate?.detail).toBe('Recent');
  });

  it('do not list a saved place again as recent, nor more than a few recent', () => {
    const rows = listFor(own, '').filter((row) => row.kind === 'place' && row.mark === 'recent');
    expect(ids(rows)).toEqual(['gate', 'b2', 'shelter-s']);
  });

  it('are left out of a search and skip places the site no longer has', () => {
    expect(
      listFor(own, 'library').every((row) => row.kind !== 'place' || row.mark === undefined),
    ).toBe(true);
    const stale = { ...source, saved: ['gone'], recent: ['gone'] };
    expect(listFor(stale, '')).toEqual(listFor(source, ''));
  });
});

describe('choosing where a walk starts', () => {
  const starting = { ...source, saved: ['b12'], offerHere: true };

  it("leads with the person's own position, then their places, then the rest", () => {
    const [here, saved, next] = listFor(starting, '');
    expect(here).toMatchObject({ kind: 'here', label: HERE_LABEL });
    expect(saved).toMatchObject({ kind: 'place', mark: 'saved' });
    expect(next).toMatchObject({ kind: 'place' });
  });

  it('offers only places once something is typed', () => {
    expect(listFor(starting, 'library').every((row) => row.kind === 'place')).toBe(true);
  });

  it('is not offered when a destination is being chosen', () => {
    expect(listFor(source, '').some((row) => row.kind === 'here')).toBe(false);
  });
});
