import { expect, it } from 'vitest';
import { circlePolygon } from './circle';

it('closes the ring and keeps every vertex at the radius', () => {
  const ring = circlePolygon([0, 0], 111.195, 8);
  expect(ring).toHaveLength(9);
  expect(ring[0]).toEqual(ring[8]);
  for (const [lon, lat] of ring) {
    expect(Math.hypot(lon, lat)).toBeCloseTo(0.001, 9);
  }
});

it('stretches longitude away from the equator', () => {
  const ring = circlePolygon([10, 60], 1000, 4);
  const east = ring[0] as [number, number];
  const north = ring[1] as [number, number];
  expect((east[0] - 10) / (north[1] - 60)).toBeCloseTo(2, 2);
});
