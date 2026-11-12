// What of a site's directory is put into the image and so served to anyone.
//
// A site's directory holds more than the app reads: the hand-written sources
// its data is generated from, notes on where the data came from, a page for
// checking it by eye, downloaded reference files. None of that is the app's to
// hand out, so the image takes only the files named here.
//
// An overlay, an image of the site's own map laid over the base map, can also
// be held back by its `publish: false` setting: it stays available to the
// site's maintainer for placing things, and is left out of what is served. That
// is for an image the site does not yet have the right to show.
//
// Pure data in, data out. This file is also run directly by Node during the
// image build, so it imports nothing.

/** The files every site must have for the app to open it. */
export const REQUIRED_FILES: readonly string[] = [
  'site.json',
  'places.geojson',
  'walkways.geojson',
  'graph.json',
  'basemap.pmtiles',
];

/** The generated list of a site's overlays; published only with overlays left in it. */
export const OVERLAYS_FILE = 'overlays.json';

/** Recorded walks replayed in demonstrations, one .gpx file each. */
export const TRACES_DIRECTORY = 'traces';

/** Whether a file in the traces directory is a trace to publish. */
export function isTrace(fileName: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*\.gpx$/.test(fileName);
}

interface OverlaySetting {
  readonly id: string;
  readonly publish?: boolean;
}

interface SiteSettings {
  readonly overlays?: readonly OverlaySetting[];
}

interface OverlaysDocument {
  readonly overlays?: readonly { readonly id: string; readonly image: string }[];
}

/** The ids of the overlays a site's settings hold back from being served. */
export function withheldOverlays(config: SiteSettings): ReadonlySet<string> {
  return new Set(
    (config.overlays ?? []).filter((overlay) => overlay.publish === false).map(({ id }) => id),
  );
}

/** The overlays list without those held back. */
export function publishedOverlays<T extends OverlaysDocument>(
  document: T,
  withheld: ReadonlySet<string>,
): T {
  return {
    ...document,
    overlays: (document.overlays ?? []).filter((overlay) => !withheld.has(overlay.id)),
  };
}

/** The site's settings without the overlays held back, which are nobody else's business. */
export function publishedSettings<T extends SiteSettings>(config: T): T {
  if (config.overlays === undefined) return config;
  return { ...config, overlays: config.overlays.filter((overlay) => overlay.publish !== false) };
}

/**
 * Whether a path from a site's own data stays inside the site's directory.
 * An overlay names its image by such a path, and the build copies what it names.
 */
export function isInsideSite(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.split(/[\\/]/).some((part) => part === '..');
}
