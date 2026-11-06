import { describe, expect, it } from 'vitest';
import { BASEMAP_SOURCE, POSITION_SOURCE, buildStyle, positionCollection } from './style';

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
    const style = buildStyle({ ...base, theme: 'dark' });
    const urls = JSON.stringify(style).match(/https?:\/\/[^"\s]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith(`${origin}/`)).toBe(true);
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
