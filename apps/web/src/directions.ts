// Everything about getting someone from where they are to a place, as pure
// functions: the route itself, whether they have arrived, which way to head next,
// and the words and numbers the panel shows.

import {
  haversineDistance,
  initialBearing,
  loadGraph,
  resolveWeights,
  route,
  type Destination,
  type Graph,
  type GraphDocument,
  type Position,
  type Route,
} from '@openwalk/routing';
import type { PlaceFeature } from '@openwalk/search';
import type { PositionFix } from './position/provider';
import type { SiteConfig } from './site/types';

export type Units = 'metric' | 'imperial';

export interface Router {
  readonly graph: Graph;
  readonly weights: ReturnType<typeof resolveWeights>;
  readonly walkingSpeedMps: number | undefined;
  readonly units: Units;
}

/** The routing graph and the site's weights, prepared once per site. */
export function makeRouter(document: GraphDocument, config: SiteConfig): Router {
  return {
    graph: loadGraph(document),
    weights: resolveWeights(config.routing?.weights ?? {}),
    walkingSpeedMps: config.routing?.walking_speed,
    units: config.units ?? 'metric',
  };
}

/**
 * Where directions to a place can end: the nodes the pipeline joined it to the
 * network at, one for each entrance, which can be some way from the point that
 * marks the place itself. Falls back to that point for a place the graph does
 * not know.
 */
export function entrancesOf(router: Router, place: PlaceFeature): readonly Position[] {
  const entrances = (router.graph.places[place.id] ?? [])
    .map((node) => router.graph.nodes[node])
    .filter((position): position is Position => position !== undefined);
  return entrances.length > 0 ? entrances : [place.geometry.coordinates];
}

/**
 * Where a route to `place` ends. A place of the site ends at its entrances. A
 * place the graph does not know, such as a spot the person marked, ends at its
 * own point, reached from the nearest walkway.
 */
function goalOf(router: Router, place: PlaceFeature): Destination {
  return router.graph.places[place.id] === undefined
    ? { position: place.geometry.coordinates }
    : { place: place.id };
}

/** The walking route from a fix to a place, or null when none exists. */
export function planRoute(router: Router, fix: PositionFix, place: PlaceFeature): Route | null {
  return route(router.graph, fix.position, goalOf(router, place), {
    weights: router.weights,
    ...(router.walkingSpeedMps === undefined ? {} : { walkingSpeedMps: router.walkingSpeedMps }),
  });
}

/** The walk from one place to another, wherever the person is, or null when none exists. */
export function planWalk(router: Router, fromPlaceId: string, to: PlaceFeature): Route | null {
  return route(router.graph, { place: fromPlaceId }, goalOf(router, to), {
    weights: router.weights,
    ...(router.walkingSpeedMps === undefined ? {} : { walkingSpeedMps: router.walkingSpeedMps }),
  });
}

export interface NearestMatch {
  readonly place: PlaceFeature;
  readonly route: Route;
}

/**
 * The place of a category reachable by the shortest walking route from the fix.
 * "Nearest" is measured on foot over the network, not as the crow flies, so a lot
 * on the far side of a fence is not chosen over one a short walk away. Routing is
 * fast enough (a fraction of a millisecond per route) to try every candidate.
 * Returns null when the category has no reachable place.
 */
export function nearestInCategory(
  router: Router,
  fix: PositionFix,
  places: readonly PlaceFeature[],
  category: string,
): NearestMatch | null {
  let best: NearestMatch | null = null;
  for (const place of places) {
    if (place.properties.category !== category) continue;
    const found = planRoute(router, fix, place);
    if (found === null) continue;
    if (best === null || found.distanceM < best.route.distanceM) {
      best = { place, route: found };
    }
  }
  return best;
}

/**
 * How close counts as arrived. GPS on a phone is rarely better than ten metres,
 * and a poor fix should not need the person to stand on the exact spot, so the
 * radius grows with the reported accuracy up to a limit.
 */
export function arrivalRadius(accuracyM: number): number {
  return Math.min(Math.max(15, accuracyM), 30);
}

/** Whether the person is at the place: close enough to any one of its entrances. */
export function hasArrived(fix: PositionFix, entrances: readonly Position[]): boolean {
  const radius = arrivalRadius(fix.accuracyM);
  return entrances.some((entrance) => haversineDistance(fix.position, entrance) <= radius);
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

const FEET_PER_METRE = 3.28084;
const METRES_PER_MILE = 1609.344;

/**
 * Metres as a short distance in the site's units. Metric: whole metres below a
 * kilometre, then kilometres. Imperial: feet in steps of ten below a tenth of a
 * mile, then miles with one decimal.
 */
export function formatDistance(metres: number, units: Units = 'metric'): string {
  if (units === 'imperial') {
    const miles = metres / METRES_PER_MILE;
    if (miles < 0.1) {
      const feet = Math.max(10, Math.round((metres * FEET_PER_METRE) / 10) * 10);
      return `${feet} ft`;
    }
    return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
  }
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

/** How far and how long a planned walk is. */
export interface WalkSummary {
  readonly distance: string;
  readonly duration: string;
}

export function summarise(found: Route, units: Units = 'metric'): WalkSummary {
  return {
    distance: formatDistance(found.distanceM, units),
    duration: formatDuration(found.durationS),
  };
}

/** What the panel says about a route from the current fix. */
export function describe(found: Route, fix: PositionFix, units: Units = 'metric'): Guidance {
  const bearing = bearingAlong(fix, found);
  return {
    distance: formatDistance(found.distanceM, units),
    duration: formatDuration(found.durationS),
    bearing,
    instruction: bearing === null ? '' : `Head ${compassPoint(bearing)}`,
  };
}
