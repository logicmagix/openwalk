// The map style as a pure function of its inputs: theme, site files, position. A
// MapLibre style is a JSON document listing sources (where data comes from) and
// layers (how each is drawn, bottom to top). Rebuilding it whole whenever an
// input changes keeps every state reachable from one place, and MapLibre applies
// only the difference.

import type { PlacesDocument } from '@openwalk/search';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import type { PositionFix } from '../position/provider';
import type { WalkwaysDocument } from '../site/types';
import type { Theme } from '../theme';
import { circlePolygon } from './circle';

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
  readonly position?: PositionFix | null;
}

/** Layer and source ids the app refers to. */
export const BASEMAP_SOURCE = 'basemap';
export const WALKWAYS_SOURCE = 'walkways';
export const PLACES_SOURCE = 'places';
export const POSITION_SOURCE = 'position';

const COLOURS = {
  light: {
    walkway: '#2b6cb0',
    walkwayHand: '#b7791f',
    place: '#c53030',
    placeText: '#1a202c',
    placeHalo: '#ffffff',
    position: '#1a73e8',
    positionStroke: '#ffffff',
  },
  dark: {
    walkway: '#90cdf4',
    walkwayHand: '#f6e05e',
    place: '#fc8181',
    placeText: '#f7fafc',
    placeHalo: '#1a202c',
    position: '#8ab4f8',
    positionStroke: '#202124',
  },
} as const;

const EMPTY = { type: 'FeatureCollection', features: [] } as const;

export function buildStyle(inputs: StyleInputs): StyleSpecification {
  const colours = COLOURS[inputs.theme];
  const position = positionCollection(inputs.position ?? null);
  const walkways = asGeoJson(inputs.walkways ?? EMPTY);
  const places = asGeoJson(inputs.places ?? EMPTY);

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
    },
    layers: [
      ...basemapLayers(BASEMAP_SOURCE, namedFlavor(inputs.theme), { lang: inputs.lang }),
      {
        id: 'walkways-line',
        type: 'line',
        source: WALKWAYS_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
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
        paint: { 'line-color': colours.walkway, 'line-width': 1, 'line-opacity': 0.6 },
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
