// Finding which site the page is for and loading its files. Sites are served under
// /sites/<site-id>/; the map page for a site is /s/<site-id>/ and a share link to a
// single place is /p/<site-id>/<place-id>.

import type { GraphDocument } from '@openwalk/routing';
import type {
  OverlayEntry,
  OverlaysDocument,
  PlacesDocument,
  SiteConfig,
  SiteData,
  WalkwaysDocument,
} from './types';

// Site ids and place ids share the same shape: lowercase words joined by hyphens.
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The site id in a map page path such as `/s/<site-id>/`, or null. */
export function siteIdFromPath(pathname: string): string | null {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  const id = match[1] ?? '';
  return ID.test(id) ? id : null;
}

/** The site and place ids in a share link `/p/<site-id>/<place-id>`, or null. */
export function placeLinkFromPath(
  pathname: string,
): { readonly siteId: string; readonly placeId: string } | null {
  const match = /^\/p\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (match === null) return null;
  const siteId = match[1] ?? '';
  const placeId = match[2] ?? '';
  if (!ID.test(siteId) || !ID.test(placeId)) return null;
  return { siteId, placeId };
}

/** The map page path for a site. */
export function sitePagePath(siteId: string): string {
  return `/s/${siteId}/`;
}

/** The share link path for one place within a site. */
export function placeLinkPath(siteId: string, placeId: string): string {
  return `/p/${siteId}/${placeId}`;
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

/**
 * Loads a site's overlays, if it has any. overlays.json is optional: a site with no
 * official map image simply has no file, so a failed fetch means "no overlays".
 */
async function loadOverlays(base: string, fetchFn: JsonFetcher): Promise<OverlayEntry[]> {
  try {
    const document = (await fetchFn(`${base}overlays.json`)) as OverlaysDocument;
    return [...(document.overlays ?? [])];
  } catch {
    return [];
  }
}

/** Loads a site's configuration, places, walkways, graph and overlays in parallel. */
export async function loadSite(
  siteId: string,
  fetchFn: JsonFetcher = fetchJson,
): Promise<SiteData> {
  if (!ID.test(siteId)) throw new Error(`invalid site id: ${siteId}`);
  const base = siteBaseUrl(siteId);
  const [config, places, walkways, graph, overlays] = await Promise.all([
    fetchFn(`${base}site.json`) as Promise<SiteConfig>,
    fetchFn(`${base}places.geojson`) as Promise<PlacesDocument>,
    fetchFn(`${base}walkways.geojson`) as Promise<WalkwaysDocument>,
    fetchFn(`${base}graph.json`) as Promise<GraphDocument>,
    loadOverlays(base, fetchFn),
  ]);
  return { config, places, walkways, graph, overlays, basemapUrl: `${base}basemap.pmtiles` };
}
