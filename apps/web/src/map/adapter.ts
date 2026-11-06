// The only module that imports MapLibre. Everything the rest of the app needs
// from the map goes through MapView, so the library could be swapped behind it.
//
// A "protocol" in MapLibre is a handler for a URL scheme. Registering pmtiles://
// hands every tile request for such a URL to the pmtiles library, which turns it
// into an HTTP range request for the right bytes of the archive, so a static file
// server is all the map needs.

import {
  Map as MapLibreMap,
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
import { POSITION_SOURCE } from './style';

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
}

export class MapView {
  private readonly map: MapLibreMap;

  constructor(container: HTMLElement, options: MapViewOptions) {
    configureOnce();
    this.map = new MapLibreMap({
      container,
      style: options.style,
      center: [options.center[0], options.center[1]],
      zoom: options.zoom,
      // Attribution stays expanded so the OpenStreetMap credit is always visible.
      attributionControl: { compact: false },
      // Keep the map pinned to the ground on a phone: no tilt, rotation only by code.
      pitchWithRotate: false,
      maxPitch: 0,
    });
    this.map.addControl(new NavigationControl({ showCompass: true, showZoom: false }));
  }

  /** Replace the whole style; MapLibre applies only what differs. */
  setStyle(style: StyleSpecification): void {
    this.map.setStyle(style, { diff: true });
  }

  /** Update the position marker without touching the rest of the style. */
  setPosition(data: GeoJSON.FeatureCollection): void {
    const source = this.map.getSource(POSITION_SOURCE) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  /** Glide to a position, zooming in only if the map is zoomed out. */
  easeTo(center: Position, minZoom: number): void {
    this.map.easeTo({
      center: [center[0], center[1]],
      zoom: Math.max(this.map.getZoom(), minZoom),
      duration: 600,
    });
  }

  destroy(): void {
    this.map.remove();
  }
}
