import { describe, expect, it } from 'vitest';
import exampleSite from '../../../sites/tuscawilla-park/graph.json' with { type: 'json' };
import tiny from '../fixtures/tiny.graph.json' with { type: 'json' };
import { loadGraph, resolveWeights, type GraphDocument, type KindWeights } from './graph';
import { aStar, dijkstra } from './shortestPath';

const tinyGraph = loadGraph(tiny as unknown as GraphDocument);
const siteGraph = loadGraph(exampleSite as unknown as GraphDocument);

const algorithms = [
  ['dijkstra', dijkstra],
  ['aStar', aStar],
] as const;

describe.each(algorithms)('%s on the hand-drawn graph', (_name, find) => {
  it('takes the straight walkway to the corner', () => {
    const result = find(tinyGraph, 0, 2);
    expect(result?.nodes).toEqual([0, 1, 2]);
    expect(result?.cost).toBe(224);
    expect(result?.metres).toBe(224);
  });

  it('cuts across the plaza when that is shorter', () => {
    const result = find(tinyGraph, 0, 4);
    expect(result?.nodes).toEqual([0, 3, 4]);
    expect(result?.cost).toBe(271);
  });

  it('walks round rather than along the road under default weights', () => {
    const result = find(tinyGraph, 5, 3);
    expect(result?.nodes).toEqual([5, 0, 3]);
    expect(result?.cost).toBe(271);
    expect(result?.metres).toBe(271);
  });

  it('takes the road once its weight makes it cheaper', () => {
    const result = find(tinyGraph, 5, 3, { weights: resolveWeights({ road: 2 }) });
    expect(result?.nodes).toEqual([5, 3]);
    expect(result?.cost).toBe(224);
    expect(result?.metres).toBe(112);
  });

  it('returns a single node for a trip to the start', () => {
    expect(find(tinyGraph, 1, 1)).toMatchObject({ nodes: [1], cost: 0, metres: 0 });
  });

  it('returns null when the goal is on an island', () => {
    expect(find(tinyGraph, 0, 7)).toBeNull();
  });

  it('returns null for a node outside the graph', () => {
    expect(find(tinyGraph, 0, 99)).toBeNull();
    expect(find(tinyGraph, -1, 0)).toBeNull();
  });
});

// A small seeded generator so the random pairs are the same on every run.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nodePairs(nodeCount: number, count: number, seed: number): [number, number][] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => [
    Math.floor(random() * nodeCount),
    Math.floor(random() * nodeCount),
  ]);
}

describe('Dijkstra and A* agree', () => {
  const placeNodes = Object.values(siteGraph.places).flat();
  const pairs: [number, number][] = [
    ...placeNodes.flatMap((a) => placeNodes.filter((b) => b !== a).map((b) => [a, b] as const)),
    ...nodePairs(siteGraph.nodes.length, 300, 7),
  ].map(([a, b]) => [a, b]);

  const weightSets: [string, KindWeights][] = [
    ['default weights', resolveWeights()],
    ['flat weights', resolveWeights({ steps: 1, aisle: 1, road: 1 })],
    ['steep weights', resolveWeights({ steps: 4, aisle: 6, road: 10, area: 2 })],
  ];

  it.each(weightSets)(
    'on cost for every pair with %s, and A* expands fewer nodes',
    (_, weights) => {
      let dijkstraExpanded = 0;
      let aStarExpanded = 0;
      for (const [start, goal] of pairs) {
        const d = dijkstra(siteGraph, start, goal, { weights });
        const a = aStar(siteGraph, start, goal, { weights });
        if (d === null || a === null) {
          expect(d).toBeNull();
          expect(a).toBeNull();
          continue;
        }
        expect(a.cost).toBeCloseTo(d.cost, 6);
        expect(a.nodes[0]).toBe(start);
        expect(a.nodes.at(-1)).toBe(goal);
        expect(a.expanded).toBeLessThanOrEqual(d.expanded);
        dijkstraExpanded += d.expanded;
        aStarExpanded += a.expanded;
      }
      expect(aStarExpanded).toBeLessThan(dijkstraExpanded);
    },
  );

  it('agree with the path cost recomputed from the edges', () => {
    const weights = resolveWeights();
    for (const [start, goal] of pairs.slice(0, 50)) {
      const found = aStar(siteGraph, start, goal, { weights });
      if (found === null) continue;
      let cost = 0;
      let metres = 0;
      for (let i = 1; i < found.nodes.length; i += 1) {
        const from = found.nodes[i - 1] as number;
        const to = found.nodes[i] as number;
        const edge = siteGraph.neighbours[from]?.find((n) => n.node === to);
        if (edge === undefined) throw new Error(`no edge ${from}-${to}`);
        cost += edge.metres * weights[edge.kind];
        metres += edge.metres;
      }
      expect(found.cost).toBeCloseTo(cost, 6);
      expect(found.metres).toBeCloseTo(metres, 6);
    }
  });
});
