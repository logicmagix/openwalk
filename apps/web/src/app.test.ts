import { describe, expect, it } from 'vitest';
import type { PlacesDocument } from '@openwalk/search';
import { initialView, labelLanguage, pageTitle } from './app';

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

describe('labelLanguage', () => {
  it('keeps the primary subtag and falls back to English', () => {
    expect(labelLanguage('de-AT')).toBe('de');
    expect(labelLanguage('EN')).toBe('en');
    expect(labelLanguage('')).toBe('en');
  });
});

it('titles the page after the site', () => {
  expect(pageTitle({ name: 'Somewhere' })).toBe('Somewhere · OpenWalk');
});
