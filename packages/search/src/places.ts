// The shape of places.geojson, mirroring packages/schema/schemas/places.schema.json.

/** A longitude and latitude pair in degrees, in GeoJSON order. */
export type Position = readonly [lon: number, lat: number];

export interface PlaceProperties {
  readonly name: string;
  /** The number the site's own signage uses, if any. */
  readonly number?: string;
  readonly category: string;
  /** A short note shown beside the name. */
  readonly annotation?: string;
  /** Plain words a visitor might search for that are not in the name. */
  readonly keywords: readonly string[];
  readonly osm_id?: string;
  readonly verified: boolean;
}

export interface PlaceFeature {
  readonly type: 'Feature';
  readonly id: string;
  readonly geometry: { readonly type: 'Point'; readonly coordinates: Position };
  readonly properties: PlaceProperties;
}

export interface PlacesDocument {
  readonly type: 'FeatureCollection';
  readonly features: readonly PlaceFeature[];
}
