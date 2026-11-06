// @openwalk/search: search over a site's places by number, name, keywords, category
// and annotation, tolerant of typos. Pure functions, no I/O: the caller loads
// places.geojson and passes it in.

export { allowedEdits, editDistance } from './fuzzy';
export { normalise, tokenise } from './normalise';
export type { PlaceFeature, PlaceProperties, PlacesDocument, Position } from './places';
export {
  buildIndex,
  search,
  type MatchField,
  type SearchIndex,
  type SearchOptions,
  type SearchResult,
} from './search';
