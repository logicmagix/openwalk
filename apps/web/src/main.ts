// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the locate button. DOM access lives here; logic lives in the modules.

import './style.css';
import { LOCATE_ZOOM, initialView, labelLanguage, pageTitle } from './app';
import { Locator } from './locate';
import { MapView } from './map/adapter';
import { buildStyle, positionCollection, type StyleInputs } from './map/style';
import { FixedPositionProvider } from './position/fixed';
import { GeolocationProvider } from './position/geolocation';
import { parseGpx } from './position/gpx';
import { positionErrorMessage, type PositionProvider } from './position/provider';
import { ReplayProvider } from './position/replay';
import { chooseProvider, replayAllowed, traceUrl } from './position/select';
import { loadSite, siteBaseUrl, siteIdFromPath, sitePagePath } from './site/load';
import { watchTheme } from './theme';

// MapLibre wants absolute URLs for sprites, so every address is resolved against
// the page; nothing points at another origin.
const ASSETS_BASE = new URL('/basemap', location.href).href;

const mapElement = document.getElementById('map');
const locateButton = document.getElementById('locate') as HTMLButtonElement | null;
const status = document.getElementById('status');

function showStatus(message: string | null): void {
  if (!status) return;
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
  if (!mapElement || !locateButton) return;

  const site = await loadSite(siteId);
  document.title = pageTitle(site.config);

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
    },
  };
  inputs.current = { ...inputs.current, theme: watchTheme((theme) => restyle({ theme })) };

  const view = initialView(site.config, site.places);
  const map = new MapView(mapElement, { style: buildStyle(inputs.current), ...view });

  function restyle(change: Partial<StyleInputs>): void {
    inputs.current = { ...inputs.current, ...change };
    map.setStyle(buildStyle(inputs.current));
  }

  const locator = new Locator(await makeProvider(siteId), {
    onFix(fix, first) {
      inputs.current = { ...inputs.current, position: fix };
      map.setPosition(positionCollection(fix));
      if (first) map.easeTo(fix.position, LOCATE_ZOOM);
    },
    onError(error) {
      showStatus(positionErrorMessage(error));
    },
    onCleared() {
      inputs.current = { ...inputs.current, position: null };
      map.setPosition(positionCollection(null));
    },
  });

  locateButton.disabled = false;
  locateButton.addEventListener('click', () => {
    showStatus(null);
    const on = locator.toggle();
    locateButton.setAttribute('aria-pressed', String(on));
  });

  // Nothing runs while the page is in the background.
  document.addEventListener('visibilitychange', () => locator.setVisible(!document.hidden));
}

start().catch((error: unknown) => {
  showStatus(`Could not load the site: ${error instanceof Error ? error.message : String(error)}`);
});
