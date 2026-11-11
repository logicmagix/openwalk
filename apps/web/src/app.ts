// Pure helpers behind the page, kept free of DOM access so they run in plain tests.

import type { PlacesDocument } from '@openwalk/search';
import type { Position, SiteConfig } from './site/types';

export { APP_NAME, pageTitle } from './site/pages';

/** Zoom used when centring on the person; close enough to tell paths apart. */
export const LOCATE_ZOOM = 17;

/** Where the map opens: the configured view, or the middle of the places. */
export function initialView(
  config: SiteConfig,
  places: PlacesDocument,
): { center: Position; zoom: number } {
  if (config.view) return { center: config.view.center, zoom: config.view.zoom };
  const points = places.features.map((f) => f.geometry.coordinates);
  if (points.length === 0) return { center: [0, 0], zoom: 2 };
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return {
    center: [
      (Math.min(...lons) + Math.max(...lons)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2,
    ],
    zoom: 16,
  };
}

/** The two-letter language for base map labels, from the browser's preference. */
export function labelLanguage(locale: string): string {
  const primary = locale.split('-')[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en';
}

/** What the browser records about a file the page asked for. */
export interface LoadedResource {
  readonly name: string;
  /** The HTTP status of the answer; some browsers do not report it. */
  readonly responseStatus?: number;
}

/**
 * Where the app's own files are served: its bundles, the base map's fonts and
 * icons, its app icons, and the sites' data.
 */
export const APP_PATHS: readonly string[] = ['/assets/', '/basemap/', '/icons/', '/sites/'];

/**
 * The addresses of the app's own files that the page loaded, for keeping a copy
 * for offline use. Two things are left out, because a file that cannot be fetched
 * again would stop the copy from ever being complete:
 *
 * - a file that was asked for and not found: a site's optional files are
 *   requested whether or not it has them;
 * - anything that is not the app's own, such as a request added to the page by
 *   the network it is served through. Those are not the app's to keep.
 */
export function loadedFrom(
  resources: readonly LoadedResource[],
  origin: string,
  paths: readonly string[] = APP_PATHS,
): string[] {
  return resources
    .filter((resource) => {
      let url: URL;
      try {
        url = new URL(resource.name);
      } catch {
        return false;
      }
      return url.origin === origin && paths.some((path) => url.pathname.startsWith(path));
    })
    .filter((resource) => !((resource.responseStatus ?? 200) >= 400))
    .map((resource) => resource.name);
}

/** What the root address of a host does, given the sites it serves. */
export type RootChoice =
  | { readonly kind: 'none' }
  /** One site: there is nothing to choose, so its map opens. */
  | { readonly kind: 'open'; readonly path: string }
  | {
      readonly kind: 'choose';
      readonly entries: readonly { readonly name: string; readonly path: string }[];
    };

export function rootChoice(
  sites: readonly { readonly id: string; readonly name: string }[],
  pathFor: (siteId: string) => string,
): RootChoice {
  const entries = sites.map((site) => ({ name: site.name, path: pathFor(site.id) }));
  const [only] = entries;
  if (only === undefined) return { kind: 'none' };
  if (entries.length === 1) return { kind: 'open', path: only.path };
  return { kind: 'choose', entries };
}
