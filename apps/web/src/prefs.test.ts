import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, prefsKey, readPrefs, savedPrefs, type SitePrefs } from './prefs';

const known = { overlays: ['aerial', 'trail-map'], categories: ['building', 'parking'] };

describe('readPrefs', () => {
  it('gives the defaults when nothing was kept', () => {
    expect(readPrefs(undefined, known)).toEqual(DEFAULT_PREFS);
    expect(readPrefs(null, known)).toEqual(DEFAULT_PREFS);
    expect(readPrefs('nonsense', known)).toEqual(DEFAULT_PREFS);
  });

  it('gives back what was saved', () => {
    const prefs: SitePrefs = {
      layers: { overlays: ['aerial'], walkways: false, labels: true },
      hiddenCategories: ['parking'],
    };
    expect(readPrefs(savedPrefs(prefs), known)).toEqual(prefs);
  });

  it('drops a layer or a kind the site no longer has', () => {
    const saved = {
      layers: { overlays: ['official-map', 'aerial'], walkways: true, labels: true },
      hiddenCategories: ['parking', 'gone'],
    };
    const prefs = readPrefs(saved, known);
    expect(prefs.layers.overlays).toEqual(['aerial']);
    expect(prefs.hiddenCategories).toEqual(['parking']);
  });

  it('falls back to the default for anything of the wrong shape', () => {
    const saved = {
      layers: { overlays: 'aerial', walkways: 'yes', labels: 0 },
      hiddenCategories: { parking: true },
    };
    expect(readPrefs(saved, known)).toEqual(DEFAULT_PREFS);
  });

  it('keeps a repeated id once', () => {
    const saved = { layers: { overlays: ['aerial', 'aerial'] }, hiddenCategories: [] };
    expect(readPrefs(saved, known).layers.overlays).toEqual(['aerial']);
  });
});

describe('prefsKey', () => {
  it('keeps each site apart', () => {
    expect(prefsKey('park')).not.toBe(prefsKey('campus'));
  });
});
