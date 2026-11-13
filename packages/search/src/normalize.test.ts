import { describe, expect, it } from 'vitest';
import { normalize, tokenize } from './normalize';

describe('normalize', () => {
  it('lowercases and strips accents', () => {
    expect(normalize('Café Central')).toBe('cafe central');
    expect(normalize('ÉCOLE')).toBe('ecole');
  });

  it('drops apostrophes and turns other punctuation into spaces', () => {
    expect(normalize("Reilly's Arts-Center!")).toBe('reillys arts center');
    expect(normalize('call_box')).toBe('call box');
  });

  it('collapses whitespace', () => {
    expect(normalize('  two   words \n')).toBe('two words');
  });
});

describe('tokenize', () => {
  it('splits into normalized words', () => {
    expect(tokenize('Picnic  Shelter, North')).toEqual(['picnic', 'shelter', 'north']);
  });

  it('returns no tokens for blank or punctuation-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('!?')).toEqual([]);
  });
});
