// The site under test, read from its directory under sites/. Tests take every
// name and position from here, so nothing about a particular site is written
// into them and they can run against any site.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SITE_ID = process.env.E2E_SITE ?? 'tuscawilla-park';

const siteDir = join(import.meta.dirname, '..', '..', 'sites', SITE_ID);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(siteDir, name), 'utf8')) as T;
}

export type LonLat = [number, number];

export interface Place {
  readonly id: string;
  readonly geometry: { readonly coordinates: LonLat };
  readonly properties: {
    readonly name: string;
    readonly category: string;
    readonly number?: string;
  };
}

interface Graph {
  readonly nodes: readonly LonLat[];
  readonly places: Readonly<Record<string, number | readonly number[]>>;
}

export const config = readJson<{
  name: string;
  short_name?: string;
  nearest?: { category: string; label: string }[];
  operator?: { name: string; email?: string; url?: string };
  safety?: { label: string; number: string; note?: string }[];
}>('site.json');

export const places = readJson<{ features: Place[] }>('places.geojson').features;

const graph = readJson<Graph>('graph.json');

/** The map page for the site. */
export const MAP_PATH = `/s/${SITE_ID}/`;

/**
 * Where directions to a place end: the point on the network it is joined at,
 * or the first of them for a place with several entrances.
 */
export function arrivalPoint(place: Place): LonLat {
  const found = graph.places[place.id];
  const node = typeof found === 'number' ? found : found?.[0];
  const position = node === undefined ? undefined : graph.nodes[node];
  if (position === undefined) throw new Error(`${place.id} is not in the graph`);
  return position;
}

/** Rough distance in meters between two positions; good enough to compare them. */
export function metersBetween(a: LonLat, b: LonLat): number {
  const east = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  const north = (a[1] - b[1]) * 111_320;
  return Math.hypot(east, north);
}

/**
 * Two places to walk between: the pair furthest apart, so the walk is long
 * enough that arriving cannot be mistaken for starting.
 */
export function farthestPair(): { from: Place; to: Place } {
  let best: { from: Place; to: Place; meters: number } | null = null;
  for (const from of places) {
    for (const to of places) {
      const meters = metersBetween(arrivalPoint(from), arrivalPoint(to));
      if (best === null || meters > best.meters) best = { from, to, meters };
    }
  }
  if (best === null) throw new Error('the site has no places');
  return best;
}

/** A browser geolocation reading at a position on the ground. */
export function reading(position: LonLat): {
  longitude: number;
  latitude: number;
  accuracy: number;
} {
  return { longitude: position[0], latitude: position[1], accuracy: 5 };
}

/** A position far outside the site: the same latitude, a degree of longitude away. */
export function farAway(): LonLat {
  const [lon, lat] = arrivalPoint(farthestPair().from);
  return [lon + 1, lat];
}

/** What the search list shows for a place: its number, when it has one, then its name. */
export function labelOf(place: Place): string {
  const { number, name } = place.properties;
  return number ? `${number} ${name}` : name;
}
