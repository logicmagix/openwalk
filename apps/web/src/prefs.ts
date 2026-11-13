// What the app remembers about how someone left a site's map: which optional
// layers were on and which kinds of place were hidden. Kept on the device, per
// site, and read back on the next visit.
//
// What comes back from storage is treated as untrusted: it may be from an older
// version of the app, or name a layer or a kind the site no longer has. Reading
// keeps what still makes sense and falls back to the defaults for the rest.

import type { LayerPrefs } from './map/style';

export interface SitePrefs {
  readonly layers: LayerPrefs;
  /** Ids of the kinds of place hidden with the legend. */
  readonly hiddenCategories: readonly string[];
}

/** How a site's map opens for someone new: no overlays, everything else shown. */
export const DEFAULT_PREFS: SitePrefs = {
  layers: { overlays: [], walkways: true, labels: true },
  hiddenCategories: [],
};

/** The key a site's preferences are kept under. */
export function prefsKey(siteId: string): string {
  return `prefs:${siteId}`;
}

/** What the site has now, against which remembered choices are checked. */
export interface Known {
  readonly overlays: readonly string[];
  readonly categories: readonly string[];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** The entries of `value` that are among `known`, in the order kept, once each. */
function knownIds(value: unknown, known: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => known.includes(id as string)))];
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** The preferences to open with, from whatever was kept. */
export function readPrefs(saved: unknown, known: Known): SitePrefs {
  const kept = record(saved);
  const layers = record(kept['layers']);
  return {
    layers: {
      overlays: knownIds(layers['overlays'], known.overlays),
      walkways: flag(layers['walkways'], DEFAULT_PREFS.layers.walkways ?? true),
      labels: flag(layers['labels'], DEFAULT_PREFS.layers.labels ?? true),
    },
    hiddenCategories: knownIds(kept['hiddenCategories'], known.categories),
  };
}

/** The form preferences are kept in. The version lets a later app tell old from new. */
export function savedPrefs(prefs: SitePrefs): unknown {
  return {
    version: 1,
    layers: {
      overlays: [...(prefs.layers.overlays ?? [])],
      walkways: prefs.layers.walkways ?? true,
      labels: prefs.layers.labels ?? true,
    },
    hiddenCategories: [...prefs.hiddenCategories],
  };
}
