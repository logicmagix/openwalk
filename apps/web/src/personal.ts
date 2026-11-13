// What someone keeps for themselves on a site: the places they have saved, the
// walks between two places they have saved, and the last few places they asked
// the way to. Kept on the device, per site, and never
// sent anywhere. Pure data in, data out; the page does the storing.
//
// Places are kept by id. What comes back from storage is treated as untrusted
// and checked against the places the site has now, so a place that has gone
// from the site simply drops out.

/** A saved walk: from one place to another, each by id. No position is part of it. */
export interface SavedRoute {
  readonly from: string;
  readonly to: string;
}

export interface Personal {
  /** Ids of the saved places, oldest first. */
  readonly saved: readonly string[];
  /** The saved walks, oldest first. */
  readonly routes: readonly SavedRoute[];
  /** Ids of the places last chosen as a destination, most recent first. */
  readonly recent: readonly string[];
}

export const NOTHING_KEPT: Personal = { saved: [], routes: [], recent: [] };

/** How many recent places are remembered. */
export const RECENT_KEPT = 8;

/** The key a site's saved and recent places are kept under. */
export function personalKey(siteId: string): string {
  return `places:${siteId}`;
}

function knownIds(value: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => known.has(id as string)))];
}

/** The walks in `value` whose two places the site still has, once each. */
function knownRoutes(value: unknown, known: ReadonlySet<string>): SavedRoute[] {
  if (!Array.isArray(value)) return [];
  const routes: SavedRoute[] = [];
  for (const entry of value as unknown[]) {
    const { from, to } = (typeof entry === 'object' && entry !== null ? entry : {}) as {
      from?: unknown;
      to?: unknown;
    };
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    if (!known.has(from) || !known.has(to)) continue;
    if (!routes.some((route) => route.from === from && route.to === to)) routes.push({ from, to });
  }
  return routes;
}

/** What to start with, from whatever was kept. */
export function readPersonal(kept: unknown, placeIds: Iterable<string>): Personal {
  const known = new Set(placeIds);
  const record = typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>) : {};
  return {
    saved: knownIds(record['saved'], known),
    routes: knownRoutes(record['routes'], known),
    recent: knownIds(record['recent'], known).slice(0, RECENT_KEPT),
  };
}

/** The form it is kept in. The version lets a later app tell old from new. */
export function keptPersonal(personal: Personal): unknown {
  return {
    version: 1,
    saved: [...personal.saved],
    routes: personal.routes.map(({ from, to }) => ({ from, to })),
    recent: [...personal.recent],
  };
}

export function isSaved(personal: Personal, placeId: string): boolean {
  return personal.saved.includes(placeId);
}

/** Saves a place that is not saved, and forgets one that is. */
export function toggleSaved(personal: Personal, placeId: string): Personal {
  const saved = isSaved(personal, placeId)
    ? personal.saved.filter((id) => id !== placeId)
    : [...personal.saved, placeId];
  return { ...personal, saved };
}

export function hasRoute(personal: Personal, route: SavedRoute): boolean {
  return personal.routes.some((kept) => kept.from === route.from && kept.to === route.to);
}

/** Saves a walk that is not saved, and forgets one that is. */
export function toggleRoute(personal: Personal, route: SavedRoute): Personal {
  const routes = hasRoute(personal, route)
    ? personal.routes.filter((kept) => !(kept.from === route.from && kept.to === route.to))
    : [...personal.routes, { from: route.from, to: route.to }];
  return { ...personal, routes };
}

/** Puts a place at the head of the recent ones, once, dropping the oldest beyond the limit. */
export function withRecent(personal: Personal, placeId: string): Personal {
  const recent = [placeId, ...personal.recent.filter((id) => id !== placeId)].slice(0, RECENT_KEPT);
  return { ...personal, recent };
}
