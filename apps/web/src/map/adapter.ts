// The only module that imports MapLibre. Everything the rest of the app needs
// from the map goes through MapView, so the library could be swapped behind it.
//
// A "protocol" in MapLibre is a handler for a URL scheme. Registering pmtiles://
// hands every tile request for such a URL to the pmtiles library, which turns it
// into an HTTP range request for the right bytes of the archive, so a static file
// server is all the map needs.

import {
  LngLat,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  addProtocol,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre parses tiles in a web worker, a script that runs on another thread. It
// looks for that script next to its own module, which is not where a bundler
// puts it, so the worker's bundled URL is handed over explicitly. The `?url`
// suffix asks Vite for the file's address rather than its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Position } from '../site/types';
import { clampToExtent, minZoomFor, zoomRoom, type Extent } from './extent';
import { DESTINATION_SOURCE, PLACE_LAYERS, POSITION_SOURCE, ROUTE_SOURCE } from './style';

let configured = false;

function configureOnce(): void {
  if (configured) return;
  setWorkerUrl(workerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  configured = true;
}

export interface MapViewOptions {
  readonly style: StyleSpecification;
  readonly center: Position;
  readonly zoom: number;
  /** The site's extent; the center of the map is held inside it. */
  readonly extent?: Extent;
}

/** The closest zoom MapLibre offers; the limit applied when zooming in. */
const MAX_ZOOM = 22;

export class MapView {
  private readonly map: MapLibreMap;
  /** The markers now on the map, kept so they can be taken off again. */
  private markers: Marker[] = [];
  /** The furthest out the map may zoom; follows the screen size. */
  private minZoom = 0;

  constructor(container: HTMLElement, options: MapViewOptions) {
    configureOnce();
    const { extent } = options;
    const fitMinZoom = (): void => {
      if (extent === undefined) return;
      this.minZoom = minZoomFor(extent, container.clientWidth, container.clientHeight);
    };
    fitMinZoom();
    this.map = new MapLibreMap({
      container,
      style: options.style,
      center: [options.center[0], options.center[1]],
      zoom: options.zoom,
      maxZoom: MAX_ZOOM,
      // MapLibre's own bounds limit keeps the screen inside a box, measuring the
      // screen as if the map always faced north; turned sideways it stops short
      // of the box's edges. This replaces that rule: only the center is held
      // inside the site's extent, which is the same at every rotation. MapLibre
      // runs the function on every camera change and uses what it returns.
      ...(extent
        ? {
            transformConstrain: (lngLat: LngLat, zoom: number) => {
              const [lon, lat] = clampToExtent([lngLat.lng, lngLat.lat], extent);
              return {
                center: new LngLat(lon, lat),
                zoom: Math.min(Math.max(zoom, this.minZoom), MAX_ZOOM),
              };
            },
          }
        : {}),
      // Attribution stays expanded so the OpenStreetMap credit is always visible.
      attributionControl: { compact: false },
      // Keep the map pinned to the ground on a phone: no tilt, rotation only by code.
      pitchWithRotate: false,
      maxPitch: 0,
    });
    this.map.addControl(new NavigationControl({ showCompass: true, showZoom: false }));
    // Turning the phone changes the screen's shorter side, and with it how far
    // out the site still fills the view.
    this.map.on('resize', () => {
      fitMinZoom();
      if (this.map.getZoom() < this.minZoom) this.map.setZoom(this.minZoom);
    });
  }

  /** Replace the whole style; MapLibre applies only what differs. */
  setStyle(style: StyleSpecification): void {
    this.map.setStyle(style, { diff: true });
  }

  /** Update the position marker without touching the rest of the style. */
  setPosition(data: GeoJSON.FeatureCollection): void {
    this.setData(POSITION_SOURCE, data);
  }

  setRoute(data: GeoJSON.FeatureCollection): void {
    this.setData(ROUTE_SOURCE, data);
  }

  setDestination(data: GeoJSON.FeatureCollection): void {
    this.setData(DESTINATION_SOURCE, data);
  }

  private setData(sourceId: string, data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  /** Calls back with the place id when a place's dot or label is tapped. */
  onPlaceTap(callback: (placeId: string) => void): void {
    for (const layer of PLACE_LAYERS) {
      this.map.on('click', layer, (event) => {
        const id = event.features?.[0]?.properties?.['id'];
        if (typeof id === 'string') callback(id);
      });
      this.map.on('mouseenter', layer, () => {
        this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layer, () => {
        this.map.getCanvas().style.cursor = '';
      });
    }
  }

  /** Zoom in (+1) or out (-1) by one level, about the middle of the screen. */
  zoomBy(direction: 1 | -1): void {
    this.map.easeTo({ zoom: this.map.getZoom() + direction, duration: 250 });
  }

  /**
   * Calls back, now and whenever the zoom or the screen size changes, with
   * whether the map can still zoom in and out.
   */
  onZoomRoom(callback: (room: { canZoomIn: boolean; canZoomOut: boolean }) => void): void {
    const report = (): void => callback(zoomRoom(this.map.getZoom(), this.minZoom, MAX_ZOOM));
    this.map.on('zoom', report);
    this.map.on('resize', report);
    report();
  }

  /** The map's rotation in degrees, for drawing arrows relative to the screen. */
  getBearing(): number {
    return this.map.getBearing();
  }

  onRotate(callback: () => void): void {
    this.map.on('rotate', callback);
  }

  /** Zoom and pan so every position is on screen, clear of the controls. */
  fitPositions(positions: readonly Position[], padding: number): void {
    const first = positions[0];
    if (first === undefined) return;
    let west = first[0];
    let south = first[1];
    let east = first[0];
    let north = first[1];
    for (const [lon, lat] of positions) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    this.map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding, maxZoom: 18, duration: 600 },
    );
  }

  /** Glide to a position, zooming in only if the map is zoomed out. */
  easeTo(center: Position, minZoom: number): void {
    this.map.easeTo({
      center: [center[0], center[1]],
      zoom: Math.max(this.map.getZoom(), minZoom),
      duration: 600,
    });
  }

  /** Glide to a position without changing the zoom, to keep a walker in view. */
  centerOn(center: Position): void {
    this.map.easeTo({ center: [center[0], center[1]], duration: 400 });
  }

  /** Calls back when the person starts dragging the map, not when code moves it. */
  onUserPan(callback: () => void): void {
    this.map.on('dragstart', callback);
  }

  /**
   * Shows a marker at each given point, replacing those shown before. A marker
   * is a small piece of the page pinned to a place on the map; these are for
   * looking at only, so presses pass through them to the map.
   */
  setMarkers(
    markers: readonly { readonly position: Position; readonly element: HTMLElement }[],
  ): void {
    for (const marker of this.markers) marker.remove();
    this.markers = markers.map(({ position, element }) =>
      new Marker({ element, anchor: 'bottom' })
        .setLngLat([position[0], position[1]])
        .addTo(this.map),
    );
  }

  destroy(): void {
    this.map.remove();
  }
}
