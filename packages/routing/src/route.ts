// A complete walking route: snap the start (and a free destination) onto the
// network, find the shortest path, and turn it back into positions with the distance
// and an estimated walking time.

import type { Position } from './geo';
import { DEFAULT_WEIGHTS, type Graph, type KindWeights } from './graph';
import { aStar, type PathResult } from './shortestPath';
import { insertSnapPoint, snapToGraph } from './snap';

/** Either a place from the site's list or any position, which is snapped. */
export type Destination = { readonly place: string } | { readonly position: Position };

export interface RouteOptions {
  readonly weights?: KindWeights;
  /** Walking speed in metres per second. */
  readonly walkingSpeedMps?: number;
}

/** About 4.7 km/h: an unhurried pace that absorbs doors, crossings and stairs. */
export const DEFAULT_WALKING_SPEED_MPS = 1.3;

export interface Route {
  /** From the origin to where it meets the network; empty when already on it. */
  readonly approach: readonly Position[];
  /** Along the network, from the snapped start to the snapped end. */
  readonly path: readonly Position[];
  /** From where the network is left to a free destination; empty for a place. */
  readonly departure: readonly Position[];
  /** Whole route in order, for drawing or for finding the next waypoint. */
  readonly positions: readonly Position[];
  /** Total walking distance in metres, including the approach and departure. */
  readonly distanceM: number;
  /** Estimated walking time in seconds. */
  readonly durationS: number;
  /** Weighted cost of the network part, for tests and comparisons. */
  readonly cost: number;
}

/** Shortest walking route from a position to a destination, or null if unreachable. */
export function route(
  graph: Graph,
  from: Position,
  to: Destination,
  options: RouteOptions = {},
): Route | null {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const speed = options.walkingSpeedMps ?? DEFAULT_WALKING_SPEED_MPS;

  const startSnap = snapToGraph(graph, from);
  if (startSnap === null) return null;
  let working = insertSnapPoint(graph, startSnap);
  const start = working.node;

  // A place may be entered at several doors; a free destination has one end.
  let goals: readonly number[];
  // The dashed leg at the far end, from the network to a free destination.
  let departure: readonly Position[] = [];
  let departureM = 0;
  if ('place' in to) {
    const entrances = graph.places[to.place];
    if (entrances === undefined) return null;
    goals = entrances;
  } else {
    const endSnap = snapToGraph(working.graph, to.position);
    if (endSnap === null) return null;
    working = insertSnapPoint(working.graph, endSnap);
    goals = [working.node];
    if (endSnap.distanceM > 0) {
      departure = [endSnap.position, to.position];
      departureM = endSnap.distanceM;
    }
  }

  // Try each entrance and keep the cheapest way in. A search takes a fraction of
  // a millisecond and a place has a handful of doors at most.
  let found: PathResult | null = null;
  for (const goal of goals) {
    const candidate = aStar(working.graph, start, goal, { weights });
    if (candidate !== null && (found === null || candidate.cost < found.cost)) found = candidate;
  }
  if (found === null) return null;

  const path = found.nodes.map((node) => working.graph.nodes[node] as Position);
  const approach: Position[] = startSnap.distanceM > 0 ? [from, startSnap.position] : [];
  const positions = [...approach.slice(0, -1), ...path, ...departure.slice(1)];
  const distanceM = startSnap.distanceM + found.metres + departureM;
  return {
    approach,
    path,
    departure,
    positions,
    distanceM,
    durationS: estimateDuration(distanceM, speed),
    cost: found.cost,
  };
}

/** Walking time in seconds for a distance at a steady speed. */
export function estimateDuration(distanceM: number, speedMps = DEFAULT_WALKING_SPEED_MPS): number {
  if (!(speedMps > 0)) throw new RangeError(`walking speed must be positive, got ${speedMps}`);
  return distanceM / speedMps;
}
