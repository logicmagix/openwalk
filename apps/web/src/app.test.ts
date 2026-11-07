import { describe, expect, it } from 'vitest';
import type { PlacesDocument } from '@openwalk/search';
import { initialView, labelLanguage, pageTitle, siteBounds } from './app';

const places = (coords: [number, number][]): PlacesDocument => ({
  type: 'FeatureCollection',
  features: coords.map((c, i) => ({
    type: 'Feature',
    id: `p${i}`,
    geometry: { type: 'Point', coordinates: c },
    properties: { name: `P${i}`, category: 'x', keywords: [], verified: false },
  })),
});

describe('initialView', () => {
  it('prefers the configured view', () => {
    const view = initialView(
      { id: 'a', name: 'A', view: { center: [1, 2], zoom: 15 } },
      places([]),
    );
    expect(view).toEqual({ center: [1, 2], zoom: 15 });
  });

  it('falls back to the middle of the places', () => {
    const view = initialView(
      { id: 'a', name: 'A' },
      places([
        [0, 0],
        [2, 4],
      ]),
    );
    expect(view).toEqual({ center: [1, 2], zoom: 16 });
  });

  it('shows the world when there is nothing to centre on', () => {
    expect(initialView({ id: 'a', name: 'A' }, places([])).zoom).toBe(2);
  });
});

describe('siteBounds', () => {
  it('is null when there are no places', () => {
    expect(siteBounds(places([]))).toBeNull();
  });

  it('wraps the places in a square with room to rotate', () => {
    // Half-spans are 1 (lon) and 2 (lat); the larger, 2, sizes both sides at 1.5x.
    expect(
      siteBounds(
        places([
          [0, 0],
          [2, 4],
        ]),
      ),
    ).toEqual([
      [-2, -1],
      [4, 5],
    ]);
  });

  it('keeps a small margin around a single point', () => {
    const box = siteBounds(places([[1, 2]]));
    expect(box).not.toBeNull();
    if (box === null) return;
    expect(box[0][0]).toBeLessThan(1);
    expect(box[1][0]).toBeGreaterThan(1);
    expect(box[0][1]).toBeLessThan(2);
    expect(box[1][1]).toBeGreaterThan(2);
  });
});

describe('labelLanguage', () => {
  it('keeps the primary subtag and falls back to English', () => {
    expect(labelLanguage('de-AT')).toBe('de');
    expect(labelLanguage('EN')).toBe('en');
    expect(labelLanguage('')).toBe('en');
  });
});

it('titles the page after the site', () => {
  expect(pageTitle({ id: 'a', name: 'Somewhere' })).toBe('Somewhere · OpenWalk');
});
