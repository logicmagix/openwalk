// Geographic math used by routing: distances, bearings, and a local meter plane for
// nearest-point work. Everything is pure and position arguments follow GeoJSON order,
// longitude then latitude, in degrees.

/** A longitude and latitude pair in degrees, in GeoJSON order. */
export type Position = readonly [lon: number, lat: number];

/** A point on a flat plane, in meters. */
export type PlanePoint = readonly [x: number, y: number];

/** Mean radius of the earth in meters, the figure used by the haversine formula. */
export const EARTH_RADIUS_M = 6_371_008.8;

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

/** Great-circle distance between two positions in meters. */
export function haversineDistance(a: Position, b: Position): number {
  const lat1 = a[1] * DEGREES_TO_RADIANS;
  const lat2 = b[1] * DEGREES_TO_RADIANS;
  const dLat = lat2 - lat1;
  const dLon = (b[0] - a[0]) * DEGREES_TO_RADIANS;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Initial compass bearing from `a` towards `b`, in degrees clockwise from north,
 * in the range [0, 360).
 */
export function initialBearing(a: Position, b: Position): number {
  const lat1 = a[1] * DEGREES_TO_RADIANS;
  const lat2 = b[1] * DEGREES_TO_RADIANS;
  const dLon = (b[0] - a[0]) * DEGREES_TO_RADIANS;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const degrees = Math.atan2(y, x) * RADIANS_TO_DEGREES;
  return (degrees + 360) % 360;
}

/**
 * A flat approximation of the earth around one position: east and north offsets in
 * meters. Accurate to well under a percent within a few kilometers of the origin,
 * which covers any site, and far cheaper than a true projection.
 */
export interface LocalPlane {
  toPlane(position: Position): PlanePoint;
}

export function localPlane(origin: Position): LocalPlane {
  const metersPerDegree = EARTH_RADIUS_M * DEGREES_TO_RADIANS;
  const eastScale = metersPerDegree * Math.cos(origin[1] * DEGREES_TO_RADIANS);
  return {
    toPlane(position) {
      return [(position[0] - origin[0]) * eastScale, (position[1] - origin[1]) * metersPerDegree];
    },
  };
}

/**
 * The point on segment `ab` closest to `p`, as the fraction `t` of the way from `a`
 * to `b` (clamped to [0, 1]) and the squared distance to it. Squared distances are
 * enough to pick a winner and avoid a square root per candidate.
 */
export function nearestPointOnSegment(
  p: PlanePoint,
  a: PlanePoint,
  b: PlanePoint,
): { t: number; squaredDistance: number } {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lengthSquared = abx * abx + aby * aby;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lengthSquared;
    t = Math.min(1, Math.max(0, t));
  }
  const dx = a[0] + t * abx - p[0];
  const dy = a[1] + t * aby - p[1];
  return { t, squaredDistance: dx * dx + dy * dy };
}

/** The position a fraction `t` of the way along the straight line from `a` to `b`. */
export function interpolate(a: Position, b: Position, t: number): Position {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
