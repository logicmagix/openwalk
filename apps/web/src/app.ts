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
 * The addresses of the files the page loaded from its own origin, for keeping a
 * copy for offline use. A file that was asked for and not found is left out: a
 * site's optional files are requested whether or not it has them, and one that
 * cannot be fetched would stop the copy from ever being complete.
 */
export function loadedFrom(resources: readonly LoadedResource[], origin: string): string[] {
  return resources
    .filter((resource) => resource.name.startsWith(origin))
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
