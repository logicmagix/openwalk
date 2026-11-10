// Pure helpers behind the page, kept free of DOM access so they run in plain tests.

import type { PlacesDocument } from '@openwalk/search';
import type { Position, SiteConfig } from './site/types';

export const APP_NAME = 'OpenWalk';

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

/** The page title for a site. */
export function pageTitle(config: SiteConfig): string {
  return `${config.name} · ${APP_NAME}`;
}
