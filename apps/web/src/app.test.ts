import { describe, expect, it } from 'vitest';
import type { PlacesDocument } from '@openwalk/search';
import { initialView, labelLanguage, loadedFrom, pageTitle, rootChoice } from './app';

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

  it('shows the world when there is nothing to center on', () => {
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

describe('loadedFrom', () => {
  const origin = 'https://maps.example';

  it("keeps the app's own files that loaded from the page origin", () => {
    expect(
      loadedFrom(
        [
          { name: 'https://maps.example/assets/app.js', responseStatus: 200 },
          { name: 'https://maps.example/sites/a/site.json' },
          { name: 'https://maps.example/basemap/fonts/x.pbf' },
          { name: 'https://maps.example/icons/icon-192.png' },
          { name: 'https://elsewhere.example/assets/x.js', responseStatus: 200 },
        ],
        origin,
      ),
    ).toEqual([
      'https://maps.example/assets/app.js',
      'https://maps.example/sites/a/site.json',
      'https://maps.example/basemap/fonts/x.pbf',
      'https://maps.example/icons/icon-192.png',
    ]);
  });

  it('leaves out a file that was not found', () => {
    expect(
      loadedFrom(
        [
          { name: 'https://maps.example/sites/a/overlays.json', responseStatus: 404 },
          { name: 'https://maps.example/sites/a/places.geojson', responseStatus: 200 },
        ],
        origin,
      ),
    ).toEqual(['https://maps.example/sites/a/places.geojson']);
  });

  it('keeps a file served from the cache with nothing new to send', () => {
    expect(
      loadedFrom([{ name: 'https://maps.example/assets/a.css', responseStatus: 304 }], origin),
    ).toEqual(['https://maps.example/assets/a.css']);
  });

  it("leaves out requests that are not the app's own, though on its origin", () => {
    expect(
      loadedFrom(
        [
          { name: 'https://maps.example/cdn-cgi/rum', responseStatus: 204 },
          { name: 'https://maps.example/some/injected/endpoint' },
          { name: 'https://maps.example/assets/app.js' },
        ],
        origin,
      ),
    ).toEqual(['https://maps.example/assets/app.js']);
  });

  it('is not fooled by a host whose name merely starts with the origin', () => {
    expect(loadedFrom([{ name: 'https://maps.example.evil.test/assets/x.js' }], origin)).toEqual(
      [],
    );
  });

  it('ignores an address it cannot read', () => {
    expect(loadedFrom([{ name: 'not a url' }], origin)).toEqual([]);
  });
});

describe('rootChoice', () => {
  const pathFor = (id: string) => `/s/${id}/`;

  it('has nothing to offer a host with no sites', () => {
    expect(rootChoice([], pathFor)).toEqual({ kind: 'none' });
  });

  it('opens the only site directly', () => {
    expect(rootChoice([{ id: 'a', name: 'A' }], pathFor)).toEqual({ kind: 'open', path: '/s/a/' });
  });

  it('offers a choice between several', () => {
    expect(
      rootChoice(
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        pathFor,
      ),
    ).toEqual({
      kind: 'choose',
      entries: [
        { name: 'A', path: '/s/a/' },
        { name: 'B', path: '/s/b/' },
      ],
    });
  });
});
