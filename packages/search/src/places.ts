// The shape of places.geojson, mirroring packages/schema/schemas/places.schema.json.

/** A longitude and latitude pair in degrees, in GeoJSON order. */
export type Position = readonly [lon: number, lat: number];

/** Something a visitor can find inside a place, searchable by its own name. */
export interface PlaceService {
  readonly name: string;
  /** A short note shown beside the name, such as the floor or the room. */
  readonly note?: string;
  /** Plain words a visitor might search for that are not in the name. */
  readonly keywords: readonly string[];
}

export interface PlaceProperties {
  readonly name: string;
  /** The number the site's own signage uses, if any. */
  readonly number?: string;
  readonly category: string;
  /** A short note shown beside the name. */
  readonly annotation?: string;
  /** Plain words a visitor might search for that are not in the name. */
  readonly keywords: readonly string[];
  /** What a visitor can find inside the place. */
  readonly services?: readonly PlaceService[];
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
