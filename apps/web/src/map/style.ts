// The map style as a pure function of its inputs: theme, site files, position. A
// MapLibre style is a JSON document listing sources (where data comes from) and
// layers (how each is drawn, bottom to top). Rebuilding it whole whenever an
// input changes keeps every state reachable from one place, and MapLibre applies
// only the difference.

import type { Position, Route } from '@openwalk/routing';
import type { PlacesDocument } from '@openwalk/search';
import type { SourceSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import type { PositionFix } from '../position/provider';
import type { WalkwaysDocument } from '../site/types';
import type { Theme } from '../theme';
import { circlePolygon } from './circle';

/** A georeferenced image, resolved to a same-origin URL, ready to draw. */
export interface OverlaySpec {
  readonly id: string;
  readonly name: string;
  /** Absolute, same-origin URL of the image file. */
  readonly imageUrl: string;
  /** Top-left, top-right, bottom-right, bottom-left corners. */
  readonly corners: readonly Position[];
  readonly attribution?: string;
}

/** Which optional layers are drawn. Overlays off, walkways and labels on by default. */
export interface LayerPrefs {
  /** Ids of the overlays currently shown; none by default. */
  readonly overlays?: readonly string[];
  readonly walkways?: boolean;
  readonly labels?: boolean;
}

export interface StyleInputs {
  readonly theme: Theme;
  /** URL of the site's basemap.pmtiles. */
  readonly basemapUrl: string;
  /** Where the glyphs and sprites the base map needs are served from. */
  readonly assetsBase: string;
  /** Two-letter language for base map labels. */
  readonly lang: string;
  /** The site's own attribution line, shown beside the base map's. */
  readonly attribution?: string;
  readonly walkways?: WalkwaysDocument | null;
  readonly places?: PlacesDocument | null;
  /** The site's georeferenced images; those in layerPrefs.overlays are drawn. */
  readonly overlays?: readonly OverlaySpec[];
  readonly layerPrefs?: LayerPrefs;
  readonly position?: PositionFix | null;
  readonly route?: Route | null;
  /** The chosen destination, ringed on the map. */
  readonly destination?: Position | null;
}

/** Layer and source ids the app refers to. */
export const BASEMAP_SOURCE = 'basemap';
export const WALKWAYS_SOURCE = 'walkways';
export const PLACES_SOURCE = 'places';
export const POSITION_SOURCE = 'position';
export const ROUTE_SOURCE = 'route';
export const DESTINATION_SOURCE = 'destination';
/** The source and layer that draw one overlay image. */
export function overlaySourceId(id: string): string {
  return `overlay-${id}`;
}
export function overlayLayerId(id: string): string {
  return `overlay-${id}-raster`;
}
/** Layers a tap on selects a place; the feature's `id` property is the place id. */
export const PLACE_LAYERS = ['places-dot', 'places-label'] as const;

const COLOURS = {
  light: {
    walkway: '#2b6cb0',
    walkwayHand: '#b7791f',
    place: '#c53030',
    placeText: '#1a202c',
    placeHalo: '#ffffff',
    position: '#1a73e8',
    positionStroke: '#ffffff',
    route: '#7c3aed',
    routeCasing: '#ffffff',
  },
  dark: {
    walkway: '#90cdf4',
    walkwayHand: '#f6e05e',
    place: '#fc8181',
    placeText: '#f7fafc',
    placeHalo: '#1a202c',
    position: '#8ab4f8',
    positionStroke: '#202124',
    route: '#c4b5fd',
    routeCasing: '#202124',
  },
} as const;

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/**
 * MapLibre's layout.visibility must be exactly 'visible' or 'none'; it rejects a
 * key present with value undefined, so a shown layer is spelled 'visible', not left
 * out.
 */
function visibility(shown: boolean): 'visible' | 'none' {
  return shown ? 'visible' : 'none';
}

export function buildStyle(inputs: StyleInputs): StyleSpecification {
  const colours = COLOURS[inputs.theme];
  const position = positionCollection(inputs.position ?? null);
  const walkways = asGeoJson(inputs.walkways ?? EMPTY);
  const places = withIdProperty(inputs.places ?? EMPTY);
  const routeData = routeCollection(inputs.route ?? null);
  const destination = destinationCollection(inputs.destination ?? null);

  // Optional layers: overlays off, walkways and labels on, unless told otherwise.
  const prefs = inputs.layerPrefs;
  const showWalkways = prefs?.walkways ?? true;
  const showLabels = prefs?.labels ?? true;
  const shownOverlayIds = prefs?.overlays ?? [];
  const shownOverlays = (inputs.overlays ?? []).filter((o) => shownOverlayIds.includes(o.id));

  // Each shown overlay is an image source positioned by its four corners, drawn as
  // a raster layer just above the base map. The site data and position stay on top.
  // An image source carries only a url and its four corners; the style spec has no
  // place for attribution on it, so an overlay's credit is shown by the layers
  // control instead, beside the switch that turns the overlay on.
  const overlaySources: Record<string, SourceSpecification> = {};
  for (const overlay of shownOverlays) {
    overlaySources[overlaySourceId(overlay.id)] = {
      type: 'image',
      url: overlay.imageUrl,
      coordinates: overlay.corners.map((corner) => [corner[0], corner[1]]) as [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ],
    };
  }
  const overlayLayers = shownOverlays.map((overlay) => ({
    id: overlayLayerId(overlay.id),
    type: 'raster' as const,
    source: overlaySourceId(overlay.id),
    // Kept a touch transparent so the base map is never fully hidden beneath it.
    paint: { 'raster-opacity': 0.9 },
  }));

  return {
    version: 8,
    // {fontstack} and {range} are placeholders MapLibre fills in per request.
    glyphs: `${inputs.assetsBase}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${inputs.assetsBase}/sprites/${inputs.theme}`,
    sources: {
      // The pmtiles:// scheme is handled by the protocol the adapter registers; the
      // archive's own metadata supplies its attribution.
      [BASEMAP_SOURCE]: {
        type: 'vector',
        url: `pmtiles://${inputs.basemapUrl}`,
        ...(inputs.attribution ? { attribution: inputs.attribution } : {}),
      },
      [WALKWAYS_SOURCE]: { type: 'geojson', data: walkways },
      [PLACES_SOURCE]: { type: 'geojson', data: places },
      [POSITION_SOURCE]: { type: 'geojson', data: position },
      [ROUTE_SOURCE]: { type: 'geojson', data: routeData },
      [DESTINATION_SOURCE]: { type: 'geojson', data: destination },
      ...overlaySources,
    },
    layers: [
      ...basemapLayers(BASEMAP_SOURCE, namedFlavor(inputs.theme), { lang: inputs.lang }),
      ...overlayLayers,
      {
        id: 'walkways-line',
        type: 'line',
        source: WALKWAYS_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visibility(showWalkways) },
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'source'], 'hand'],
            colours.walkwayHand,
            colours.walkway,
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 17, 2.5, 20, 5],
          'line-opacity': 0.8,
        },
      },
      {
        id: 'walkways-area',
        type: 'line',
        source: WALKWAYS_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        layout: { visibility: visibility(showWalkways) },
        paint: { 'line-color': colours.walkway, 'line-width': 1, 'line-opacity': 0.6 },
      },
      {
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colours.routeCasing, 'line-width': 9, 'line-opacity': 0.9 },
      },
      {
        id: 'route-path',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colours.route, 'line-width': 5 },
      },
      {
        // The walk to and from the network, where no path is mapped: dashed.
        id: 'route-offpath',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['!=', ['get', 'kind'], 'path'],
        paint: { 'line-color': colours.route, 'line-width': 4, 'line-dasharray': [1, 2] },
      },
      {
        id: 'destination-ring',
        type: 'circle',
        source: DESTINATION_SOURCE,
        paint: {
          'circle-radius': 14,
          'circle-color': colours.route,
          'circle-opacity': 0.25,
          'circle-stroke-color': colours.route,
          'circle-stroke-width': 3,
        },
      },
      {
        id: 'position-accuracy',
        type: 'fill',
        source: POSITION_SOURCE,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': colours.position, 'fill-opacity': 0.15 },
      },
      {
        id: 'places-dot',
        type: 'circle',
        source: PLACES_SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 6],
          'circle-color': colours.place,
          'circle-stroke-color': colours.placeHalo,
          'circle-stroke-width': 1.5,
        },
      },
      {
        id: 'places-label',
        type: 'symbol',
        source: PLACES_SOURCE,
        minzoom: 15,
        layout: {
          visibility: visibility(showLabels),
          'text-field': [
            'case',
            ['has', 'number'],
            ['concat', ['get', 'number'], '  ', ['get', 'name']],
            ['get', 'name'],
          ],
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 18, 14],
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: {
          'text-color': colours.placeText,
          'text-halo-color': colours.placeHalo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'position-dot',
        type: 'circle',
        source: POSITION_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': colours.position,
          'circle-stroke-color': colours.positionStroke,
          'circle-stroke-width': 2.5,
        },
      },
    ],
  };
}

/** The site's read-only documents are plain GeoJSON; this only tells the types so. */
function asGeoJson(document: object): GeoJSON.FeatureCollection {
  return document as unknown as GeoJSON.FeatureCollection;
}

/** Places with their id copied into the properties, where a tap can read it. */
function withIdProperty(places: PlacesDocument | typeof EMPTY): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: places.features.map((feature) => ({
      ...(feature as unknown as GeoJSON.Feature),
      properties: { ...feature.properties, id: feature.id },
    })),
  };
}

/** The route's three legs as lines tagged approach, path and departure. */
export function routeCollection(found: Route | null): GeoJSON.FeatureCollection {
  if (found === null) return { type: 'FeatureCollection', features: [] };
  const legs: [string, readonly Position[]][] = [
    ['approach', found.approach],
    ['path', found.path],
    ['departure', found.departure],
  ];
  return {
    type: 'FeatureCollection',
    features: legs
      .filter(([, positions]) => positions.length >= 2)
      .map(([kind, positions]) => ({
        type: 'Feature',
        properties: { kind },
        geometry: { type: 'LineString', coordinates: positions.map((p) => [p[0], p[1]]) },
      })),
  };
}

export function destinationCollection(position: Position | null): GeoJSON.FeatureCollection {
  if (position === null) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [position[0], position[1]] },
      },
    ],
  };
}

/** The position marker and its accuracy ring as GeoJSON, empty when unknown. */
export function positionCollection(fix: PositionFix | null): GeoJSON.FeatureCollection {
  if (fix === null) return { type: 'FeatureCollection', features: [] };
  const center: [number, number] = [fix.position[0], fix.position[1]];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [circlePolygon(fix.position, fix.accuracyM).map((p) => [p[0], p[1]])],
        },
      },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: center } },
    ],
  };
}
