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

/**
 * The site's extent as a bounding box with a margin. Holding the map inside it
 * keeps the view over the site: panning stops at the edge and zooming out past it
 * is prevented, which also stops the base map from drawing a wide, slow area far
 * from the site. Derived from the places; null when a site has none.
 */
export function siteBounds(places: PlacesDocument): [[number, number], [number, number]] | null {
  const points = places.features.map((f) => f.geometry.coordinates);
  if (points.length === 0) return null;
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const centreLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const centreLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const halfLon = (Math.max(...lons) - Math.min(...lons)) / 2;
  const halfLat = (Math.max(...lats) - Math.min(...lats)) / 2;
  // The map can rotate, so each side must hold the site's longest span whichever
  // way it is turned: use the larger half-extent for both axes, with room to
  // spare, and a floor (~150 m) so a tiny site still gets a sensible box.
  const reach = Math.max(halfLon, halfLat, 0.001) * 1.5;
  return [
    [centreLon - reach, centreLat - reach],
    [centreLon + reach, centreLat + reach],
  ];
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
