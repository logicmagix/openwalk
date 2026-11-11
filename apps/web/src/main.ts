// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the controls. DOM access lives here; logic lives in the modules.

import './style.css';
import { buildIndex, type PlaceFeature } from '@openwalk/search';
import { LOCATE_ZOOM, initialView, labelLanguage, loadedFrom, pageTitle, rootChoice } from './app';
import {
  describe,
  destinationOf,
  hasArrived,
  makeRouter,
  nearestInCategory,
  planRoute,
} from './directions';
import { siteCategories } from './categories';
import { Locator } from './locate';
import { setupOffline } from './offline';
import { MapView } from './map/adapter';
import { isOnSite, siteExtent } from './map/extent';
import {
  buildStyle,
  destinationCollection,
  positionCollection,
  routeCollection,
  type LayerPrefs,
  type OverlaySpec,
  type StyleInputs,
} from './map/style';
import { FixedPositionProvider } from './position/fixed';
import { GeolocationProvider } from './position/geolocation';
import { parseGpx } from './position/gpx';
import { positionErrorMessage, type PositionFix, type PositionProvider } from './position/provider';
import { ReplayProvider } from './position/replay';
import { chooseProvider, replayAllowed, traceUrl } from './position/select';
import {
  fetchJson,
  loadSite,
  placeLinkFromPath,
  siteBaseUrl,
  siteIdFromPath,
  sitePagePath,
} from './site/load';
import { SITE_INDEX_PATH, type SiteIndex } from './site/pages';
import { watchTheme } from './theme';
import { setupLayers } from './ui/layers';
import { setupLegend } from './ui/legend';
import { listFor } from './ui/listing';
import { setupOfflineStatus } from './ui/offline-status';
import { setupPanel } from './ui/panel';
import { showPicker } from './ui/picker';
import { setupZoom } from './ui/zoom';
import { setupSearch } from './ui/search';

// MapLibre wants absolute URLs for sprites, so every address is resolved against
// the page; nothing points at another origin.
const ASSETS_BASE = new URL('/basemap', location.href).href;

/** Screen space kept clear around a route when the map is fitted to it. */
const ROUTE_PADDING = 80;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing element #${id}`);
  return found as T;
}

const status = element<HTMLParagraphElement>('status');

function showStatus(message: string | null): void {
  status.textContent = message ?? '';
  status.hidden = message === null;
}

/** The position source for this page load: the GPS unless the address asks otherwise. */
async function makeProvider(siteId: string): Promise<PositionProvider> {
  const choice = chooseProvider(location.search, replayAllowed(import.meta.env));
  if (choice.kind === 'fixed') {
    return new FixedPositionProvider({
      position: choice.position,
      accuracyM: choice.accuracyM,
      heading: null,
      timestamp: Date.now(),
    });
  }
  if (choice.kind === 'replay') {
    const response = await fetch(traceUrl(siteBaseUrl(siteId), choice.trace));
    if (!response.ok) throw new Error(`trace ${choice.trace} not found`);
    const points = parseGpx(await response.text());
    showStatus(`Replaying ${choice.trace} at ${choice.speed}× speed.`);
    return new ReplayProvider(points, { speed: choice.speed, loop: choice.loop });
  }
  return new GeolocationProvider();
}

/**
 * The root address: with one site on the host its map opens; with several, the
 * person chooses from a list.
 */
async function startAtRoot(): Promise<void> {
  const index = (await fetchJson(SITE_INDEX_PATH)) as SiteIndex;
  const choice = rootChoice(index.sites, sitePagePath);
  if (choice.kind === 'open') {
    location.replace(choice.path);
  } else if (choice.kind === 'choose') {
    showPicker({ root: element('picker'), list: element('picker-list') }, choice.entries);
  } else {
    showStatus('There are no maps here yet.');
  }
}

async function start(): Promise<void> {
  // A page is reached either as the map (/s/<site>/) or as a share link to one
  // place (/p/<site>/<place-id>); the latter opens the map on that place.
  const link = placeLinkFromPath(location.pathname);
  const siteId = link?.siteId ?? siteIdFromPath(location.pathname);
  if (siteId === null) {
    if (location.pathname === '/') await startAtRoot();
    else showStatus('No site in the address. Open /s/<site-id>/ for a site.');
    return;
  }

  const site = await loadSite(siteId);
  document.title = pageTitle(site.config);
  const router = makeRouter(site.graph, site.config);
  const index = buildIndex(site.places);
  const placesById = new Map(site.places.features.map((place) => [place.id, place]));

  // Overlay images are addressed relative to the site directory; resolve each to an
  // absolute, same-origin URL so the style can hand it to MapLibre.
  const siteBase = siteBaseUrl(siteId);
  const overlays: OverlaySpec[] = site.overlays.map((overlay) => ({
    id: overlay.id,
    name: overlay.name,
    imageUrl: new URL(`${siteBase}${overlay.image}`, location.href).href,
    corners: overlay.corners,
    ...(overlay.attribution ? { attribution: overlay.attribution } : {}),
  }));

  const categories = siteCategories(site.config, site.places);

  // --- the map ---------------------------------------------------------------
  const inputs: { current: StyleInputs } = {
    current: {
      theme: 'light',
      basemapUrl: new URL(site.basemapUrl, location.href).href,
      assetsBase: ASSETS_BASE,
      lang: labelLanguage(navigator.language),
      attribution: site.config.attribution,
      walkways: site.walkways,
      places: site.places,
      overlays,
      layerPrefs: { overlays: [], walkways: true, labels: true },
      categories,
      hiddenCategories: [],
      position: null,
      route: null,
      destination: null,
    },
  };
  inputs.current = { ...inputs.current, theme: watchTheme((theme) => restyle({ theme })) };

  const view = initialView(site.config, site.places);
  const extent = siteExtent(site.places, site.walkways);
  const map = new MapView(element('map'), {
    style: buildStyle(inputs.current),
    ...view,
    ...(extent ? { extent } : {}),
  });

  function restyle(change: Partial<StyleInputs>): void {
    inputs.current = { ...inputs.current, ...change };
    map.setStyle(buildStyle(inputs.current));
  }

  // --- directions state --------------------------------------------------------
  let destination: PlaceFeature | null = null;
  let lastFix: PositionFix | null = null;
  let fitted = false;
  // A "nearest" request made before a position was known, resolved on the next fix.
  let pendingNearest: { category: string; label: string } | null = null;
  // Set when the last position reading was away from the site. Position and
  // directions are for people at the site, so locating is switched off again.
  let away = false;

  const panel = setupPanel(
    {
      root: element('panel'),
      name: element('panel-name'),
      detail: element('panel-detail'),
      status: element('panel-status'),
      arrow: element('panel-arrow'),
      action: element('panel-action'),
      close: element('panel-close'),
    },
    {
      onClose: () => chooseDestination(null),
      onAction: () => {
        if (!locator.on) toggleLocate();
      },
    },
  );

  /** Recompute the route and the panel from the latest fix and destination. */
  function guide(): void {
    if (destination === null) return;
    if (lastFix === null || !locator.on) {
      inputs.current = { ...inputs.current, route: null };
      map.setRoute(routeCollection(null));
      if (away) panel.update({ kind: 'away', siteName: site.config.name });
      else panel.update({ kind: locator.on ? 'waiting' : 'needs-location' });
      return;
    }
    if (hasArrived(lastFix, destinationOf(router, destination))) {
      inputs.current = { ...inputs.current, route: null };
      map.setRoute(routeCollection(null));
      panel.update({ kind: 'arrived' });
      return;
    }
    const found = planRoute(router, lastFix, destination.id);
    inputs.current = { ...inputs.current, route: found };
    map.setRoute(routeCollection(found));
    if (found === null) {
      panel.update({ kind: 'unreachable' });
      return;
    }
    panel.update({
      kind: 'guiding',
      guidance: describe(found, lastFix, router.units),
      mapBearing: map.getBearing(),
    });
    if (!fitted) {
      fitted = true;
      map.fitPositions(found.positions, ROUTE_PADDING);
    }
  }

  function chooseDestination(place: PlaceFeature | null): void {
    destination = place;
    fitted = false;
    // Restyling keeps the chosen place on the map when its kind is hidden.
    restyle({
      destination: place === null ? null : place.geometry.coordinates,
      destinationId: place === null ? null : place.id,
      route: null,
    });
    map.setDestination(destinationCollection(inputs.current.destination ?? null));
    map.setRoute(routeCollection(null));
    if (place === null) {
      panel.hide();
      return;
    }
    panel.show(place);
    // The panel now carries the "not at the site" message, so drop the notice.
    if (away) showStatus(null);
    if (lastFix === null || !locator.on) map.easeTo(place.geometry.coordinates, LOCATE_ZOOM);
    guide();
  }

  /**
   * Find the closest place of a category on foot and make it the destination.
   * Needs a position, so without one it turns on location and resolves on the
   * next fix.
   */
  function chooseNearest(category: string, label: string): void {
    if (lastFix === null || !locator.on) {
      pendingNearest = { category, label };
      showStatus(`Finding the nearest ${label.toLowerCase()}…`);
      if (!locator.on) toggleLocate();
      return;
    }
    const match = nearestInCategory(router, lastFix, site.places.features, category);
    if (match === null) {
      showStatus(`No ${label.toLowerCase()} can be reached from here.`);
      return;
    }
    showStatus(null);
    searchInput.value = '';
    chooseDestination(match.place);
  }

  // --- position ------------------------------------------------------------------
  const locateButton = element<HTMLButtonElement>('locate');
  const locator = new Locator(await makeProvider(siteId), {
    onFix(fix, first) {
      if (extent !== null && !isOnSite(fix.position, fix.accuracyM, extent)) {
        leaveSite();
        return;
      }
      lastFix = fix;
      inputs.current = { ...inputs.current, position: fix };
      map.setPosition(positionCollection(fix));
      if (first && destination === null && pendingNearest === null) {
        map.easeTo(fix.position, LOCATE_ZOOM);
      }
      guide();
      if (pendingNearest !== null) {
        const request = pendingNearest;
        pendingNearest = null;
        chooseNearest(request.category, request.label);
      }
    },
    onError(error) {
      showStatus(positionErrorMessage(error));
    },
    onCleared() {
      lastFix = null;
      inputs.current = { ...inputs.current, position: null };
      map.setPosition(positionCollection(null));
      guide();
    },
  });

  /**
   * A position reading away from the site: show nothing of it, plan nothing,
   * and stop watching, so the phone is not kept locating for no purpose.
   */
  function leaveSite(): void {
    away = true;
    pendingNearest = null;
    // Switching off clears the marker and route and refreshes the panel.
    if (locator.on) locator.toggle();
    locateButton.setAttribute('aria-pressed', 'false');
    // With a destination open the panel carries the message; otherwise a notice does.
    showStatus(
      destination === null
        ? `You need to be at ${site.config.name} to see your position and get directions.`
        : null,
    );
  }

  function toggleLocate(): void {
    away = false;
    showStatus(null);
    const on = locator.toggle();
    locateButton.setAttribute('aria-pressed', String(on));
    if (on) guide();
  }

  locateButton.disabled = false;
  locateButton.addEventListener('click', toggleLocate);

  // Nothing runs while the page is in the background.
  document.addEventListener('visibilitychange', () => locator.setVisible(!document.hidden));

  // --- search and taps ----------------------------------------------------------
  const searchInput = element<HTMLInputElement>('search-input');
  setupSearch(
    {
      input: searchInput,
      list: element('search-list'),
      clear: element('search-clear'),
    },
    {
      listFor: (query, browsing) =>
        listFor({ places: site.places, index, categories }, query, browsing),
      onChoose: (place) => chooseDestination(place),
    },
  );
  searchInput.disabled = false;

  map.onPlaceTap((placeId) => {
    const place = placesById.get(placeId);
    if (place === undefined) return;
    searchInput.value = '';
    chooseDestination(place);
  });

  map.onRotate(() => {
    if (destination !== null && inputs.current.route && lastFix !== null) guide();
  });

  // --- zoom buttons -------------------------------------------------------------
  map.onZoomRoom(
    setupZoom(
      {
        zoomIn: element<HTMLButtonElement>('zoom-in'),
        zoomOut: element<HTMLButtonElement>('zoom-out'),
      },
      (direction) => map.zoomBy(direction),
    ),
  );

  // --- layers control -----------------------------------------------------------
  const initialPrefs: LayerPrefs = setupLayers(
    { button: element<HTMLButtonElement>('layers'), panel: element('layers-panel') },
    {
      overlays: overlays.map(({ id, name, attribution }) => ({ id, name, attribution })),
      onChange: (prefs) => restyle({ layerPrefs: prefs }),
    },
  );
  inputs.current = { ...inputs.current, layerPrefs: initialPrefs };

  // --- legend -------------------------------------------------------------------
  const legend = setupLegend(
    { button: element<HTMLButtonElement>('legend'), panel: element('legend-panel') },
    { categories, onChange: (hidden) => restyle({ hiddenCategories: hidden }) },
  );
  // On a host with more than one site, the legend's foot leads to the others.
  // The list is not needed for anything else, so its absence is not an error.
  fetchJson(SITE_INDEX_PATH)
    .then((list) => {
      if ((list as SiteIndex).sites.length > 1) {
        legend.addLink({ label: 'Other locations', path: '/' });
      }
    })
    .catch(() => undefined);

  // --- "nearest" chips ----------------------------------------------------------
  // One button per category the site configures; hidden when it configures none.
  const nearest = element('nearest');
  for (const { category, label } of site.config.nearest ?? []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Nearest ${label.toLowerCase()}`;
    button.addEventListener('click', () => chooseNearest(category, label));
    nearest.append(button);
  }
  nearest.hidden = nearest.childElementCount === 0;

  // A share link opens straight onto its place, with the panel ready.
  if (link !== null) {
    const place = placesById.get(link.placeId);
    if (place === undefined) {
      showStatus('That place is not on this map.');
    } else {
      chooseDestination(place);
    }
  }

  // --- offline support -----------------------------------------------------------
  // After the first online visit the app keeps working with no network. The page
  // tells the worker which same-origin files to keep: its own bundles and assets,
  // this site's data, and the whole basemap.
  function collectOfflineUrls(): string[] {
    const origin = location.origin;
    // Not every browser reports that a file was not found, so the one optional
    // file is also left out by name when the site turned out not to have it.
    const absent = overlays.length === 0 ? new URL(`${siteBase}overlays.json`, origin).href : null;
    const loaded = loadedFrom(
      performance.getEntriesByType('resource') as PerformanceResourceTiming[],
      origin,
    ).filter((name) => name !== absent);
    const extras = [
      location.href,
      new URL('/index.html', origin).href, // the shell any route falls back to
      // The manifest this page links: the site's own when it has one.
      document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ??
        new URL('/manifest.webmanifest', origin).href,
      new URL('/favicon.svg', origin).href,
      new URL('/icons/icon-192.png', origin).href,
      new URL('/icons/icon-512.png', origin).href,
      inputs.current.basemapUrl,
      // Overlay images load only when their layer is turned on, so add them
      // explicitly or an overlay toggled on offline would have nothing to draw.
      ...overlays.map((overlay) => overlay.imageUrl),
    ];
    return [...new Set([...loaded, ...extras])];
  }
  setupOffline(collectOfflineUrls, setupOfflineStatus());
}

start().catch((error: unknown) => {
  showStatus(`Could not load the site: ${error instanceof Error ? error.message : String(error)}`);
});
