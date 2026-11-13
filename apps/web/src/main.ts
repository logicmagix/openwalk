// Entry point: reads the site from the URL, loads its files, draws the map, and
// wires the controls. DOM access lives here; logic lives in the modules.

import './style.css';
import { buildIndex, type PlaceFeature } from '@openwalk/search';
import { LOCATE_ZOOM, initialView, labelLanguage, loadedFrom, pageTitle, rootChoice } from './app';
import {
  describe,
  entrancesOf,
  hasArrived,
  makeRouter,
  nearestInCategory,
  planRoute,
  planWalk,
  summarise,
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
import {
  PRIVACY_FILES,
  PRIVACY_PATH,
  SITE_INDEX_PATH,
  privacyPathFor,
  type SiteIndex,
} from './site/pages';
import {
  CAR_NAME,
  addSpot,
  isFull,
  isSpotId,
  keptSpots,
  mergeSpots,
  parkCar,
  readSpots,
  removeSpot,
  renameSpot,
  spotPlace,
  spotsKey,
  type Spot,
  type SpotKind,
} from './spots';
import { openStore } from './store/kv';
import { watchTheme } from './theme';
import {
  isEmpty,
  mergeMessage,
  mergeTransfer,
  readTransfer,
  toTransfer,
  transferFile,
  transferFileName,
  transferFromHash,
  transferLink,
} from './transfer';
import {
  hasRoute,
  isSaved,
  keptPersonal,
  personalKey,
  readPersonal,
  toggleRoute,
  toggleSaved,
  withRecent,
  type Personal,
} from './personal';
import { prefsKey, readPrefs, savedPrefs, type SitePrefs } from './prefs';
import { setupLayers } from './ui/layers';
import { setupLegend } from './ui/legend';
import { setupMyPlaces } from './ui/my-places';
import { HERE_LABEL, labelOf, listFor } from './ui/listing';
import { setupOfflineStatus } from './ui/offline-status';
import { setupPanel } from './ui/panel';
import { showPicker } from './ui/picker';
import { setupZoom } from './ui/zoom';
import { setupSearch } from './ui/search';
import { setupSpots, spotSign } from './ui/spots';

// MapLibre wants absolute URLs for sprites, so every address is resolved against
// the page; nothing points at another origin.
const ASSETS_BASE = new URL('/basemap', location.href).href;

/** How long after it was last seen open the "My places" panel is opened again on a restart. */
const REOPEN_WITHIN_MS = 10 * 60 * 1000;

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

/** A notice that something was done, which goes away by itself unless replaced first. */
function showNotice(message: string | null): void {
  showStatus(message);
  if (message === null) return;
  window.setTimeout(() => {
    if (status.textContent === message) showStatus(null);
  }, 4000);
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
    showPicker(
      { root: element('picker'), list: element('picker-list'), privacy: element('picker-privacy') },
      choice.entries,
      PRIVACY_PATH,
    );
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
  const heading = element('site-heading');
  heading.textContent = site.config.name;
  heading.hidden = false;
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

  // How the person left this site's map last time, kept on the device.
  const store = await openStore();
  let prefs: SitePrefs = readPrefs(await store.get(prefsKey(siteId)), {
    overlays: overlays.map((overlay) => overlay.id),
    categories: categories.map((category) => category.id),
  });
  // The places the person has saved here, and the last few they asked the way to.
  let personal: Personal = readPersonal(
    await store.get(personalKey(siteId)),
    site.places.features.map((place) => place.id),
  );
  const keep = (next: Personal): void => {
    personal = next;
    void store.set(personalKey(siteId), keptPersonal(personal));
  };
  // The spots the person has marked here: points, kept only on this device.
  const spotsAt = spotsKey(siteId);
  let spots: Spot[] = readSpots(await store.get(spotsAt));
  const remember = (change: Partial<SitePrefs>): void => {
    prefs = { ...prefs, ...change };
    void store.set(prefsKey(siteId), savedPrefs(prefs));
  };

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
      layerPrefs: prefs.layers,
      categories,
      hiddenCategories: prefs.hiddenCategories,
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
  // Where a planned walk starts; null while directions follow the person.
  let origin: PlaceFeature | null = null;
  let lastFix: PositionFix | null = null;
  let fitted = false;
  // A "nearest" request made before a position was known, resolved on the next fix.
  let pendingNearest: { category: string; label: string } | null = null;
  // A spot asked for before a position was known, marked on the next fix.
  let pendingSpot: SpotKind | null = null;
  // Set when the last position reading was away from the site. Position and
  // directions are for people at the site, so locating is switched off again.
  let away = false;

  const panel = setupPanel(
    {
      root: element('panel'),
      name: element('panel-name'),
      detail: element('panel-detail'),
      status: element('panel-status'),
      announce: element('panel-announce'),
      arrow: element('panel-arrow'),
      action: element('panel-action'),
      from: element('panel-from'),
      fromName: element('panel-from-name'),
      saveRoute: element('panel-save-route'),
      save: element('panel-save'),
      close: element('panel-close'),
    },
    {
      onClose: () => chooseDestination(null),
      onAction: () => {
        if (!locator.on) toggleLocate();
      },
      onFrom: () => search.pickStart(),
      onSaveRoute: () => {
        if (origin === null || destination === null) return;
        const walk = { from: origin.id, to: destination.id };
        keep(toggleRoute(personal, walk));
        panel.setRouteSaved(hasRoute(personal, walk));
      },
      onSave: () => {
        if (destination === null || isSpotId(destination.id)) return;
        keep(toggleSaved(personal, destination.id));
        panel.setSaved(isSaved(personal, destination.id));
      },
    },
  );

  /** Recompute the route and the panel from the latest fix and destination. */
  function guide(): void {
    if (destination === null) return;
    if (origin !== null) {
      showPlannedWalk(origin, destination);
      return;
    }
    if (lastFix === null || !locator.on) {
      inputs.current = { ...inputs.current, route: null };
      map.setRoute(routeCollection(null));
      if (away) panel.update({ kind: 'away', siteName: site.config.name });
      else panel.update({ kind: locator.on ? 'waiting' : 'needs-location' });
      return;
    }
    if (hasArrived(lastFix, entrancesOf(router, destination))) {
      inputs.current = { ...inputs.current, route: null };
      map.setRoute(routeCollection(null));
      panel.update({ kind: 'arrived' });
      return;
    }
    const found = planRoute(router, lastFix, destination);
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
      // The whole route is in view now; following would pull the map off it.
      locator.pause();
      showLocate();
    }
  }

  /**
   * A walk from a chosen place: drawn whole and described by its length. It
   * does not follow the person, so there is no arrow and no arriving.
   */
  function showPlannedWalk(from: PlaceFeature, to: PlaceFeature): void {
    const found = planWalk(router, from.id, to);
    inputs.current = { ...inputs.current, route: found };
    map.setRoute(routeCollection(found));
    if (found === null) {
      panel.setRouteSaved(null);
      panel.update({ kind: 'unreachable' });
      return;
    }
    // A saved walk is between two of the site's places; a spot is not one.
    panel.setRouteSaved(isSpotId(to.id) ? null : hasRoute(personal, { from: from.id, to: to.id }));
    panel.update({ kind: 'planned', from: labelOf(from), ...summarise(found, router.units) });
    if (!fitted) {
      fitted = true;
      // A walk of no length has nothing to fit; show its one spot instead.
      if (found.distanceM > 0) map.fitPositions(found.positions, ROUTE_PADDING);
      else map.easeTo(to.geometry.coordinates, LOCATE_ZOOM);
      locator.pause();
      showLocate();
    }
  }

  /** Sets where the walk starts: a place, or null for the person's own position. */
  function chooseStart(place: PlaceFeature | null): void {
    origin = place;
    fitted = false;
    panel.setFrom(place === null ? HERE_LABEL : labelOf(place));
    if (place === null) panel.setRouteSaved(null);
    guide();
  }

  /** Opens a saved walk: its start and its destination together. */
  function chooseRoute(from: PlaceFeature, to: PlaceFeature): void {
    origin = from;
    panel.setFrom(labelOf(from));
    chooseDestination(to);
  }

  function chooseDestination(place: PlaceFeature | null): void {
    destination = place;
    fitted = false;
    // Closing the directions ends any planning; the next ones start from the person.
    if (place === null && origin !== null) {
      origin = null;
      panel.setFrom(HERE_LABEL);
      panel.setRouteSaved(null);
    }
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
    if (isSpotId(place.id)) {
      // A spot is the person's own already: nothing to star, and not a recent place.
      panel.setSaved(null);
    } else {
      panel.setSaved(isSaved(personal, place.id));
      keep(withRecent(personal, place.id));
    }
    // The panel now carries the "not at the site" message, so drop the notice.
    if (away) showStatus(null);
    if (lastFix === null || !locator.on) map.easeTo(place.geometry.coordinates, LOCATE_ZOOM);
    guide();
  }

  /** Keeps a change to the spots, and shows it on the map and in the menu. */
  function keepSpots(next: Spot[]): void {
    spots = next;
    void store.set(spotsAt, keptSpots(spots));
    showSpots();
  }

  function showSpots(): void {
    map.setMarkers(
      spots.map((spot) => {
        const marker = document.createElement('div');
        marker.className = `spot-marker ${spot.kind}`;
        marker.append(spotSign(spot.kind));
        return { position: spot.position, element: marker };
      }),
    );
    spotsMenu.refresh();
  }

  /**
   * Marks where the person is standing, as the parked car or as a spot. That
   * needs a position, so without one it turns on location and marks the spot
   * on the next fix.
   */
  function markHere(kind: SpotKind): void {
    if (lastFix === null || !locator.on) {
      pendingSpot = kind;
      showStatus('Finding where you are…');
      if (!locator.on) toggleLocate();
      return;
    }
    const id = crypto.randomUUID();
    if (kind === 'car') {
      keepSpots(parkCar(spots, lastFix.position, id));
      showNotice(`“${CAR_NAME}” is saved here.`);
    } else {
      keepSpots(addSpot(spots, lastFix.position, id));
      const added = spots.find((spot) => spot.id === id);
      showNotice(added === undefined ? null : `Saved here as “${added.name}”.`);
    }
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
      } else if (!first && locator.following) {
        map.centreOn(fix.position);
      }
      guide();
      if (pendingSpot !== null) {
        const kind = pendingSpot;
        pendingSpot = null;
        markHere(kind);
      }
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
    pendingSpot = null;
    // Switching off clears the marker and route and refreshes the panel.
    if (locator.on) locator.toggle();
    showLocate();
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
    showLocate();
    if (on) guide();
  }

  /** Show on the button whether locating is on and whether the map is following. */
  function showLocate(): void {
    locateButton.setAttribute('aria-pressed', String(locator.on));
    locateButton.dataset['following'] = String(locator.following);
  }

  /**
   * The locate button. With the map moved away from the person it brings them
   * back to the centre; otherwise it switches locating on or off.
   */
  function pressLocate(): void {
    if (locator.on && !locator.following) {
      locator.follow();
      showLocate();
      if (lastFix !== null) map.easeTo(lastFix.position, LOCATE_ZOOM);
      return;
    }
    toggleLocate();
  }

  locateButton.disabled = false;
  locateButton.addEventListener('click', pressLocate);
  map.onUserPan(() => {
    locator.pause();
    showLocate();
  });

  // Nothing runs while the page is in the background.
  document.addEventListener('visibilitychange', () => locator.setVisible(!document.hidden));

  // --- search and taps ----------------------------------------------------------
  const searchInput = element<HTMLInputElement>('search-input');
  const search = setupSearch(
    {
      input: searchInput,
      list: element('search-list'),
      clear: element('search-clear'),
    },
    {
      listFor: (query, browsing, forStart) =>
        listFor(
          {
            places: site.places,
            index,
            categories,
            saved: personal.saved,
            recent: personal.recent,
            routes: personal.routes,
            spots: spots.map((spot) => ({ place: spotPlace(spot), car: spot.kind === 'car' })),
            offerHere: forStart,
          },
          query,
          browsing,
        ),
      onChoose: (place) => chooseDestination(place),
      onChooseRoute: (from, to) => chooseRoute(from, to),
      onChooseStart: (place) => chooseStart(place),
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
      initial: prefs.layers,
      onChange: (layers) => {
        remember({ layers });
        restyle({ layerPrefs: layers });
      },
    },
  );
  inputs.current = { ...inputs.current, layerPrefs: initialPrefs };

  // --- legend -------------------------------------------------------------------
  const legend = setupLegend(
    { button: element<HTMLButtonElement>('legend'), panel: element('legend-panel') },
    {
      categories,
      hidden: prefs.hiddenCategories,
      onChange: (hidden) => {
        remember({ hiddenCategories: hidden });
        restyle({ hiddenCategories: hidden });
      },
    },
  );
  // --- my places ----------------------------------------------------------------
  const labelFor = (placeId: string): string => {
    const place = placesById.get(placeId);
    return place === undefined ? placeId : labelOf(place);
  };
  const myPlaces = setupMyPlaces(
    {
      dialog: element<HTMLDialogElement>('my-places'),
      close: element('my-places-close'),
      list: element('my-places-list'),
      clearRecent: element('my-places-clear-recent'),
      share: element('my-places-share'),
      code: element('my-places-code'),
      link: element('my-places-link'),
      copy: element('my-places-copy'),
      saveFile: element('my-places-save-file'),
      linkParts: element('my-places-link-parts'),
      withSpots: element('my-places-with-spots'),
      withSpotsRow: element('my-places-with-spots-row'),
      pasted: element('my-places-pasted'),
      add: element('my-places-add'),
      file: element('my-places-file'),
      status: element('my-places-status'),
    },
    {
      items: () => [
        ...personal.saved.map((id) => ({
          label: labelFor(id),
          kind: 'Saved place',
          remove: () => forget(toggleSaved(personal, id)),
        })),
        ...personal.routes.map((walk) => ({
          label: `${labelFor(walk.from)} \u2192 ${labelFor(walk.to)}`,
          kind: 'Saved route',
          remove: () => forget(toggleRoute(personal, walk)),
        })),
      ],
      recentCount: () => personal.recent.length,
      clearRecent: () => keep({ ...personal, recent: [] }),
      link: () => {
        const transfer = toTransfer(siteId, personal);
        return isEmpty(transfer) ? null : transferLink(location.origin, transfer);
      },
      file: (withSpots) => ({
        name: transferFileName(siteId),
        text: transferFile(toTransfer(siteId, personal), withSpots ? spots : []),
      }),
      spotCount: () => spots.length,
      add: (text) => {
        const incoming = readTransfer(text);
        if (incoming === null) return 'That is not a link or a file of saved places.';
        if (incoming.site !== siteId) return 'Those places belong to a different map.';
        const merge = mergeTransfer(personal, incoming, placesById.keys());
        forget(merge.personal);
        // Spots come only from a file, and only those that lie on this site are taken.
        const arrived = (incoming.spots ?? []).filter(
          (spot) => extent === null || isOnSite(spot.position, 0, extent),
        );
        const merged = mergeSpots(spots, arrived, () => crypto.randomUUID());
        if (merged.added > 0) keepSpots(merged.spots);
        return mergeMessage({ ...merge, addedSpots: merged.added });
      },
      // A phone may start the app afresh when it is returned to from another,
      // which happens in the middle of copying a link across. When the panel
      // was open the moment before, it is opened again.
      onOpenChange: (open) => {
        if (open) void store.set(panelKey, Date.now());
        else void store.delete(panelKey);
      },
    },
  );
  const panelKey = `my-places-open:${siteId}`;
  const lastOpen = await store.get(panelKey);
  if (typeof lastOpen === 'number' && Date.now() - lastOpen < REOPEN_WITHIN_MS) myPlaces.open();
  else void store.delete(panelKey);
  /** Keeps a change made from the panel, and brings the open directions in line with it. */
  function forget(next: Personal): void {
    keep(next);
    if (destination === null || isSpotId(destination.id)) return;
    panel.setSaved(isSaved(personal, destination.id));
    if (origin !== null) {
      panel.setRouteSaved(hasRoute(personal, { from: origin.id, to: destination.id }));
    }
  }
  legend.addLink({ label: 'My places', onPress: () => myPlaces.open() });
  // A link that carries saved places is offered, never taken unasked, and is
  // then removed from the address so a reload does not offer it again.
  const carried = transferFromHash(location.hash);
  if (carried !== null) {
    const link = location.href;
    history.replaceState(null, '', location.pathname + location.search);
    myPlaces.offer(link, 'This link carries saved places. Press Add to keep them here.');
  }
  legend.addLink({ label: 'Privacy', path: privacyPathFor(siteId) });
  // On a host with more than one site, the legend's foot leads to the others.
  // The list is not needed for anything else, so its absence is not an error.
  fetchJson(SITE_INDEX_PATH)
    .then((list) => {
      if ((list as SiteIndex).sites.length > 1) {
        legend.addLink({ label: 'Other locations', path: '/' });
      }
    })
    .catch(() => undefined);

  // --- my spots -----------------------------------------------------------------
  const spotsMenu = setupSpots(
    { button: element<HTMLButtonElement>('spots'), panel: element('spots-panel') },
    {
      spots: () => spots,
      roomForMore: () => !isFull(spots),
      onPark: () => markHere('car'),
      onAdd: () => markHere('spot'),
      onGo: (spot) => {
        searchInput.value = '';
        chooseDestination(spotPlace(spot));
      },
      onRename: (spot, name) => {
        keepSpots(renameSpot(spots, spot.id, name));
        const renamed = spots.find((kept) => kept.id === spot.id);
        // Directions open to it carry its name; show the new one.
        if (renamed !== undefined && destination?.id === spotPlace(spot).id) {
          chooseDestination(spotPlace(renamed));
        }
      },
      onRemove: (spot) => {
        keepSpots(removeSpot(spots, spot.id));
        if (destination?.id === spotPlace(spot).id) chooseDestination(null);
        showNotice(`Removed “${spot.name}”.`);
      },
    },
  );
  showSpots();

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
  // The spots button sits under this row, and moves up when the row is not there.
  document.body.classList.toggle('no-nearest', nearest.hidden);

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
      ...PRIVACY_FILES.map((path) => new URL(path, origin).href),
      // Asked for by the privacy page when it is opened from this site.
      new URL(`${siteBase}site.json`, origin).href,
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
