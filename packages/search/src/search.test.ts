import { describe, expect, it } from 'vitest';
import park from '../../../sites/tuscawilla-park/places.geojson';
import numbered from '../fixtures/numbered.places.json' with { type: 'json' };
import type { PlacesDocument } from './places';
import { buildIndex, search } from './search';

const parkIndex = buildIndex(park as unknown as PlacesDocument);
const numberedIndex = buildIndex(numbered as unknown as PlacesDocument);

const ids = (index: typeof parkIndex, query: string, limit?: number) =>
  search(index, query, limit === undefined ? {} : { limit }).map((r) => r.place.id);

describe('search by name', () => {
  it('finds an exact word', () => {
    const [top] = search(parkIndex, 'tennis');
    expect(top?.place.id).toBe('tennis-courts');
    expect(top?.field).toBe('name');
  });

  it('is case and accent insensitive', () => {
    expect(ids(parkIndex, 'REILLY')[0]).toBe('reilly-arts-center');
    expect(ids(numberedIndex, 'cafe')[0]).toBe('cafe');
    expect(ids(numberedIndex, 'CAFÉ')[0]).toBe('cafe');
  });

  it('matches the start of a word while it is being typed', () => {
    expect(ids(parkIndex, 'bask')).toEqual(['basketball-courts']);
    // A single letter also reaches the "building" category, ranked below the names.
    expect(ids(parkIndex, 'b')).toEqual([
      'baseball-field',
      'basketball-courts',
      'reilly-arts-center',
    ]);
  });

  it('tolerates a typo, scoring it below an exact match', () => {
    const exact = search(parkIndex, 'tennis')[0];
    const typo = search(parkIndex, 'tenis')[0];
    expect(typo?.place.id).toBe('tennis-courts');
    expect(typo?.score).toBeLessThan(exact?.score ?? 0);
  });

  it('tolerates a typo in a word still being typed', () => {
    expect(ids(parkIndex, 'baskte')[0]).toBe('basketball-courts');
  });

  it('ranks the whole name typed out above a partial match', () => {
    const whole = search(parkIndex, 'reilly arts center')[0];
    const partial = search(parkIndex, 'reilly arts')[0];
    expect(whole?.place.id).toBe('reilly-arts-center');
    expect(whole?.score).toBeGreaterThan(partial?.score ?? 0);
  });

  it('returns every place sharing a word', () => {
    expect(ids(parkIndex, 'courts')).toEqual(['basketball-courts', 'tennis-courts']);
  });
});

describe('search by keyword, category and annotation', () => {
  it('finds a place by a word tied to it', () => {
    for (const query of ['theatre', 'theater', 'concerts']) {
      const [top] = search(parkIndex, query);
      expect(top?.place.id).toBe('reilly-arts-center');
      expect(top?.field).toBe('keyword');
    }
    expect(ids(parkIndex, 'field')).toEqual(['baseball-field']);
  });

  it('matches a multi-word keyword word by word', () => {
    const [top] = search(numberedIndex, 'first aid');
    expect(top?.place.id).toBe('health-center');
  });

  it('finds places by category', () => {
    expect(ids(parkIndex, 'sports')).toEqual([
      'baseball-field',
      'basketball-courts',
      'tennis-courts',
    ]);
    expect(ids(numberedIndex, 'call box')).toEqual(['call-box-library']);
  });

  it('uses the annotation to tell twins apart', () => {
    expect(ids(parkIndex, 'picnic')).toEqual(['shelter-north', 'shelter-south']);
    expect(ids(parkIndex, 'south shelter')).toEqual(['shelter-south', 'shelter-north']);
    expect(search(parkIndex, 'south shelter')[0]?.score).toBeGreaterThan(
      search(parkIndex, 'south shelter')[1]?.score ?? 0,
    );
  });

  it('ranks a name match above a keyword match and that above an annotation match', () => {
    // "library" is the Library's name and appears in the call box's annotation.
    const results = search(numberedIndex, 'library');
    expect(results.map((r) => r.place.id)).toEqual(['library', 'call-box-library']);
    expect(results[1]?.field).toBe('annotation');
  });
});

describe('search by number', () => {
  it('puts the exact number first and numbers starting with it after', () => {
    expect(ids(numberedIndex, '12')).toEqual(['library', 'health-center']);
    expect(search(numberedIndex, '12')[0]?.field).toBe('number');
    // The prefix matches tie and fall back to alphabetical order by name.
    expect(ids(numberedIndex, '1')).toEqual([
      'lecture-hall',
      'health-center',
      'library',
      'workshop',
    ]);
  });

  it('ignores a filler word that matches nothing', () => {
    expect(ids(numberedIndex, 'bldg 12')).toEqual(['library', 'health-center']);
    expect(search(parkIndex, 'xyz tennis')).toEqual(search(parkIndex, 'tennis'));
  });

  it('does not fuzzy-match numbers', () => {
    expect(ids(numberedIndex, '13')).toEqual([]);
  });
});

describe('search edge cases', () => {
  it('returns nothing for an empty or unknown query', () => {
    expect(search(parkIndex, '')).toEqual([]);
    expect(search(parkIndex, '   ')).toEqual([]);
    expect(search(parkIndex, 'zzzz')).toEqual([]);
  });

  it('caps the number of results', () => {
    expect(ids(parkIndex, 's', 2)).toHaveLength(2);
    expect(ids(parkIndex, 's').length).toBeGreaterThan(2);
  });

  it('gives a stable order for equal scores', () => {
    const once = ids(parkIndex, 'shelter');
    expect(once).toEqual(['shelter-north', 'shelter-south']);
    expect(ids(parkIndex, 'shelter')).toEqual(once);
  });

  it('scores a place matching every query word above one matching some', () => {
    const results = search(numberedIndex, 'coffee study');
    expect(results.map((r) => r.place.id)).toEqual(['cafe', 'library']);
    const both = search(numberedIndex, 'books study')[0];
    expect(both?.place.id).toBe('library');
    expect(both?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });
});
