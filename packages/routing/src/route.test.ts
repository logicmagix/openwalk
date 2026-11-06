import { describe, expect, it } from 'vitest';
import exampleSite from '../../../sites/tuscawilla-park/graph.json' with { type: 'json' };
import golden from '../fixtures/example-site.routes.json' with { type: 'json' };
import tiny from '../fixtures/tiny.graph.json' with { type: 'json' };
import type { Position } from './geo';
import { loadGraph, resolveWeights, type GraphDocument } from './graph';
import { DEFAULT_WALKING_SPEED_MPS, estimateDuration, route } from './route';
import { aStar, dijkstra } from './shortestPath';

const tinyGraph = loadGraph(tiny as unknown as GraphDocument);
const siteGraph = loadGraph(exampleSite as unknown as GraphDocument);

describe('route on the hand-drawn graph', () => {
  it('walks to the path, then along it to a place', () => {
    const origin: Position = [0.0005, -0.0001];
    const found = route(tinyGraph, origin, { place: 'corner' });
    expect(found).not.toBeNull();
    if (found === null) return;

    expect(found.approach).toHaveLength(2);
    expect(found.approach[0]).toEqual(origin);
    expect(found.approach[1]?.[0]).toBeCloseTo(0.0005, 9);
    expect(found.approach[1]?.[1]).toBeCloseTo(0, 9);
    expect(found.path.map((p) => p[0])).toEqual([0.0005, 0.001, 0.002]);
    expect(found.departure).toEqual([]);
    expect(found.positions).toHaveLength(4);
    expect(found.distanceM).toBeCloseTo(11.1195 + 56 + 112, 3);
    expect(found.durationS).toBeCloseTo(found.distanceM / DEFAULT_WALKING_SPEED_MPS, 9);
    expect(found.cost).toBe(168);
  });

  it('has no approach leg when the origin is already on the network', () => {
    const found = route(tinyGraph, [0, 0], { place: 'corner' });
    expect(found?.approach).toEqual([]);
    expect(found?.positions[0]).toEqual([0, 0]);
    expect(found?.distanceM).toBe(224);
  });

  it('snaps a free destination and adds a departure leg', () => {
    const origin: Position = [0.0005, -0.0001];
    const target: Position = [0.0015, 0.0012];
    const found = route(tinyGraph, origin, { position: target });
    expect(found).not.toBeNull();
    if (found === null) return;

    expect(found.departure).toHaveLength(2);
    expect(found.departure[1]).toEqual(target);
    expect(found.departure[0]?.[1]).toBeCloseTo(0.001, 9);
    expect(found.positions).toHaveLength(6);
    expect(found.positions[0]).toEqual(origin);
    expect(found.positions.at(-1)).toEqual(target);
    expect(found.cost).toBeCloseTo(56 + 112 * 1.2 + 56, 6);
    expect(found.distanceM).toBeCloseTo(11.1195 + 224 + 22.239, 2);
  });

  it('honours site weights', () => {
    const found = route(
      tinyGraph,
      [0, 0.001],
      { position: [0.001, 0.001] },
      {
        weights: resolveWeights({ road: 1 }),
      },
    );
    expect(found?.distanceM).toBe(112);
  });

  it('returns null for an island, an unknown place, or an empty graph', () => {
    expect(route(tinyGraph, [0, 0], { place: 'island' })).toBeNull();
    expect(route(tinyGraph, [0, 0], { place: 'nowhere' })).toBeNull();
    const empty = loadGraph({ nodes: [], edges: [], places: {} });
    expect(route(empty, [0, 0], { place: 'corner' })).toBeNull();
  });
});

describe('estimateDuration', () => {
  it('divides distance by speed', () => {
    expect(estimateDuration(130)).toBeCloseTo(100, 9);
    expect(estimateDuration(100, 2)).toBe(50);
  });

  it('refuses a speed that is not positive', () => {
    expect(() => estimateDuration(100, 0)).toThrow(RangeError);
  });
});

describe('golden routes on the example site', () => {
  const weights = resolveWeights(golden.weights);

  it.each(golden.routes.map((r) => [r.from, r.to, r] as const))(
    'from %s to %s',
    (from, to, expected) => {
      const start = siteGraph.places[from];
      const goal = siteGraph.places[to];
      if (start === undefined || goal === undefined) throw new Error('unknown place');

      for (const find of [dijkstra, aStar]) {
        const found = find(siteGraph, start, goal, { weights });
        if (!expected.reachable) {
          expect(found).toBeNull();
          continue;
        }
        expect(found).not.toBeNull();
        if (found === null) return;
        expect(found.cost).toBeCloseTo(expected.cost ?? NaN, 4);
        expect(found.metres).toBeCloseTo(expected.metres ?? NaN, 4);
        expect(found.nodes).toEqual(expected.nodes);
      }

      // Starting exactly at the place's own node, the snap lands on it and the
      // walking distance is the network distance alone.
      const origin = siteGraph.nodes[start] as Position;
      const walked = route(siteGraph, origin, { place: to }, { weights });
      if (expected.reachable) {
        expect(walked?.approach).toEqual([]);
        expect(walked?.distanceM).toBeCloseTo(expected.metres ?? NaN, 4);
      } else {
        expect(walked).toBeNull();
      }
    },
  );
});
