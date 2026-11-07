import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import {
  BASEMAP_SOURCE,
  POSITION_SOURCE,
  buildStyle,
  destinationCollection,
  overlayLayerId,
  overlaySourceId,
  positionCollection,
  routeCollection,
} from './style';

const overlay = {
  id: 'map',
  name: 'Official map',
  imageUrl: 'https://example.test/sites/demo/overlay/map.png',
  corners: [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ] as const,
  attribution: '© Someone',
};

const origin = 'https://example.test';
const base = {
  basemapUrl: `${origin}/sites/demo/basemap.pmtiles`,
  assetsBase: `${origin}/basemap`,
  lang: 'en',
};

describe('buildStyle', () => {
  it('points the base map at the site archive through the pmtiles scheme', () => {
    const style = buildStyle({ ...base, theme: 'light', attribution: 'Site data © Someone' });
    expect(style.sources[BASEMAP_SOURCE]).toMatchObject({
      type: 'vector',
      url: `pmtiles://${origin}/sites/demo/basemap.pmtiles`,
      attribution: 'Site data © Someone',
    });
    expect(style.glyphs).toBe(`${origin}/basemap/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${origin}/basemap/sprites/light`);
  });

  it('switches sprites and colours with the theme', () => {
    const light = buildStyle({ ...base, theme: 'light' });
    const dark = buildStyle({ ...base, theme: 'dark' });
    expect(dark.sprite).toBe(`${origin}/basemap/sprites/dark`);
    const dot = (style: typeof light) => style.layers.find((l) => l.id === 'position-dot');
    expect(dot(light)).not.toEqual(dot(dark));
  });

  it('draws the site layers above the base map, with the position on top', () => {
    const style = buildStyle({ ...base, theme: 'light' });
    const ids = style.layers.map((l) => l.id);
    const first = ids.indexOf('walkways-line');
    expect(first).toBeGreaterThan(0);
    expect(ids.slice(first)).toEqual([
      'walkways-line',
      'walkways-area',
      'route-casing',
      'route-path',
      'route-offpath',
      'destination-glow',
      'destination-mark',
      'position-accuracy',
      'places-dot',
      'places-label',
      'position-dot',
    ]);
    expect(ids.slice(0, first).length).toBeGreaterThan(10);
  });

  it('starts with empty site and position sources', () => {
    const style = buildStyle({ ...base, theme: 'light' });
    expect(style.sources[POSITION_SOURCE]).toEqual({
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  });

  it('never references a host other than the page origin', () => {
    const style = buildStyle({
      ...base,
      theme: 'dark',
      overlays: [overlay],
      layerPrefs: { overlays: ['map'] },
    });
    const urls = JSON.stringify(style).match(/https?:\/\/[^"\s]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${origin}/`)).toBe(true);
  });
});

describe('overlay layers', () => {
  it('draws no overlay until it is switched on', () => {
    const style = buildStyle({ ...base, theme: 'light', overlays: [overlay] });
    expect(style.sources[overlaySourceId('map')]).toBeUndefined();
    expect(style.layers.some((l) => l.id === overlayLayerId('map'))).toBe(false);
  });

  it('adds an image source and raster layer for a shown overlay', () => {
    const style = buildStyle({
      ...base,
      theme: 'light',
      overlays: [overlay],
      layerPrefs: { overlays: ['map'] },
    });
    expect(style.sources[overlaySourceId('map')]).toEqual({
      type: 'image',
      url: overlay.imageUrl,
      coordinates: [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    });
    const ids = style.layers.map((l) => l.id);
    const rasterAt = ids.indexOf(overlayLayerId('map'));
    expect(rasterAt).toBeGreaterThan(0);
    // The overlay sits above the base map but below the walkways and places.
    expect(rasterAt).toBeLessThan(ids.indexOf('walkways-line'));
  });
});

describe('style validity', () => {
  it('builds a style MapLibre accepts, in every layer combination', () => {
    const combinations = [
      undefined,
      { overlays: ['map'] },
      { walkways: false },
      { labels: false },
      { overlays: ['map'], walkways: false, labels: false },
    ];
    for (const layerPrefs of combinations) {
      const style = buildStyle({ ...base, theme: 'light', overlays: [overlay], layerPrefs });
      expect(validateStyleMin(style)).toEqual([]);
    }
  });
});

describe('layer visibility', () => {
  const layout = (prefs: Parameters<typeof buildStyle>[0]['layerPrefs'], id: string) => {
    const layer = buildStyle({ ...base, theme: 'light', layerPrefs: prefs }).layers.find(
      (l) => l.id === id,
    );
    return (layer?.layout ?? {}) as { visibility?: string };
  };

  it('shows walkways and labels by default', () => {
    expect(layout(undefined, 'walkways-line').visibility).toBe('visible');
    expect(layout(undefined, 'places-label').visibility).toBe('visible');
  });

  it('hides walkways and labels when switched off', () => {
    expect(layout({ walkways: false }, 'walkways-line').visibility).toBe('none');
    expect(layout({ walkways: false }, 'walkways-area').visibility).toBe('none');
    expect(layout({ labels: false }, 'places-label').visibility).toBe('none');
  });
});

describe('routeCollection', () => {
  it('tags the legs and leaves out empty ones', () => {
    const found = {
      approach: [
        [0, 0],
        [0, 1],
      ] as const,
      path: [
        [0, 1],
        [1, 1],
      ] as const,
      departure: [],
      positions: [],
      distanceM: 0,
      durationS: 0,
      cost: 0,
    };
    const kinds = routeCollection(found).features.map((f) => f.properties?.kind);
    expect(kinds).toEqual(['approach', 'path']);
    expect(routeCollection(null).features).toEqual([]);
  });

  it('copies place ids into properties so taps can read them', () => {
    const places = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          id: 'gate',
          geometry: { type: 'Point' as const, coordinates: [0, 0] as const },
          properties: { name: 'Gate', category: 'x', keywords: [], verified: false },
        },
      ],
    };
    const style = buildStyle({ ...base, theme: 'light', places });
    const source = style.sources['places'] as { data: GeoJSON.FeatureCollection };
    expect(source.data.features[0]?.properties).toMatchObject({ id: 'gate', name: 'Gate' });
  });
});

describe('destinationCollection', () => {
  it('holds one point or nothing', () => {
    expect(destinationCollection([1, 2]).features).toHaveLength(1);
    expect(destinationCollection(null).features).toEqual([]);
  });
});

describe('positionCollection', () => {
  it('holds a ring and a point for a fix, and nothing without one', () => {
    expect(positionCollection(null).features).toEqual([]);
    const fix = { position: [1, 2] as const, accuracyM: 10, heading: null, timestamp: 0 };
    const features = positionCollection(fix).features;
    expect(features.map((f) => f.geometry.type)).toEqual(['Polygon', 'Point']);
    expect(features[1]?.geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
  });
});
