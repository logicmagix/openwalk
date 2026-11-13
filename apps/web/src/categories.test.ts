import { describe, expect, it } from 'vitest';
import type { PlacesDocument } from '@openwalk/search';
import { humanize, siteCategories } from './categories';

const places = (categories: string[]): PlacesDocument => ({
  type: 'FeatureCollection',
  features: categories.map((category, i) => ({
    type: 'Feature',
    id: `p${i}`,
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { name: `P${i}`, category, keywords: [], verified: false },
  })),
});

describe('humanize', () => {
  it('turns a category value into words', () => {
    expect(humanize('call_box')).toBe('Call box');
    expect(humanize('building')).toBe('Building');
  });
});

describe('siteCategories', () => {
  it('lists the kinds a site uses, by name, when the site names none', () => {
    const found = siteCategories({}, places(['sports', 'call_box', 'building', 'building']));
    expect(found.map((c) => [c.id, c.label, c.count])).toEqual([
      ['building', 'Building', 2],
      ['call_box', 'Call box', 1],
      ['sports', 'Sports', 1],
    ]);
  });

  it("puts the site's own list first, in its order and with its names", () => {
    const config = {
      categories: [
        { id: 'call_box', label: 'Call boxes' },
        { id: 'building', label: 'Buildings' },
      ],
    };
    const found = siteCategories(config, places(['sports', 'building', 'call_box']));
    expect(found.map((c) => c.label)).toEqual(['Call boxes', 'Buildings', 'Sports']);
  });

  it('leaves out a listed kind that no place uses', () => {
    const config = { categories: [{ id: 'parking', label: 'Parking' }] };
    expect(siteCategories(config, places(['building'])).map((c) => c.id)).toEqual(['building']);
  });

  it('gives each kind its own color in both themes', () => {
    const found = siteCategories({}, places(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
    expect(new Set(found.map((c) => c.color.light)).size).toBe(8);
    expect(new Set(found.map((c) => c.color.dark)).size).toBe(8);
    for (const category of found) {
      expect(category.color.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(category.color.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('starts the colors again when a site has more kinds than colors', () => {
    const found = siteCategories({}, places(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']));
    expect(found[8]?.color).toEqual(found[0]?.color);
  });

  it('is empty for a site with no places', () => {
    expect(siteCategories({}, places([]))).toEqual([]);
  });
});
