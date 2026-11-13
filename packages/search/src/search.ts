// Ranking places against what someone typed. Every word of the query is scored
// against every place on its number, name, keywords, category and annotation; a
// place's score is the sum of its best match per word, scaled by how many of the
// words it matched at all. Words that match nothing anywhere ("the", "bldg") are
// ignored so filler does not drag good matches down.

import { allowedEdits, editDistance } from './fuzzy';
import { normalize, tokenize } from './normalize';
import type { PlaceFeature, PlacesDocument } from './places';

/** Where the strongest match for a result came from, for the app to show. */
export type MatchField = 'number' | 'name' | 'keyword' | 'category' | 'annotation';

export interface SearchResult {
  readonly place: PlaceFeature;
  readonly score: number;
  readonly field: MatchField;
}

interface IndexedPlace {
  readonly place: PlaceFeature;
  readonly number: string | null;
  readonly name: string;
  readonly nameTokens: readonly string[];
  readonly keywordTokens: readonly string[];
  readonly categoryTokens: readonly string[];
  readonly annotationTokens: readonly string[];
}

/** Places prepared for searching. Build once per site, search many times. */
export interface SearchIndex {
  readonly entries: readonly IndexedPlace[];
}

export function buildIndex(places: PlacesDocument): SearchIndex {
  const entries = places.features.map((place): IndexedPlace => {
    const p = place.properties;
    return {
      place,
      number: p.number === undefined ? null : normalize(p.number).replace(/ /g, ''),
      name: normalize(p.name),
      nameTokens: tokenize(p.name),
      keywordTokens: p.keywords.flatMap(tokenize),
      categoryTokens: tokenize(p.category),
      annotationTokens: p.annotation === undefined ? [] : tokenize(p.annotation),
    };
  });
  return { entries };
}

// Points per word. A field's three figures are for an exact word, a word the query
// word is the start of, and a word within typo distance. Numbers and names outrank
// keywords, which outrank the category and the annotation.
const SCORES = {
  number: { exact: 100, prefix: 30, fuzzy: 0 },
  name: { exact: 20, prefix: 12, fuzzy: 8 },
  keyword: { exact: 18, prefix: 10, fuzzy: 6 },
  category: { exact: 10, prefix: 4, fuzzy: 0 },
  annotation: { exact: 6, prefix: 3, fuzzy: 2 },
} as const;

/** Bonus when the whole query is exactly the place's name. */
const WHOLE_NAME_BONUS = 50;

const FIELD_ORDER: readonly MatchField[] = ['number', 'name', 'keyword', 'category', 'annotation'];

export interface SearchOptions {
  /** Most results to return. */
  readonly limit?: number;
}

/**
 * Places ranked by how well they match `query`, best first. Ties are broken by
 * name, then annotation, then id, so the order is stable. An empty query gives no
 * results.
 */
export function search(
  index: SearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  const limit = options.limit ?? 10;
  const words = tokenize(query);
  if (words.length === 0) return [];
  const wholeQuery = words.join(' ');

  // Score every word against every place first, so that words nobody matches can
  // be identified and left out of the coverage count.
  const table = index.entries.map((entry) => words.map((word) => scoreWord(entry, word)));
  const known = words.map((_, w) => table.some((row) => (row[w]?.score ?? 0) > 0));
  const knownCount = known.filter(Boolean).length;
  if (knownCount === 0) return [];

  const results: SearchResult[] = [];
  index.entries.forEach((entry, e) => {
    const row = table[e] ?? [];
    let total = 0;
    let matched = 0;
    let best: { score: number; field: MatchField } = { score: 0, field: 'name' };
    row.forEach((cell, w) => {
      if (!known[w] || cell.score === 0) return;
      total += cell.score;
      matched += 1;
      if (cell.score > best.score) best = cell;
    });
    if (matched === 0) return;
    if (entry.name === wholeQuery) {
      total += WHOLE_NAME_BONUS;
      best = { score: total, field: 'name' };
    }
    results.push({ place: entry.place, score: (total * matched) / knownCount, field: best.field });
  });

  results.sort(compareResults);
  return results.slice(0, limit);
}

function compareResults(a: SearchResult, b: SearchResult): number {
  if (a.score !== b.score) return b.score - a.score;
  const byName = a.place.properties.name.localeCompare(b.place.properties.name);
  if (byName !== 0) return byName;
  const byAnnotation = (a.place.properties.annotation ?? '').localeCompare(
    b.place.properties.annotation ?? '',
  );
  if (byAnnotation !== 0) return byAnnotation;
  return a.place.id.localeCompare(b.place.id);
}

/** The best single-field match of one query word against one place. */
function scoreWord(entry: IndexedPlace, word: string): { score: number; field: MatchField } {
  const candidates: Record<MatchField, number> = {
    number: scoreNumber(entry.number, word),
    name: scoreTokens(entry.nameTokens, word, SCORES.name),
    keyword: scoreTokens(entry.keywordTokens, word, SCORES.keyword),
    category: scoreTokens(entry.categoryTokens, word, SCORES.category),
    annotation: scoreTokens(entry.annotationTokens, word, SCORES.annotation),
  };
  let best: { score: number; field: MatchField } = { score: 0, field: 'name' };
  for (const field of FIELD_ORDER) {
    if (candidates[field] > best.score) best = { score: candidates[field], field };
  }
  return best;
}

function scoreNumber(number: string | null, word: string): number {
  if (number === null) return 0;
  if (word === number) return SCORES.number.exact;
  if (number.startsWith(word)) return SCORES.number.prefix;
  return 0;
}

function scoreTokens(
  tokens: readonly string[],
  word: string,
  points: { exact: number; prefix: number; fuzzy: number },
): number {
  let best = 0;
  const edits = allowedEdits(word);
  for (const token of tokens) {
    if (token === word) return points.exact;
    if (token.startsWith(word)) {
      best = Math.max(best, points.prefix);
      continue;
    }
    if (points.fuzzy === 0 || edits === 0 || best >= points.fuzzy) continue;
    // A typo in the whole word, or in a word still being typed: compare against
    // the token and against the token cut to the query word's length.
    const whole = editDistance(word, token, edits);
    const partial =
      token.length > word.length ? editDistance(word, token.slice(0, word.length), edits) : whole;
    if (Math.min(whole, partial) <= edits) best = Math.max(best, points.fuzzy);
  }
  return best;
}
