// Everything about getting someone from where they are to a place, as pure
// functions: the route itself, whether they have arrived, which way to head next,
// and the words and numbers the panel shows.

import {
  haversineDistance,
  initialBearing,
  loadGraph,
  resolveWeights,
  route,
  type Graph,
  type GraphDocument,
  type Position,
  type Route,
} from '@openwalk/routing';
import type { PlaceFeature } from '@openwalk/search';
import type { PositionFix } from './position/provider';
import type { SiteConfig } from './site/types';

export interface Router {
  readonly graph: Graph;
  readonly weights: ReturnType<typeof resolveWeights>;
  readonly walkingSpeedMps: number | undefined;
}

/** The routing graph and the site's weights, prepared once per site. */
export function makeRouter(document: GraphDocument, config: SiteConfig): Router {
  return {
    graph: loadGraph(document),
    weights: resolveWeights(config.routing?.weights ?? {}),
    walkingSpeedMps: config.routing?.walking_speed,
  };
}

/**
 * Where directions to a place end: the node the pipeline joined it to the network
 * at, usually its entrance, which can be some way from the point that marks the
 * place itself. Falls back to that point for a place the graph does not know.
 */
export function destinationOf(router: Router, place: PlaceFeature): Position {
  const node = router.graph.places[place.id];
  const position = node === undefined ? undefined : router.graph.nodes[node];
  return position ?? place.geometry.coordinates;
}

/** The walking route from a fix to a place, or null when none exists. */
export function planRoute(router: Router, fix: PositionFix, placeId: string): Route | null {
  return route(
    router.graph,
    fix.position,
    { place: placeId },
    {
      weights: router.weights,
      ...(router.walkingSpeedMps === undefined ? {} : { walkingSpeedMps: router.walkingSpeedMps }),
    },
  );
}

/**
 * How close counts as arrived. GPS on a phone is rarely better than ten metres,
 * and a poor fix should not need the person to stand on the exact spot, so the
 * radius grows with the reported accuracy up to a limit.
 */
export function arrivalRadius(accuracyM: number): number {
  return Math.min(Math.max(15, accuracyM), 30);
}

export function hasArrived(fix: PositionFix, destination: Position): boolean {
  return haversineDistance(fix.position, destination) <= arrivalRadius(fix.accuracyM);
}

/** How far ahead along the route the arrow points, so it does not spin on the spot. */
const LOOK_AHEAD_M = 8;

/** The first route position further than the look-ahead from the fix. */
export function nextWaypoint(positions: readonly Position[], from: Position): Position | null {
  for (const position of positions) {
    if (haversineDistance(from, position) > LOOK_AHEAD_M) return position;
  }
  return positions.at(-1) ?? null;
}

/** Compass bearing from the fix towards the next waypoint, or null at the end. */
export function bearingAlong(fix: PositionFix, found: Route): number | null {
  const target = nextWaypoint(found.positions, fix.position);
  if (target === null || haversineDistance(fix.position, target) < 1) return null;
  return initialBearing(fix.position, target);
}

const POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

/** A bearing in degrees as one of eight compass points. */
export function compassPoint(bearing: number): string {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return POINTS[index] as string;
}

/** Metres as a short distance: whole metres below a kilometre, otherwise km. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(1, Math.round(metres))} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** Seconds as whole minutes, never less than one. */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} min`;
}

export interface Guidance {
  readonly distance: string;
  readonly duration: string;
  /** Degrees clockwise from north, or null when there is nowhere left to go. */
  readonly bearing: number | null;
  /** "Head north-east", or an empty string without a bearing. */
  readonly instruction: string;
}

/** What the panel says about a route from the current fix. */
export function describe(found: Route, fix: PositionFix): Guidance {
  const bearing = bearingAlong(fix, found);
  return {
    distance: formatDistance(found.distanceM),
    duration: formatDuration(found.durationS),
    bearing,
    instruction: bearing === null ? '' : `Head ${compassPoint(bearing)}`,
  };
}
