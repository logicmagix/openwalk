import { describe, expect, it } from 'vitest';
import { normalise, tokenise } from './normalise';

describe('normalise', () => {
  it('lowercases and strips accents', () => {
    expect(normalise('Café Central')).toBe('cafe central');
    expect(normalise('ÉCOLE')).toBe('ecole');
  });

  it('drops apostrophes and turns other punctuation into spaces', () => {
    expect(normalise("Reilly's Arts-Center!")).toBe('reillys arts center');
    expect(normalise('call_box')).toBe('call box');
  });

  it('collapses whitespace', () => {
    expect(normalise('  two   words \n')).toBe('two words');
  });
});

describe('tokenise', () => {
  it('splits into normalised words', () => {
    expect(tokenise('Picnic  Shelter, North')).toEqual(['picnic', 'shelter', 'north']);
  });

  it('returns no tokens for blank or punctuation-only text', () => {
    expect(tokenise('')).toEqual([]);
    expect(tokenise('   ')).toEqual([]);
    expect(tokenise('!?')).toEqual([]);
  });
});
