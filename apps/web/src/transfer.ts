// Moving someone's saved places and walks from one device to another, with no
// server in between: as a small file, or as a link that carries them.
//
// The link holds the data after its "#". Browsers keep that part to themselves
// and never send it to a server, so opening such a link tells the host nothing
// about what is in it. Only the ids of places travel: no position, and nothing
// about where the person has been. Recent places are left out for that reason.
//
// A file, and only a file, may also carry the spots the person has marked,
// which are positions. That is for keeping a copy of one's own, it happens
// only when asked for, and spots found in a link are ignored.
//
// What arrives is treated as untrusted. It is read strictly, checked against
// the site it names and the places that site has, and added to what the device
// already holds, never put in its place. Pure data in, data out.

import type { Personal, SavedRoute } from './personal';
import { readSpots, type Spot } from './spots';

/** What travels: the site it belongs to, saved place ids, and saved walks. */
export interface Transfer {
  readonly site: string;
  readonly saved: readonly string[];
  readonly routes: readonly SavedRoute[];
  /** Marked spots, which only a file carries; each is a point and a name. */
  readonly spots?: readonly Spot[];
}

/** The name the data goes under after the "#" of a link. */
export const LINK_KEY = 'places';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** More than this is not a list of someone's places; it is refused unread. */
const MAX_TEXT = 20_000;
const MAX_ITEMS = 500;

export function toTransfer(siteId: string, personal: Personal): Transfer {
  return {
    site: siteId,
    saved: [...personal.saved],
    routes: personal.routes.map(({ from, to }) => ({ from, to })),
  };
}

/** Whether there is nothing to put in a link: no saved place and no saved walk. */
export function isEmpty(transfer: Transfer): boolean {
  return transfer.saved.length === 0 && transfer.routes.length === 0;
}

/** The short form that goes in a link: single-letter names and walks as pairs. */
function compact(transfer: Transfer): unknown {
  return {
    v: 1,
    s: transfer.site,
    p: transfer.saved,
    r: transfer.routes.map(({ from, to }) => [from, to]),
  };
}

/** Text that is safe anywhere in a link: base64 with the two awkward characters swapped. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The data as it rides in a link. */
export function transferCode(transfer: Transfer): string {
  return toBase64Url(JSON.stringify(compact(transfer)));
}

/** A link to the site's map that carries the data after its "#". */
export function transferLink(origin: string, transfer: Transfer): string {
  return `${origin}/s/${transfer.site}/#${LINK_KEY}=${transferCode(transfer)}`;
}

/**
 * The data as a file's contents: the same short form, laid out to be read,
 * with the given spots added when there are any.
 */
export function transferFile(transfer: Transfer, spots: readonly Spot[] = []): string {
  const contents = compact(transfer) as Record<string, unknown>;
  if (spots.length > 0) {
    contents['x'] = spots.map(({ kind, name, position }) => ({
      k: kind,
      n: name,
      c: [...position],
    }));
  }
  return `${JSON.stringify(contents, null, 2)}\n`;
}

/** A file name that says which site the places belong to. */
export function transferFileName(siteId: string): string {
  return `openwalk-${siteId}-places.json`;
}

function ids(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const found: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'string' || !ID.test(entry)) return null;
    if (!found.includes(entry)) found.push(entry);
  }
  return found;
}

/** The spots in a file's `x`, read as strictly as spots kept on the device are. */
function spotsIn(value: unknown): Spot[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return [];
  const listed = (value as unknown[]).map((entry, index) => {
    const { k, n, c } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    return { id: `arrived-${index}`, kind: k, name: n, position: c };
  });
  return readSpots({ spots: listed });
}

function parse(json: string, withSpots = false): Transfer | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { v, s, p, r, x } = value as {
    v?: unknown;
    s?: unknown;
    p?: unknown;
    r?: unknown;
    x?: unknown;
  };
  if (v !== 1 || typeof s !== 'string' || !ID.test(s)) return null;
  const saved = ids(p ?? []);
  if (saved === null || !Array.isArray(r ?? []) || ((r ?? []) as unknown[]).length > MAX_ITEMS) {
    return null;
  }
  const routes: SavedRoute[] = [];
  for (const entry of (r ?? []) as unknown[]) {
    const pair = ids(entry);
    // A walk is exactly two places. `ids` drops a repeat, so a walk from a
    // place to itself comes back as one id; it is read again as given.
    const [from, to] = Array.isArray(entry) ? (entry as unknown[]) : [];
    if (pair === null || typeof from !== 'string' || typeof to !== 'string') return null;
    if ((entry as unknown[]).length !== 2) return null;
    if (!routes.some((route) => route.from === from && route.to === to)) routes.push({ from, to });
  }
  const spots = withSpots ? spotsIn(x) : [];
  return spots.length > 0 ? { site: s, saved, routes, spots } : { site: s, saved, routes };
}

/**
 * Reads what someone pasted or chose: a whole link, the code from one, or the
 * contents of a file. Null when it is none of those.
 */
export function readTransfer(text: string): Transfer | null {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > MAX_TEXT) return null;
  // Only a file's own text may carry spots; whatever a link holds, its spots are ignored.
  if (trimmed.startsWith('{')) return parse(trimmed, true);
  const marker = `${LINK_KEY}=`;
  const at = trimmed.lastIndexOf(marker);
  const code = at >= 0 ? trimmed.slice(at + marker.length) : trimmed;
  const json = fromBase64Url(code);
  return json === null ? null : parse(json);
}

/** The data a page address carries after its "#", or null when it carries none. */
export function transferFromHash(hash: string): Transfer | null {
  return hash.includes(`${LINK_KEY}=`) ? readTransfer(hash) : null;
}

export interface Merge {
  readonly personal: Personal;
  /** How many places and walks were new to this device. */
  readonly addedPlaces: number;
  readonly addedRoutes: number;
  /** How many were left out because the site does not have their places. */
  readonly unknown: number;
  /** How many marked spots were new to this device, when a file carried any. */
  readonly addedSpots?: number;
}

/** Adds what arrived to what the device holds. Nothing already held is removed. */
export function mergeTransfer(
  personal: Personal,
  incoming: Transfer,
  placeIds: Iterable<string>,
): Merge {
  const known = new Set(placeIds);
  let unknown = 0;
  const saved = [...personal.saved];
  for (const id of incoming.saved) {
    if (!known.has(id)) unknown += 1;
    else if (!saved.includes(id)) saved.push(id);
  }
  const routes = [...personal.routes];
  for (const { from, to } of incoming.routes) {
    if (!known.has(from) || !known.has(to)) unknown += 1;
    else if (!routes.some((route) => route.from === from && route.to === to)) {
      routes.push({ from, to });
    }
  }
  return {
    personal: { ...personal, saved, routes },
    addedPlaces: saved.length - personal.saved.length,
    addedRoutes: routes.length - personal.routes.length,
    unknown,
  };
}

/** "a", "a and b", "a, b and c". */
function inWords(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** What to tell the person after an import. */
export function mergeMessage(merge: Merge): string {
  const parts: string[] = [];
  if (merge.addedPlaces > 0) parts.push(counted(merge.addedPlaces, 'place', 'places'));
  if (merge.addedRoutes > 0) parts.push(counted(merge.addedRoutes, 'route', 'routes'));
  if ((merge.addedSpots ?? 0) > 0) parts.push(counted(merge.addedSpots ?? 0, 'spot', 'spots'));
  const added =
    parts.length > 0 ? `Added ${inWords(parts)}.` : 'Nothing new: you already have these.';
  const left =
    merge.unknown > 0
      ? ` ${counted(merge.unknown, 'was', 'were')} left out because this map does not have ${merge.unknown === 1 ? 'that place' : 'those places'}.`
      : '';
  return added + left;
}
