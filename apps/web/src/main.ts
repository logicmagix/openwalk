// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the locate button. DOM access lives here; logic lives in the modules.

import './style.css';
import { LOCATE_ZOOM, initialView, labelLanguage, pageTitle } from './app';
import { MapView } from './map/adapter';
import { buildStyle, positionCollection, type StyleInputs } from './map/style';
import { GeolocationProvider } from './position/geolocation';
import { positionErrorMessage, type PositionFix } from './position/provider';
import { loadSite, siteIdFromPath, sitePagePath } from './site/load';
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

  // Locate me: watch the position while on, centre on the first fix, and stop
  // when the page is hidden so nothing runs in the background.
  const provider = new GeolocationProvider();
  let centred = false;
  let wantedOn = false;

  function onFix(fix: PositionFix): void {
    inputs.current = { ...inputs.current, position: fix };
    map.setPosition(positionCollection(fix));
    showStatus(null);
    if (!centred) {
      centred = true;
      map.easeTo(fix.position, LOCATE_ZOOM);
    }
  }

  function setLocating(on: boolean): void {
    locateButton?.setAttribute('aria-pressed', String(on));
    if (on) {
      provider.start(onFix, (error) => showStatus(positionErrorMessage(error)));
    } else {
      provider.stop();
      inputs.current = { ...inputs.current, position: null };
      map.setPosition(positionCollection(null));
    }
  }

  locateButton.disabled = false;
  locateButton.addEventListener('click', () => {
    wantedOn = !wantedOn;
    centred = false;
    showStatus(null);
    setLocating(wantedOn);
  });

  document.addEventListener('visibilitychange', () => {
    if (!wantedOn) return;
    if (document.hidden) provider.stop();
    else provider.start(onFix, (error) => showStatus(positionErrorMessage(error)));
  });
}

start().catch((error: unknown) => {
  showStatus(`Could not load the site: ${error instanceof Error ? error.message : String(error)}`);
});
