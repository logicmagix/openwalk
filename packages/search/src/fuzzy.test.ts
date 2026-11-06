import { describe, expect, it } from 'vitest';
import { allowedEdits, editDistance } from './fuzzy';

describe('editDistance', () => {
  it('is zero for equal words', () => {
    expect(editDistance('tennis', 'tennis', 2)).toBe(0);
  });

  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('tenis', 'tennis', 2)).toBe(1);
    expect(editDistance('tennis', 'tenis', 2)).toBe(1);
    expect(editDistance('tennis', 'tannis', 2)).toBe(1);
    expect(editDistance('kitten', 'sitting', 3)).toBe(3);
  });

  it('counts a swap of adjacent letters as one edit', () => {
    expect(editDistance('teh', 'the', 2)).toBe(1);
    expect(editDistance('cafte', 'cafet', 2)).toBe(1);
  });

  it('stops early and reports limit plus one when the limit is exceeded', () => {
    expect(editDistance('abcdef', 'xyz', 2)).toBe(3);
    expect(editDistance('abcdef', 'abxxef', 1)).toBe(2);
  });

  it('handles empty strings', () => {
    expect(editDistance('', 'abc', 5)).toBe(3);
    expect(editDistance('abc', '', 5)).toBe(3);
  });
});

describe('allowedEdits', () => {
  it('allows no typos in short words, one in ordinary words, two in long ones', () => {
    expect(allowedEdits('the')).toBe(0);
    expect(allowedEdits('cafe')).toBe(0);
    expect(allowedEdits('tenis')).toBe(1);
    expect(allowedEdits('library')).toBe(1);
    expect(allowedEdits('cafeteria')).toBe(2);
  });
});
