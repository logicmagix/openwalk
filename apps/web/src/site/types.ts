// The shapes of a site's files as the pipeline writes them. These mirror the
// schemas in packages/schema/schemas/; the app trusts the files and does not
// validate them at runtime.

import type { PlacesDocument } from '@openwalk/search';

/** A longitude and latitude pair in degrees, in GeoJSON order. */
export type Position = readonly [lon: number, lat: number];

/** site.json: the site's configuration, as written by the pipeline from site.yaml. */
export interface SiteConfig {
  readonly id: string;
  readonly name: string;
  /** Where the map opens before a position is known. */
  readonly view?: { readonly center: Position; readonly zoom: number };
  readonly attribution?: string;
  readonly routing?: {
    readonly weights?: Partial<Record<string, number>>;
    readonly walking_speed?: number;
  };
}

export interface WalkwayProperties {
  readonly source: 'osm' | 'hand';
  readonly highway: string;
  readonly verified?: boolean;
  readonly name?: string;
  readonly note?: string;
  readonly service?: string;
}

export interface WalkwayFeature {
  readonly type: 'Feature';
  readonly id?: string;
  readonly geometry:
    | { readonly type: 'LineString'; readonly coordinates: readonly Position[] }
    | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly Position[])[] };
  readonly properties: WalkwayProperties;
}

export interface WalkwaysDocument {
  readonly type: 'FeatureCollection';
  readonly features: readonly WalkwayFeature[];
}

export type { PlacesDocument };

/** Everything the app loads for one site. */
export interface SiteData {
  readonly config: SiteConfig;
  readonly places: PlacesDocument;
  readonly walkways: WalkwaysDocument;
  /** URL of the site's base map archive. */
  readonly basemapUrl: string;
}
