import { describe, expect, it } from 'vitest';
import {
  loadSite,
  placeLinkFromPath,
  placeLinkPath,
  siteBaseUrl,
  siteIdFromPath,
  sitePagePath,
} from './load';

describe('siteIdFromPath', () => {
  it('reads the id from the map page path, with or without a trailing slash', () => {
    expect(siteIdFromPath('/s/demo-site/')).toBe('demo-site');
    expect(siteIdFromPath('/s/demo-site')).toBe('demo-site');
  });

  it('returns null for other paths and malformed ids', () => {
    expect(siteIdFromPath('/')).toBeNull();
    expect(siteIdFromPath('/s/')).toBeNull();
    expect(siteIdFromPath('/s/Demo')).toBeNull();
    expect(siteIdFromPath('/s/../etc')).toBeNull();
    expect(siteIdFromPath('/s/demo-site/extra')).toBeNull();
  });
});

describe('placeLinkFromPath', () => {
  it('reads the site and place ids from a share link', () => {
    expect(placeLinkFromPath('/p/demo-site/east-hall')).toEqual({
      siteId: 'demo-site',
      placeId: 'east-hall',
    });
    expect(placeLinkFromPath('/p/demo-site/east-hall/')).toEqual({
      siteId: 'demo-site',
      placeId: 'east-hall',
    });
  });

  it('returns null for other paths and malformed ids', () => {
    expect(placeLinkFromPath('/s/demo-site/')).toBeNull();
    expect(placeLinkFromPath('/p/demo-site/')).toBeNull();
    expect(placeLinkFromPath('/p/demo-site/East-Hall')).toBeNull();
    expect(placeLinkFromPath('/p/demo-site/east/extra')).toBeNull();
    expect(placeLinkFromPath('/p/../etc/passwd')).toBeNull();
  });
});

describe('paths', () => {
  it('derives the page and file locations from the id', () => {
    expect(sitePagePath('demo-site')).toBe('/s/demo-site/');
    expect(siteBaseUrl('demo-site')).toBe('/sites/demo-site/');
    expect(placeLinkPath('demo-site', 'east-hall')).toBe('/p/demo-site/east-hall');
  });
});

describe('loadSite', () => {
  it('fetches the four files from the site directory', async () => {
    const requested: string[] = [];
    const fake = async (url: string) => {
      requested.push(url);
      if (url.endsWith('site.json')) return { id: 'demo-site', name: 'Demo' };
      if (url.endsWith('graph.json')) return { nodes: [], edges: [], places: {} };
      return { type: 'FeatureCollection', features: [] };
    };
    const data = await loadSite('demo-site', fake);
    expect(requested.sort()).toEqual([
      '/sites/demo-site/graph.json',
      '/sites/demo-site/places.geojson',
      '/sites/demo-site/site.json',
      '/sites/demo-site/walkways.geojson',
    ]);
    expect(data.graph.nodes).toEqual([]);
    expect(data.config.name).toBe('Demo');
    expect(data.basemapUrl).toBe('/sites/demo-site/basemap.pmtiles');
  });

  it('refuses an id that could escape the sites directory', async () => {
    await expect(loadSite('../secret', async () => ({}))).rejects.toThrow(/invalid site id/);
  });
});
