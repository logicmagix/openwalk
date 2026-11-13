// A complete walking route: snap a start position (and a free destination) onto the
// network, find the shortest path, and turn it back into positions with the distance
// and an estimated walking time.

import type { Position } from './geo';
import { DEFAULT_WEIGHTS, type Graph, type KindWeights } from './graph';
import { aStar, type PathResult } from './shortestPath';
import { insertSnapPoint, snapToGraph } from './snap';

/** Either a place from the site's list or any position, which is snapped. */
export type Destination = { readonly place: string } | { readonly position: Position };

/** Where a walk begins: a position, or a place from the site's list. */
export type Origin = Position | { readonly place: string };

function isPlace(origin: Origin): origin is { readonly place: string } {
  return !Array.isArray(origin);
}

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

/**
 * Shortest walking route to a destination, or null if unreachable. The start is
 * a position, which is snapped onto the network, or a place from the site's
 * list, in which case the walk begins at whichever of its entrances suits best.
 */
export function route(
  graph: Graph,
  from: Origin,
  to: Destination,
  options: RouteOptions = {},
): Route | null {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const speed = options.walkingSpeedMps ?? DEFAULT_WALKING_SPEED_MPS;

  let working = { graph, node: -1 };
  // Where the walk may begin on the network: one snapped point, or a place's doors.
  let starts: readonly number[];
  // The dashed leg at the near end, from a position to where it meets the network.
  let approach: Position[] = [];
  let approachM = 0;
  if (isPlace(from)) {
    const entrances = graph.places[from.place];
    if (entrances === undefined) return null;
    starts = entrances;
  } else {
    const startSnap = snapToGraph(graph, from);
    if (startSnap === null) return null;
    working = insertSnapPoint(graph, startSnap);
    starts = [working.node];
    if (startSnap.distanceM > 0) {
      approach = [from, startSnap.position];
      approachM = startSnap.distanceM;
    }
  }

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

  // Try each pairing of a door to leave by and a door to arrive at, and keep the
  // cheapest. A search takes a fraction of a millisecond and a place has a
  // handful of doors at most.
  let found: PathResult | null = null;
  for (const start of starts) {
    for (const goal of goals) {
      const candidate = aStar(working.graph, start, goal, { weights });
      if (candidate !== null && (found === null || candidate.cost < found.cost)) found = candidate;
    }
  }
  if (found === null) return null;

  const path = found.nodes.map((node) => working.graph.nodes[node] as Position);
  const positions = [...approach.slice(0, -1), ...path, ...departure.slice(1)];
  const distanceM = approachM + found.metres + departureM;
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
