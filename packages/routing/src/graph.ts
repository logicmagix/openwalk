// The routing graph: the shape of graph.json as the pipeline writes it, and the
// adjacency-list form the search algorithms walk. The document type mirrors
// packages/schema/schemas/graph.schema.json field for field.

import type { Position } from './geo';

/** What an edge runs along. The pipeline assigns these; the router weights them. */
export type EdgeKind = 'walkway' | 'steps' | 'area' | 'aisle' | 'road' | 'connector';

export const EDGE_KINDS: readonly EdgeKind[] = [
  'walkway',
  'steps',
  'area',
  'aisle',
  'road',
  'connector',
];

/** One edge as stored: from node, to node, length in meters, kind. Undirected. */
export type EdgeRecord = readonly [from: number, to: number, meters: number, kind: EdgeKind];

/** graph.json. A node's id is its index in `nodes`. */
export interface GraphDocument {
  readonly nodes: readonly Position[];
  readonly edges: readonly EdgeRecord[];
  /**
   * Place id to the node where directions to that place end, or to several
   * nodes for a place with more than one entrance.
   */
  readonly places: Readonly<Record<string, number | readonly number[]>>;
}

/**
 * Cost multipliers per edge kind. A route's cost is the sum over its edges of
 * meters times the kind's weight, so a weight of 3 makes a road worth walking only
 * when the alternative is more than three times longer. Weights must be at least 1
 * for the A* heuristic to stay admissible.
 */
export type KindWeights = Readonly<Record<EdgeKind, number>>;

export const DEFAULT_WEIGHTS: KindWeights = {
  walkway: 1,
  area: 1,
  connector: 1,
  steps: 1.2,
  aisle: 1.5,
  road: 3,
};

/** Fill in any weights a site leaves unspecified, and refuse weights below 1. */
export function resolveWeights(overrides: Partial<KindWeights> = {}): KindWeights {
  const weights = { ...DEFAULT_WEIGHTS };
  for (const kind of EDGE_KINDS) {
    const value = overrides[kind];
    if (value === undefined) continue;
    if (!(value >= 1)) {
      throw new RangeError(`weight for ${kind} must be at least 1, got ${value}`);
    }
    weights[kind] = value;
  }
  return weights;
}

/** One end of an edge as seen from a node. */
export interface Neighbor {
  readonly node: number;
  readonly meters: number;
  readonly kind: EdgeKind;
}

/**
 * The graph in the form the searches use: every node lists its neighbors. Treated as
 * immutable; snapping produces a new graph rather than changing this one.
 */
export interface Graph {
  readonly nodes: readonly Position[];
  readonly neighbors: readonly (readonly Neighbor[])[];
  /** Place id to its entrance nodes: always a list here, often of one. */
  readonly places: Readonly<Record<string, readonly number[]>>;
}

/**
 * Build the adjacency list from a graph document. The document is trusted to match
 * its schema; the only check is that edges refer to nodes that exist, because an
 * out-of-range index would otherwise surface as an obscure failure mid-search.
 */
export function loadGraph(document: GraphDocument): Graph {
  const nodeCount = document.nodes.length;
  const neighbors: Neighbor[][] = Array.from({ length: nodeCount }, () => []);
  for (const [from, to, meters, kind] of document.edges) {
    if (!isNode(from, nodeCount) || !isNode(to, nodeCount)) {
      throw new RangeError(`edge [${from}, ${to}] refers to a node outside 0..${nodeCount - 1}`);
    }
    neighbors[from]?.push({ node: to, meters, kind });
    neighbors[to]?.push({ node: from, meters, kind });
  }
  const places: Record<string, readonly number[]> = {};
  for (const [place, found] of Object.entries(document.places)) {
    const entrances = typeof found === 'number' ? [found] : found;
    for (const node of entrances) {
      if (!isNode(node, nodeCount)) {
        throw new RangeError(`place ${place} refers to node ${node} outside 0..${nodeCount - 1}`);
      }
    }
    places[place] = entrances;
  }
  return { nodes: document.nodes, neighbors, places };
}

function isNode(index: number, nodeCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < nodeCount;
}
