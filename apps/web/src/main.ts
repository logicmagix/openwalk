// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the controls. DOM access lives here; logic lives in the modules.

import './style.css';
import { buildIndex, type PlaceFeature } from '@openwalk/search';
import { LOCATE_ZOOM, initialView, labelLanguage, pageTitle } from './app';
import { describe, destinationOf, hasArrived, makeRouter, planRoute } from './directions';
import { Locator } from './locate';
import { MapView } from './map/adapter';
import {
  buildStyle,
  destinationCollection,
  positionCollection,
  routeCollection,
  type StyleInputs,
} from './map/style';
import { FixedPositionProvider } from './position/fixed';
import { GeolocationProvider } from './position/geolocation';
import { parseGpx } from './position/gpx';
import { positionErrorMessage, type PositionFix, type PositionProvider } from './position/provider';
import { ReplayProvider } from './position/replay';
import { chooseProvider, replayAllowed, traceUrl } from './position/select';
import { loadSite, siteBaseUrl, siteIdFromPath, sitePagePath } from './site/load';
import { watchTheme } from './theme';
import { listPlaces } from './ui/listing';
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
  const siteId = siteIdFromPath(location.pathname);
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
      position: null,
      route: null,
      destination: null,
    },
  };
  inputs.current = { ...inputs.current, theme: watchTheme((theme) => restyle({ theme })) };

  const view = initialView(site.config, site.places);
  const map = new MapView(element('map'), { style: buildStyle(inputs.current), ...view });

  function restyle(change: Partial<StyleInputs>): void {
    inputs.current = { ...inputs.current, ...change };
    map.setStyle(buildStyle(inputs.current));
  }

  // --- directions state --------------------------------------------------------
  let destination: PlaceFeature | null = null;
  let lastFix: PositionFix | null = null;
  let fitted = false;

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
      guidance: describe(found, lastFix),
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

  // --- position ------------------------------------------------------------------
  const locateButton = element<HTMLButtonElement>('locate');
  const locator = new Locator(await makeProvider(siteId), {
    onFix(fix, first) {
      lastFix = fix;
      inputs.current = { ...inputs.current, position: fix };
      map.setPosition(positionCollection(fix));
      if (first && destination === null) map.easeTo(fix.position, LOCATE_ZOOM);
      guide();
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
    { input: searchInput, list: element('search-list') },
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
}

start().catch((error: unknown) => {
  showStatus(`Could not load the site: ${error instanceof Error ? error.message : String(error)}`);
});
