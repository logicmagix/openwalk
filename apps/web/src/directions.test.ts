import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@openwalk/routing';
import tiny from '../../../packages/routing/fixtures/tiny.graph.json' with { type: 'json' };
import {
  arrivalRadius,
  bearingAlong,
  compassPoint,
  describe as describeRoute,
  entrancesOf,
  formatDistance,
  formatDuration,
  hasArrived,
  makeRouter,
  nearestInCategory,
  nextWaypoint,
  planRoute,
  planWalk,
  summarise,
} from './directions';
import type { PositionFix } from './position/provider';

const router = makeRouter(tiny as unknown as GraphDocument, { id: 'a', name: 'A' });
const fix = (lon: number, lat: number, accuracyM = 5): PositionFix => ({
  position: [lon, lat],
  accuracyM,
  heading: null,
  timestamp: 0,
});

describe('makeRouter and planRoute', () => {
  it('routes to a place with the site weights', () => {
    const found = planRoute(router, fix(0.0005, -0.0001), 'corner');
    expect(found?.distanceM).toBeCloseTo(11.12 + 56 + 112, 1);
    expect(found?.approach).toHaveLength(2);
  });

  it('applies a configured road weight and walking speed', () => {
    const quick = makeRouter(tiny as unknown as GraphDocument, {
      id: 'a',
      name: 'A',
      routing: { weights: { road: 1 }, walking_speed: 2 },
    });
    const found = planRoute(quick, fix(0, 0.001), 'top');
    expect(found?.distanceM).toBe(224);
    expect(found?.durationS).toBe(112);
  });

  it('returns null for an unreachable place', () => {
    expect(planRoute(router, fix(0, 0), 'island')).toBeNull();
  });
});

describe('entrancesOf', () => {
  const place = (id: string, coordinates: [number, number]) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Point' as const, coordinates },
    properties: { name: id, category: 'x', keywords: [], verified: false },
  });

  it('uses the routing node for a known place and the point otherwise', () => {
    expect(entrancesOf(router, place('corner', [9, 9]))).toEqual([[0.002, 0]]);
    expect(entrancesOf(router, place('unknown', [9, 9]))).toEqual([[9, 9]]);
  });
});

describe('nearestInCategory', () => {
  const place = (id: string, category: string) => ({
    type: 'Feature' as const,
    id,
    geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
    properties: { name: id, category, keywords: [], verified: false },
  });
  // 'corner' and 'top' are reachable graph places; 'island' is cut off.
  const places = [place('corner', 'parking'), place('top', 'parking'), place('island', 'parking')];

  it('picks the category place reachable by the shortest walk', () => {
    const start = fix(0.0005, -0.0001);
    const corner = planRoute(router, start, 'corner');
    const top = planRoute(router, start, 'top');
    if (corner === null || top === null) throw new Error('expected both routes');
    const shorter = corner.distanceM <= top.distanceM ? 'corner' : 'top';
    const nearest = nearestInCategory(router, start, places, 'parking');
    expect(nearest?.place.id).toBe(shorter);
    expect(nearest?.route.distanceM).toBeCloseTo(Math.min(corner.distanceM, top.distanceM), 6);
  });

  it('skips unreachable places and ignores other categories', () => {
    const start = fix(0, 0);
    expect(nearestInCategory(router, start, [place('island', 'parking')], 'parking')).toBeNull();
    expect(nearestInCategory(router, start, places, 'water')).toBeNull();
  });
});

describe('arrival', () => {
  it('widens the radius with poor accuracy, within limits', () => {
    expect(arrivalRadius(3)).toBe(15);
    expect(arrivalRadius(22)).toBe(22);
    expect(arrivalRadius(80)).toBe(30);
  });

  it('detects arrival inside the radius only', () => {
    expect(hasArrived(fix(0, 0.0001), [[0, 0]])).toBe(true);
    expect(hasArrived(fix(0, 0.0002), [[0, 0]])).toBe(false);
    expect(hasArrived(fix(0, 0.0002, 25), [[0, 0]])).toBe(true);
  });

  it('counts arrival at any one of several entrances', () => {
    const doors = [
      [0, 0],
      [0.01, 0],
    ] as const;
    expect(hasArrived(fix(0.01, 0.0001), doors)).toBe(true);
    expect(hasArrived(fix(0.005, 0), doors)).toBe(false);
  });
});

describe('guidance', () => {
  it('points past the nearest route point so the arrow does not spin', () => {
    const positions = [
      [0, 0],
      [0, 0.00005],
      [0.001, 0],
    ] as const;
    expect(nextWaypoint(positions, [0, 0])).toEqual([0.001, 0]);
    expect(nextWaypoint([[0, 0]], [0, 0])).toEqual([0, 0]);
    expect(nextWaypoint([], [0, 0])).toBeNull();
  });

  it('describes a route with distance, time and a compass instruction', () => {
    const start = fix(0.0005, -0.0001);
    const found = planRoute(router, start, 'corner');
    if (found === null) throw new Error('expected a route');
    const guidance = describeRoute(found, start);
    expect(guidance.distance).toBe('179 m');
    expect(guidance.duration).toBe('3 min');
    // The first leg is the walk north to the path; the turn east comes after it.
    expect(guidance.bearing).toBeCloseTo(0, 0);
    expect(guidance.instruction).toBe('Head north');
  });

  it('has no bearing once at the end of the route', () => {
    const end = fix(0.002, 0);
    const found = planRoute(router, end, 'corner');
    if (found === null) throw new Error('expected a route');
    expect(bearingAlong(end, found)).toBeNull();
    expect(describeRoute(found, end).instruction).toBe('');
  });
});

describe('formatting', () => {
  it('rounds metric distances sensibly', () => {
    expect(formatDistance(0.4)).toBe('1 m');
    expect(formatDistance(349.6)).toBe('350 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(12_345)).toBe('12 km');
  });

  it('shows feet then miles for imperial sites', () => {
    expect(formatDistance(1, 'imperial')).toBe('10 ft');
    expect(formatDistance(100, 'imperial')).toBe('330 ft');
    expect(formatDistance(160, 'imperial')).toBe('520 ft');
    expect(formatDistance(161, 'imperial')).toBe('0.1 mi');
    expect(formatDistance(2000, 'imperial')).toBe('1.2 mi');
    expect(formatDistance(20_000, 'imperial')).toBe('12 mi');
  });

  it('describes in the site units', () => {
    const start = fix(0.0005, -0.0001);
    const found = planRoute(router, start, 'corner');
    if (found === null) throw new Error('expected a route');
    expect(describeRoute(found, start, 'imperial').distance).toBe('0.1 mi');
    const imperial = makeRouter(tiny as unknown as GraphDocument, {
      id: 'a',
      name: 'A',
      units: 'imperial',
    });
    expect(imperial.units).toBe('imperial');
    expect(router.units).toBe('metric');
  });

  it('rounds durations up to whole minutes', () => {
    expect(formatDuration(10)).toBe('1 min');
    expect(formatDuration(61)).toBe('2 min');
  });

  it('names eight compass points', () => {
    expect(compassPoint(0)).toBe('north');
    expect(compassPoint(44)).toBe('north-east');
    expect(compassPoint(180)).toBe('south');
    expect(compassPoint(-90)).toBe('west');
    expect(compassPoint(359)).toBe('north');
  });
});

describe('a walk between two places', () => {
  it('starts at one place and ends at the other, wherever the person is', () => {
    const found = planWalk(router, 'top', 'corner');
    expect(found?.positions[0]).toEqual([0.002, 0.001]);
    expect(found?.positions.at(-1)).toEqual([0.002, 0]);
    expect(found?.approach).toEqual([]);
  });

  it('is null when no way exists', () => {
    expect(planWalk(router, 'top', 'island')).toBeNull();
    expect(planWalk(router, 'nowhere', 'corner')).toBeNull();
  });

  it('is summarised by how far and how long', () => {
    const found = planWalk(router, 'top', 'corner');
    if (found === null) throw new Error('no route');
    expect(summarise(found)).toEqual({ distance: '112 m', duration: '2 min' });
  });
});
