// Spots: positions someone has marked for themselves on a site, such as where
// the car is parked or a place by the water. Each is a point and a name. They
// are the one thing the app keeps that says where a person has been, so they
// are kept only on the device, only when asked for, and never put in a link.
//
// One spot may be the parked car, which has its own name and sign and is saved
// and found with a single press. The others are named "My spot", "My spot 2"
// and so on until the person names them. Pure data in, data out.

import type { Position } from './site/types';

export type SpotKind = 'car' | 'spot';

export interface Spot {
  /** Tells one spot from another on this device; never shown. */
  readonly id: string;
  readonly kind: SpotKind;
  readonly name: string;
  readonly position: Position;
}

export const CAR_NAME = 'My car';
export const SPOT_NAME = 'My spot';
/** How many spots a site may hold, the car included. */
export const MAX_SPOTS = 20;
/** The longest name kept; a longer one is cut. */
export const MAX_NAME = 40;

/** The key a site's spots are kept under. */
export function spotsKey(siteId: string): string {
  return `spots:${siteId}`;
}

function isPosition(value: unknown): value is Position {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [lon, lat] = value as unknown[];
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90
  );
}

/** A name made fit to keep: trimmed, on one line, and not over long. */
export function tidyName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** The spots to start with, from whatever was kept. Anything malformed is dropped. */
export function readSpots(kept: unknown): Spot[] {
  const list =
    (typeof kept === 'object' && kept !== null ? (kept as { spots?: unknown }).spots : null) ?? [];
  if (!Array.isArray(list)) return [];
  const spots: Spot[] = [];
  for (const entry of list as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, kind, name, position } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || spots.some((spot) => spot.id === id)) continue;
    if (kind !== 'car' && kind !== 'spot') continue;
    if (typeof name !== 'string' || tidyName(name) === '' || !isPosition(position)) continue;
    // There is one car; a second is kept as an ordinary spot.
    const second = kind === 'car' && spots.some((spot) => spot.kind === 'car');
    spots.push({
      id,
      kind: second ? 'spot' : kind,
      name: tidyName(name),
      position: [position[0], position[1]],
    });
    if (spots.length === MAX_SPOTS) break;
  }
  return spots;
}

/** The form spots are kept in. */
export function keptSpots(spots: readonly Spot[]): unknown {
  return {
    version: 1,
    spots: spots.map(({ id, kind, name, position }) => ({
      id,
      kind,
      name,
      position: [...position],
    })),
  };
}

export function carOf(spots: readonly Spot[]): Spot | null {
  return spots.find((spot) => spot.kind === 'car') ?? null;
}

export function isFull(spots: readonly Spot[]): boolean {
  return spots.length >= MAX_SPOTS;
}

/** The first of "My spot", "My spot 2", "My spot 3"… that no spot is called. */
export function nextSpotName(spots: readonly Spot[]): string {
  const taken = new Set(spots.map((spot) => spot.name));
  if (!taken.has(SPOT_NAME)) return SPOT_NAME;
  for (let number = 2; ; number += 1) {
    const name = `${SPOT_NAME} ${number}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Marks where the car is. There is one car, so parking again moves it. `id`
 * names the new spot; the caller supplies it so this stays predictable.
 */
export function parkCar(spots: readonly Spot[], position: Position, id: string): Spot[] {
  const car: Spot = { id, kind: 'car', name: CAR_NAME, position };
  const others = spots.filter((spot) => spot.kind !== 'car');
  // The car goes first, and takes the place of the old one in the count.
  return [car, ...others].slice(0, MAX_SPOTS);
}

/** Adds a spot with the next free name. Unchanged when the site is full. */
export function addSpot(spots: readonly Spot[], position: Position, id: string): Spot[] {
  if (isFull(spots)) return [...spots];
  return [...spots, { id, kind: 'spot', name: nextSpotName(spots), position }];
}

/** Gives a spot a new name. An empty name leaves it as it was. */
export function renameSpot(spots: readonly Spot[], id: string, name: string): Spot[] {
  const tidy = tidyName(name);
  if (tidy === '') return [...spots];
  return spots.map((spot) => (spot.id === id ? { ...spot, name: tidy } : spot));
}

export function removeSpot(spots: readonly Spot[], id: string): Spot[] {
  return spots.filter((spot) => spot.id !== id);
}

/**
 * Adds spots that arrived in a file to those held. One already here, by the
 * same name at the same point, is not added again; an arriving car becomes an
 * ordinary spot when there is a car already. Returns how many were added.
 */
export function mergeSpots(
  held: readonly Spot[],
  incoming: readonly Spot[],
  newId: () => string,
): { readonly spots: Spot[]; readonly added: number } {
  const spots = [...held];
  let added = 0;
  for (const spot of incoming) {
    if (isFull(spots)) break;
    const here = spots.some(
      (kept) =>
        kept.name === spot.name &&
        kept.position[0] === spot.position[0] &&
        kept.position[1] === spot.position[1],
    );
    if (here) continue;
    const kind = spot.kind === 'car' && carOf(spots) !== null ? 'spot' : spot.kind;
    spots.push({ id: newId(), kind, name: spot.name, position: spot.position });
    added += 1;
  }
  return { spots, added };
}
