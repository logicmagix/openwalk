// The map style as a pure function of its inputs: theme, site files, position. A
// MapLibre style is a JSON document listing sources (where data comes from) and
// layers (how each is drawn, bottom to top). Rebuilding it whole whenever an
// input changes keeps every state reachable from one place, and MapLibre applies
// only the difference.

import type { Position, Route } from '@openwalk/routing';
import type { PlacesDocument } from '@openwalk/search';
import type {
  ExpressionSpecification,
  FilterSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import { FALLBACK_COLOUR, type Category } from '../categories';
import type { PositionFix } from '../position/provider';
import type { WalkwaysDocument } from '../site/types';
import type { Scheme } from '../appearance';
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
  /** The set of colours; the standard one when absent. */
  readonly scheme?: Scheme;
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
  /** The site's kinds of place; each place's dot takes its kind's colour. */
  readonly categories?: readonly Category[];
  /** Kinds of place left off the map for now. */
  readonly hiddenCategories?: readonly string[];
  /** The place chosen as the destination; it is drawn even if its kind is hidden. */
  readonly destinationId?: string | null;
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

/** The colours and weights of the app's own layers, drawn over the base map. */
interface Palette {
  readonly walkway: string;
  readonly walkwayHand: string;
  readonly placeOutline: string;
  readonly placeText: string;
  readonly placeHalo: string;
  readonly position: string;
  readonly positionStroke: string;
  readonly route: string;
  readonly routeCasing: string;
}

/** How a scheme differs from the standard one apart from its colours. */
interface Weights {
  /** The base map's own flavour, by theme. */
  readonly flavour: Readonly<Record<Theme, string>>;
  /** Walkway and route lines are this many times as wide. */
  readonly line: number;
  readonly walkwayOpacity: number;
  /** The outline of a place's dot, in pixels. */
  readonly placeStroke: number;
  /** Added to the size of place labels, in pixels. */
  readonly labelExtra: number;
  readonly labelHalo: number;
}

const WEIGHTS: Readonly<Record<Scheme, Weights>> = {
  standard: {
    flavour: { light: 'light', dark: 'dark' },
    line: 1,
    walkwayOpacity: 0.8,
    placeStroke: 1.5,
    labelExtra: 0,
    labelHalo: 1.5,
  },
  // Plain white or black ground, and everything of the app's own drawn heavier.
  contrast: {
    flavour: { light: 'white', dark: 'black' },
    line: 1.5,
    walkwayOpacity: 1,
    placeStroke: 2.5,
    labelExtra: 1.5,
    labelHalo: 2.5,
  },
  // A grey ground that asks for less attention than what is drawn on it.
  muted: {
    flavour: { light: 'grayscale', dark: 'black' },
    line: 1,
    walkwayOpacity: 0.7,
    placeStroke: 1.5,
    labelExtra: 0,
    labelHalo: 1.5,
  },
};

const STANDARD: Readonly<Record<Theme, Palette>> = {
  light: {
    walkway: '#2b6cb0',
    walkwayHand: '#b7791f',
    placeOutline: '#1a202c',
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
    placeOutline: '#f7fafc',
    placeText: '#f7fafc',
    placeHalo: '#1a202c',
    position: '#8ab4f8',
    positionStroke: '#202124',
    route: '#c4b5fd',
    routeCasing: '#202124',
  },
};

const COLOURS: Readonly<Record<Scheme, Readonly<Record<Theme, Palette>>>> = {
  standard: STANDARD,
  contrast: {
    light: {
      walkway: '#0b3d91',
      walkwayHand: '#7a4100',
      placeOutline: '#000000',
      placeText: '#000000',
      placeHalo: '#ffffff',
      position: '#0b57d0',
      positionStroke: '#ffffff',
      route: '#5b21b6',
      routeCasing: '#ffffff',
    },
    dark: {
      walkway: '#cfe9ff',
      walkwayHand: '#ffe873',
      placeOutline: '#ffffff',
      placeText: '#ffffff',
      placeHalo: '#000000',
      position: '#a8c7fa',
      positionStroke: '#000000',
      // Pink, not the pale violet of the standard dark scheme, which is too
      // close to the pale blue of the walkways when both are drawn this strongly.
      route: '#ff8ad8',
      routeCasing: '#000000',
    },
  },
  muted: {
    light: { ...STANDARD.light, walkway: '#5f7f9e', walkwayHand: '#9c8656' },
    dark: { ...STANDARD.dark, walkway: '#7f9fbd', walkwayHand: '#b3a46a' },
  },
};

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
  const scheme = inputs.scheme ?? 'standard';
  const colours = COLOURS[scheme][inputs.theme];
  const weights = WEIGHTS[scheme];
  const position = positionCollection(inputs.position ?? null);
  const walkways = asGeoJson(inputs.walkways ?? EMPTY);
  const places = withIdProperty(inputs.places ?? EMPTY);
  const routeData = routeCollection(inputs.route ?? null);

  // A place's dot takes the colour of its kind. `match` is the style language's
  // switch statement: the value, then pairs of case and result, then the default.
  const categories = inputs.categories ?? [];
  const fallback = FALLBACK_COLOUR[inputs.theme];
  // The spec types a `match` as a tuple of fixed shape, which a list built from
  // data cannot satisfy, hence the cast.
  const placeColour: ExpressionSpecification | string =
    categories.length === 0
      ? fallback
      : ([
          'match',
          ['get', 'category'],
          ...categories.flatMap((category) => [category.id, category.colour[inputs.theme]]),
          fallback,
        ] as unknown as ExpressionSpecification);
  // Places of a hidden kind are left out of both the dots and the labels, except
  // the place someone has chosen to go to: hiding a kind thins out the map, it
  // does not take a destination off it.
  const hidden = inputs.hiddenCategories ?? [];
  const shownKind: FilterSpecification = [
    '!',
    ['in', ['get', 'category'], ['literal', [...hidden]]],
  ];
  const placeFilter: FilterSpecification =
    inputs.destinationId == null
      ? shownKind
      : ['any', shownKind, ['==', ['get', 'id'], inputs.destinationId]];
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
      ...basemapLayers(BASEMAP_SOURCE, namedFlavor(weights.flavour[inputs.theme]), {
        lang: inputs.lang,
      }),
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
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            1 * weights.line,
            17,
            2.5 * weights.line,
            20,
            5 * weights.line,
          ],
          'line-opacity': weights.walkwayOpacity,
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
        paint: {
          'line-color': colours.routeCasing,
          'line-width': 9 * weights.line,
          'line-opacity': 0.9,
        },
      },
      {
        id: 'route-path',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': colours.route, 'line-width': 5 * weights.line },
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
        // A soft glow so the chosen place is unmistakable even before a route or
        // a position is on the map.
        id: 'destination-glow',
        type: 'circle',
        source: DESTINATION_SOURCE,
        paint: {
          'circle-radius': 24,
          'circle-color': colours.route,
          'circle-opacity': 0.22,
        },
      },
      {
        // A bold, white-edged marker at its centre.
        id: 'destination-mark',
        type: 'circle',
        source: DESTINATION_SOURCE,
        paint: {
          'circle-radius': 9,
          'circle-color': colours.route,
          'circle-stroke-color': colours.routeCasing,
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
        filter: placeFilter,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3.5, 18, 7],
          'circle-color': placeColour,
          // The outline contrasts with the map in each theme, so a dot is seen
          // whatever its fill and whatever it lies on.
          'circle-stroke-color': colours.placeOutline,
          'circle-stroke-width': weights.placeStroke,
        },
      },
      {
        id: 'places-label',
        type: 'symbol',
        source: PLACES_SOURCE,
        filter: placeFilter,
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
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            11 + weights.labelExtra,
            18,
            14 + weights.labelExtra,
          ],
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: {
          'text-color': colours.placeText,
          'text-halo-color': colours.placeHalo,
          'text-halo-width': weights.labelHalo,
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
