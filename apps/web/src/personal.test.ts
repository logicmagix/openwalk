import { describe, expect, it } from 'vitest';
import {
  NOTHING_KEPT,
  RECENT_KEPT,
  hasRoute,
  isSaved,
  keptPersonal,
  personalKey,
  readPersonal,
  toggleRoute,
  toggleSaved,
  withRecent,
} from './personal';

const places = ['library', 'gym', 'lot-1', 'lot-2'];

describe('readPersonal', () => {
  it('starts empty when nothing was kept', () => {
    expect(readPersonal(undefined, places)).toEqual(NOTHING_KEPT);
    expect(readPersonal('nonsense', places)).toEqual(NOTHING_KEPT);
  });

  it('gives back what was kept', () => {
    const personal = {
      saved: ['gym', 'library'],
      routes: [{ from: 'lot-1', to: 'gym' }],
      recent: ['lot-1', 'gym'],
    };
    expect(readPersonal(keptPersonal(personal), places)).toEqual(personal);
  });

  it('drops places the site no longer has, and repeats', () => {
    const kept = { saved: ['gone', 'gym', 'gym'], recent: ['lot-1', 'gone'] };
    expect(readPersonal(kept, places)).toEqual({ saved: ['gym'], routes: [], recent: ['lot-1'] });
  });

  it('ignores anything of the wrong shape', () => {
    expect(readPersonal({ saved: 'gym', recent: { a: 1 } }, places)).toEqual(NOTHING_KEPT);
  });
});

describe('toggleSaved', () => {
  it('saves a place, then forgets it', () => {
    const once = toggleSaved(NOTHING_KEPT, 'gym');
    expect(isSaved(once, 'gym')).toBe(true);
    expect(isSaved(toggleSaved(once, 'gym'), 'gym')).toBe(false);
  });

  it('keeps saved places in the order they were saved', () => {
    const personal = toggleSaved(toggleSaved(NOTHING_KEPT, 'gym'), 'library');
    expect(personal.saved).toEqual(['gym', 'library']);
  });

  it('leaves the recent places alone', () => {
    const personal = toggleSaved({ saved: [], routes: [], recent: ['lot-1'] }, 'gym');
    expect(personal.recent).toEqual(['lot-1']);
  });
});

describe('withRecent', () => {
  it('puts the newest first and lists a place once', () => {
    const personal = withRecent(withRecent(withRecent(NOTHING_KEPT, 'gym'), 'library'), 'gym');
    expect(personal.recent).toEqual(['gym', 'library']);
  });

  it('keeps only the last few', () => {
    let personal = NOTHING_KEPT;
    for (let i = 0; i < RECENT_KEPT + 3; i += 1) personal = withRecent(personal, `place-${i}`);
    expect(personal.recent).toHaveLength(RECENT_KEPT);
    expect(personal.recent[0]).toBe(`place-${RECENT_KEPT + 2}`);
  });
});

describe('personalKey', () => {
  it('keeps each site apart', () => {
    expect(personalKey('park')).not.toBe(personalKey('campus'));
  });
});

describe('saved walks', () => {
  const walk = { from: 'lot-1', to: 'gym' };

  it('are saved, then forgotten, by the same pair', () => {
    const once = toggleRoute(NOTHING_KEPT, walk);
    expect(hasRoute(once, { from: 'lot-1', to: 'gym' })).toBe(true);
    expect(hasRoute(toggleRoute(once, walk), walk)).toBe(false);
  });

  it('tell one direction from the other', () => {
    const once = toggleRoute(NOTHING_KEPT, walk);
    expect(hasRoute(once, { from: 'gym', to: 'lot-1' })).toBe(false);
  });

  it('are read back only when the site still has both places, and once each', () => {
    const kept = {
      routes: [
        walk,
        walk,
        { from: 'gone', to: 'gym' },
        { from: 'gym', to: 'gone' },
        'nonsense',
        {},
      ],
    };
    expect(readPersonal(kept, places).routes).toEqual([walk]);
  });

  it('leave saved places and recent ones alone', () => {
    const personal = toggleRoute({ saved: ['gym'], routes: [], recent: ['lot-2'] }, walk);
    expect(personal.saved).toEqual(['gym']);
    expect(personal.recent).toEqual(['lot-2']);
  });
});
