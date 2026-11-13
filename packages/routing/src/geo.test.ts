import { describe, expect, it } from 'vitest';
import {
  haversineDistance,
  initialBearing,
  interpolate,
  localPlane,
  nearestPointOnSegment,
  type Position,
} from './geo';

// One thousandth of a degree of latitude, anywhere on earth, with the mean radius.
const GRID_STEP_M = 111.19508;

describe('haversineDistance', () => {
  it('is zero between a position and itself', () => {
    expect(haversineDistance([10, 20], [10, 20])).toBe(0);
  });

  it('measures a thousandth of a degree of latitude', () => {
    expect(haversineDistance([0, 0], [0, 0.001])).toBeCloseTo(GRID_STEP_M, 3);
  });

  it('shrinks longitude steps towards the poles', () => {
    const atEquator = haversineDistance([0, 0], [0.001, 0]);
    const at60 = haversineDistance([0, 60], [0.001, 60]);
    expect(at60 / atEquator).toBeCloseTo(0.5, 3);
  });

  it('is symmetric', () => {
    expect(haversineDistance([1, 2], [3, 4])).toBe(haversineDistance([3, 4], [1, 2]));
  });
});

describe('initialBearing', () => {
  const origin: Position = [0, 0];
  it.each([
    [[0, 0.001], 0],
    [[0.001, 0], 90],
    [[0, -0.001], 180],
    [[-0.001, 0], 270],
  ] as const)('towards %j is %d degrees', (target, degrees) => {
    expect(initialBearing(origin, target)).toBeCloseTo(degrees, 6);
  });

  it('stays within [0, 360)', () => {
    const bearing = initialBearing([0, 0], [-0.001, 0.001]);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
    expect(bearing).toBeCloseTo(315, 6);
  });
});

describe('localPlane', () => {
  it('maps the origin to zero and a latitude step to meters', () => {
    const plane = localPlane([0, 0]);
    expect(plane.toPlane([0, 0])).toEqual([0, 0]);
    const [x, y] = plane.toPlane([0, 0.001]);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(GRID_STEP_M, 3);
  });

  it('scales east-west by the cosine of the origin latitude', () => {
    const plane = localPlane([10, 60]);
    const [x] = plane.toPlane([10.001, 60]);
    expect(x).toBeCloseTo(GRID_STEP_M / 2, 2);
  });
});

describe('nearestPointOnSegment', () => {
  it('projects onto the interior of the segment', () => {
    const { t, squaredDistance } = nearestPointOnSegment([5, 3], [0, 0], [10, 0]);
    expect(t).toBe(0.5);
    expect(squaredDistance).toBe(9);
  });

  it('clamps to the ends', () => {
    expect(nearestPointOnSegment([-4, 3], [0, 0], [10, 0])).toEqual({ t: 0, squaredDistance: 25 });
    expect(nearestPointOnSegment([14, 3], [0, 0], [10, 0])).toEqual({
      t: 1,
      squaredDistance: 25,
    });
  });

  it('treats a zero-length segment as a point', () => {
    expect(nearestPointOnSegment([3, 4], [0, 0], [0, 0])).toEqual({ t: 0, squaredDistance: 25 });
  });
});

describe('interpolate', () => {
  it('walks a fraction of the way between two positions', () => {
    expect(interpolate([0, 0], [2, 4], 0.25)).toEqual([0.5, 1]);
    expect(interpolate([0, 0], [2, 4], 1)).toEqual([2, 4]);
  });
});
