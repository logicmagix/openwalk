// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the controls. DOM access lives here; logic lives in the modules.

import './style.css';
import { buildIndex, type PlaceFeature } from '@openwalk/search';
import { LOCATE_ZOOM, initialView, labelLanguage, pageTitle, siteBounds } from './app';
import {
  describe,
  destinationOf,
  hasArrived,
  makeRouter,
  nearestInCategory,
  planRoute,
} from './directions';
import { Locator } from './locate';
import { setupOffline } from './offline';
import { MapView } from './map/adapter';
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
  loadSite,
  placeLinkFromPath,
  siteBaseUrl,
  siteIdFromPath,
  sitePagePath,
} from './site/load';
import { watchTheme } from './theme';
import { setupLayers } from './ui/layers';
import { listPlaces } from './ui/listing';
import { setupOfflineStatus } from './ui/offline-status';
import { setupPanel } from './ui/panel';
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

async function start(): Promise<void> {
  // A page is reached either as the map (/s/<site>/) or as a share link to one
  // place (/p/<site>/<place-id>); the latter opens the map on that place.
  const link = placeLinkFromPath(location.pathname);
  const siteId = link?.siteId ?? siteIdFromPath(location.pathname);
  if (siteId === null) {
    const fallback = import.meta.env.VITE_DEFAULT_SITE;
    if (fallback && location.pathname === '/') {
      location.replace(sitePagePath(fallback));
      return;
    }
    showStatus('No site in the address. Open /s/<site-id>/ for a site.');
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
      position: null,
      route: null,
      destination: null,
    },
  };
  inputs.current = { ...inputs.current, theme: watchTheme((theme) => restyle({ theme })) };

  const view = initialView(site.config, site.places);
  const bounds = siteBounds(site.places);
  const map = new MapView(element('map'), {
    style: buildStyle(inputs.current),
    ...view,
    ...(bounds ? { maxBounds: bounds } : {}),
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
      panel.update({ kind: locator.on ? 'waiting' : 'needs-location' });
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
    inputs.current = {
      ...inputs.current,
      destination: place === null ? null : place.geometry.coordinates,
      route: null,
    };
    map.setDestination(destinationCollection(inputs.current.destination ?? null));
    map.setRoute(routeCollection(null));
    if (place === null) {
      panel.hide();
      return;
    }
    panel.show(place);
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

  function toggleLocate(): void {
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
      listFor: (query) => listPlaces(site.places, index, query),
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

  // --- layers control -----------------------------------------------------------
  const initialPrefs: LayerPrefs = setupLayers(
    { button: element<HTMLButtonElement>('layers'), panel: element('layers-panel') },
    {
      overlays: overlays.map(({ id, name, attribution }) => ({ id, name, attribution })),
      onChange: (prefs) => restyle({ layerPrefs: prefs }),
    },
  );
  inputs.current = { ...inputs.current, layerPrefs: initialPrefs };

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
    const loaded = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.startsWith(origin));
    const extras = [
      location.href,
      new URL('/index.html', origin).href, // the shell any route falls back to
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
