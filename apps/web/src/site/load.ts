// Finding which site the page is for and loading its files. Sites are served under
// /sites/<site-id>/ and the map page for a site is /s/<site-id>/.

import type { PlacesDocument, SiteConfig, SiteData, WalkwaysDocument } from './types';

const SITE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The site id in a map page path such as `/s/<site-id>/`, or null. */
export function siteIdFromPath(pathname: string): string | null {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  const id = match[1] ?? '';
  return SITE_ID.test(id) ? id : null;
}

/** The map page path for a site. */
export function sitePagePath(siteId: string): string {
  return `/s/${siteId}/`;
}

/** Where a site's files are served from. */
export function siteBaseUrl(siteId: string): string {
  return `/sites/${siteId}/`;
}

/** Fetches a URL and parses it as JSON; tests substitute their own. */
export type JsonFetcher = (url: string) => Promise<unknown>;

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

/** Loads a site's configuration, places and walkways in parallel. */
export async function loadSite(
  siteId: string,
  fetchFn: JsonFetcher = fetchJson,
): Promise<SiteData> {
  if (!SITE_ID.test(siteId)) throw new Error(`invalid site id: ${siteId}`);
  const base = siteBaseUrl(siteId);
  const [config, places, walkways] = await Promise.all([
    fetchFn(`${base}site.json`) as Promise<SiteConfig>,
    fetchFn(`${base}places.geojson`) as Promise<PlacesDocument>,
    fetchFn(`${base}walkways.geojson`) as Promise<WalkwaysDocument>,
  ]);
  return { config, places, walkways, basemapUrl: `${base}basemap.pmtiles` };
}
