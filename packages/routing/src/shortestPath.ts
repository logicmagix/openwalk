// Shortest paths over the weighted graph. Dijkstra and A* share one search loop: A*
// adds an estimate of the remaining distance to each node's priority so it heads
// towards the goal and settles fewer nodes. With the estimate fixed at zero the same
// loop is Dijkstra.

import { haversineDistance, type Position } from './geo';
import { DEFAULT_WEIGHTS, type Graph, type KindWeights } from './graph';
import { MinHeap } from './heap';

export interface PathResult {
  /** Node ids from start to goal inclusive. */
  readonly nodes: readonly number[];
  /** Sum of meters times kind weight along the path. */
  readonly cost: number;
  /** Sum of meters along the path, unweighted. */
  readonly meters: number;
  /** How many nodes the search settled, for comparing the algorithms. */
  readonly expanded: number;
}

export interface SearchOptions {
  readonly weights?: KindWeights;
}

/**
 * The straight-line distance to the goal never exceeds the real path cost because
 * every kind weight is at least 1, which makes it a valid A* estimate. It is scaled
 * down slightly because the pipeline measures edges on a flat plane and rounds them
 * to centimeters, so an edge can be a hair shorter than the great-circle distance
 * between its ends.
 */
const HEURISTIC_SCALE = 0.99;

export function dijkstra(
  graph: Graph,
  start: number,
  goal: number,
  options: SearchOptions = {},
): PathResult | null {
  return search(graph, start, goal, options.weights ?? DEFAULT_WEIGHTS, () => 0);
}

export function aStar(
  graph: Graph,
  start: number,
  goal: number,
  options: SearchOptions = {},
): PathResult | null {
  const goalPosition = graph.nodes[goal];
  if (goalPosition === undefined) return null;
  const estimates = new Float64Array(graph.nodes.length).fill(-1);
  const estimate = (node: number): number => {
    const cached = estimates[node] as number;
    if (cached >= 0) return cached;
    const position = graph.nodes[node] as Position;
    const value = HEURISTIC_SCALE * haversineDistance(position, goalPosition);
    estimates[node] = value;
    return value;
  };
  return search(graph, start, goal, options.weights ?? DEFAULT_WEIGHTS, estimate);
}

function search(
  graph: Graph,
  start: number,
  goal: number,
  weights: KindWeights,
  estimate: (node: number) => number,
): PathResult | null {
  const nodeCount = graph.nodes.length;
  if (start < 0 || start >= nodeCount || goal < 0 || goal >= nodeCount) return null;

  const cost = new Float64Array(nodeCount).fill(Infinity);
  const meters = new Float64Array(nodeCount);
  const previous = new Int32Array(nodeCount).fill(-1);
  const settled = new Uint8Array(nodeCount);
  const queue = new MinHeap<number>();
  let expanded = 0;

  cost[start] = 0;
  queue.push(estimate(start), start);

  for (;;) {
    const node = queue.pop();
    if (node === undefined) return null;
    // A node can be queued more than once; only its first, cheapest visit counts.
    if (settled[node]) continue;
    settled[node] = 1;
    expanded += 1;
    if (node === goal) break;

    const here = cost[node] as number;
    for (const edge of graph.neighbors[node] ?? []) {
      if (settled[edge.node]) continue;
      const candidate = here + edge.meters * weights[edge.kind];
      if (candidate < (cost[edge.node] as number)) {
        cost[edge.node] = candidate;
        meters[edge.node] = (meters[node] as number) + edge.meters;
        previous[edge.node] = node;
        queue.push(candidate + estimate(edge.node), edge.node);
      }
    }
  }

  const nodes: number[] = [];
  for (let node = goal; node !== -1; node = previous[node] as number) nodes.push(node);
  nodes.reverse();
  return { nodes, cost: cost[goal] as number, meters: meters[goal] as number, expanded };
}
