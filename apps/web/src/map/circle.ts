// A circle on the ground as a polygon the map can fill: the accuracy ring around
// the position marker. Built in degrees from a radius in meters, which is exact
// enough for anything under a few kilometers.

import type { Position } from '../site/types';

const METERS_PER_DEGREE = 111_195;

export function circlePolygon(center: Position, radiusM: number, steps = 64): Position[] {
  const latDegrees = radiusM / METERS_PER_DEGREE;
  const lonDegrees = latDegrees / Math.max(Math.cos((center[1] * Math.PI) / 180), 1e-6);
  const ring: Position[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    ring.push([center[0] + lonDegrees * Math.cos(angle), center[1] + latDegrees * Math.sin(angle)]);
  }
  // A GeoJSON ring ends exactly where it starts.
  ring.push(ring[0] as Position);
  return ring;
}
