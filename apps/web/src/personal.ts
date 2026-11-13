// What someone keeps for themselves on a site: the places they have saved, and
// the last few they asked the way to. Kept on the device, per site, and never
// sent anywhere. Pure data in, data out; the page does the storing.
//
// Places are kept by id. What comes back from storage is treated as untrusted
// and checked against the places the site has now, so a place that has gone
// from the site simply drops out.

export interface Personal {
  /** Ids of the saved places, oldest first. */
  readonly saved: readonly string[];
  /** Ids of the places last chosen as a destination, most recent first. */
  readonly recent: readonly string[];
}

export const NOTHING_KEPT: Personal = { saved: [], recent: [] };

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

/** What to start with, from whatever was kept. */
export function readPersonal(kept: unknown, placeIds: Iterable<string>): Personal {
  const known = new Set(placeIds);
  const record = typeof kept === 'object' && kept !== null ? (kept as Record<string, unknown>) : {};
  return {
    saved: knownIds(record['saved'], known),
    recent: knownIds(record['recent'], known).slice(0, RECENT_KEPT),
  };
}

/** The form it is kept in. The version lets a later app tell old from new. */
export function keptPersonal(personal: Personal): unknown {
  return { version: 1, saved: [...personal.saved], recent: [...personal.recent] };
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

/** Puts a place at the head of the recent ones, once, dropping the oldest beyond the limit. */
export function withRecent(personal: Personal, placeId: string): Personal {
  const recent = [placeId, ...personal.recent.filter((id) => id !== placeId)].slice(0, RECENT_KEPT);
  return { ...personal, recent };
}
