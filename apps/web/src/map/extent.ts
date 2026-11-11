// Keeping the map over the site. The site's extent is the box around everything
// it contains, walkways and places together. The map is held there by limiting
// where the centre of the screen may go, not what the screen may show: any point
// of the site can then be brought to the middle of the screen whichever way the
// map is turned and whatever the shape of the screen or of the site.
//
// Pure geometry; no map library here.

import type { PlacesDocument, Position, WalkwaysDocument } from '../site/types';

/** A box on the ground: [[west, south], [east, north]] in degrees. */
export type Extent = readonly [readonly [number, number], readonly [number, number]];

/** Metres in one degree of latitude. */
const METRES_PER_DEGREE = 111_320;

/** Room left around the outermost walkway or place, in metres. */
const MARGIN_M = 60;

/** Width of the whole world in screen pixels at zoom 0, as the map draws it. */
const WORLD_PX = 512;

/**
 * How much further out than "the site just fits" the map may zoom, in zoom
 * levels, so the site can be seen whole with some of its surroundings.
 */
const ZOOM_OUT_ALLOWANCE = 0.75;

/**
 * The box around a site's walkways and places, with a margin; null when the
 * site has neither.
 */
export function siteExtent(places: PlacesDocument, walkways: WalkwaysDocument): Extent | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const include = ([lon, lat]: Position): void => {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };
  for (const place of places.features) include(place.geometry.coordinates);
  for (const walkway of walkways.features) {
    const { geometry } = walkway;
    if (geometry.type === 'LineString') geometry.coordinates.forEach(include);
    else geometry.coordinates.forEach((ring) => ring.forEach(include));
  }
  if (west === Infinity) return null;

  // A degree of longitude shrinks towards the poles, so the same margin in
  // metres is more degrees east-west than north-south.
  const marginLat = MARGIN_M / METRES_PER_DEGREE;
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const marginLon = marginLat / Math.max(Math.cos(midLat), 0.01);
  return [
    [west - marginLon, south - marginLat],
    [east + marginLon, north + marginLat],
  ];
}

/** The nearest point to `position` that lies inside the extent. */
export function clampToExtent(position: Position, extent: Extent): Position {
  const [[west, south], [east, north]] = extent;
  return [
    Math.min(Math.max(position[0], west), east),
    Math.min(Math.max(position[1], south), north),
  ];
}

/**
 * How far past the extent a position may be and still count as on site, in
 * metres: someone at the kerb or in a car park across the road is arriving.
 */
const ON_SITE_REACH_M = 100;

/**
 * The most a position's own uncertainty may add to that reach, in metres, so a
 * rough first reading near the site is not turned away while a rough reading
 * from far off still is.
 */
const MAX_UNCERTAINTY_M = 500;

/** Metres from a position to the extent; zero when it is inside. */
export function distanceOutsideM(position: Position, extent: Extent): number {
  const [nearLon, nearLat] = clampToExtent(position, extent);
  const north = (position[1] - nearLat) * METRES_PER_DEGREE;
  const east =
    (position[0] - nearLon) * METRES_PER_DEGREE * Math.cos(position[1] * (Math.PI / 180));
  return Math.hypot(east, north);
}

/**
 * Whether a position reading places the person at the site: inside the extent,
 * or close enough that, allowing for the reading's accuracy, they may be.
 */
export function isOnSite(position: Position, accuracyM: number, extent: Extent): boolean {
  const allowance = ON_SITE_REACH_M + Math.min(Math.max(accuracyM, 0), MAX_UNCERTAINTY_M);
  return distanceOutsideM(position, extent) <= allowance;
}

/** Web Mercator's north-south coordinate for a latitude, as a fraction of the world. */
function mercatorY(lat: number): number {
  const radians = lat * (Math.PI / 180);
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI);
}

/**
 * The furthest out the map may zoom on a screen of the given size in pixels.
 * At the returned zoom the extent's longer side slightly underfills the
 * screen's shorter side, so the whole site is in view at any rotation.
 */
export function minZoomFor(extent: Extent, widthPx: number, heightPx: number): number {
  const [[west, south], [east, north]] = extent;
  // The extent's sides as fractions of the world's width on the flat map.
  const across = (east - west) / 360;
  const down = mercatorY(south) - mercatorY(north);
  const longer = Math.max(across, down);
  const shorterScreen = Math.min(widthPx, heightPx);
  if (longer <= 0 || shorterScreen <= 0) return 0;
  // The world is WORLD_PX * 2^zoom pixels wide; solve for the zoom at which the
  // longer side measures exactly the screen's shorter side.
  const fit = Math.log2(shorterScreen / (longer * WORLD_PX));
  return Math.max(0, fit - ZOOM_OUT_ALLOWANCE);
}
