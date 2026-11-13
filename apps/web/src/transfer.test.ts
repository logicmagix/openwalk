import { describe, expect, it } from 'vitest';
import { NOTHING_KEPT, type Personal } from './personal';
import {
  isEmpty,
  mergeMessage,
  mergeTransfer,
  readTransfer,
  toTransfer,
  transferCode,
  transferFile,
  transferFileName,
  transferFromHash,
  transferLink,
} from './transfer';

const personal: Personal = {
  saved: ['library', 'gym'],
  routes: [{ from: 'lot-1', to: 'library' }],
  recent: ['cafe'],
};
const transfer = toTransfer('campus', personal);
const places = ['library', 'gym', 'lot-1', 'cafe'];

describe('what travels', () => {
  it('is the saved places and walks, and never the recent places', () => {
    expect(transfer).toEqual({
      site: 'campus',
      saved: ['library', 'gym'],
      routes: [{ from: 'lot-1', to: 'library' }],
    });
    expect(transferFile(transfer)).not.toContain('cafe');
  });

  it('says when there is nothing to send', () => {
    expect(isEmpty(toTransfer('campus', NOTHING_KEPT))).toBe(true);
    expect(isEmpty(transfer)).toBe(false);
  });
});

describe('a link', () => {
  const link = transferLink('https://maps.example', transfer);

  it("opens the site's map and carries the data after the #", () => {
    expect(link.startsWith('https://maps.example/s/campus/#places=')).toBe(true);
    // Only characters that survive any messaging app.
    expect(link.split('#places=')[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reads back as it was sent, whole or as the code alone', () => {
    expect(readTransfer(link)).toEqual(transfer);
    expect(readTransfer(`  ${link}\n`)).toEqual(transfer);
    expect(readTransfer(transferCode(transfer))).toEqual(transfer);
    expect(transferFromHash(new URL(link).hash)).toEqual(transfer);
  });

  it('is not seen in an address that carries none', () => {
    expect(transferFromHash('')).toBeNull();
    expect(transferFromHash('#17/29.1/-82.1')).toBeNull();
  });
});

describe('a file', () => {
  it('reads back as it was sent, and is named for its site', () => {
    expect(readTransfer(transferFile(transfer))).toEqual(transfer);
    expect(transferFileName('campus')).toBe('openwalk-campus-places.json');
  });
});

describe('reading what arrives', () => {
  it.each([
    ['nothing', ''],
    ['other text', 'see you at the library'],
    ['a link without the data', 'https://maps.example/s/campus/'],
    ['broken JSON', '{"v":1,'],
    ['another version', '{"v":2,"s":"campus","p":[]}'],
    ['no site', '{"v":1,"p":["library"]}'],
    ['a site that is not an id', '{"v":1,"s":"../etc","p":[]}'],
    ['a place that is not an id', '{"v":1,"s":"campus","p":["<script>"]}'],
    ['a walk of three places', '{"v":1,"s":"campus","r":[["a","b","c"]]}'],
    ['a walk that is not a pair', '{"v":1,"s":"campus","r":["a"]}'],
  ])('refuses %s', (_what, text) => {
    expect(readTransfer(text)).toBeNull();
  });

  it('refuses far more text than a list of places could be', () => {
    expect(readTransfer(`{"v":1,"s":"campus","p":[${'"a",'.repeat(6000)}"a"]}`)).toBeNull();
  });

  it('keeps a repeated place or walk once', () => {
    const read = readTransfer('{"v":1,"s":"campus","p":["gym","gym"],"r":[["a","b"],["a","b"]]}');
    expect(read).toEqual({ site: 'campus', saved: ['gym'], routes: [{ from: 'a', to: 'b' }] });
  });
});

describe('adding what arrived', () => {
  it('adds to what is held and removes nothing', () => {
    const held: Personal = { saved: ['cafe'], routes: [], recent: ['gym'] };
    const merge = mergeTransfer(held, transfer, places);
    expect(merge.personal.saved).toEqual(['cafe', 'library', 'gym']);
    expect(merge.personal.routes).toEqual([{ from: 'lot-1', to: 'library' }]);
    expect(merge.personal.recent).toEqual(['gym']);
    expect([merge.addedPlaces, merge.addedRoutes, merge.unknown]).toEqual([2, 1, 0]);
  });

  it('adds nothing twice', () => {
    const once = mergeTransfer(NOTHING_KEPT, transfer, places).personal;
    const again = mergeTransfer(once, transfer, places);
    expect(again.personal).toEqual(once);
    expect([again.addedPlaces, again.addedRoutes]).toEqual([0, 0]);
  });

  it('leaves out what the site does not have, and counts it', () => {
    const merge = mergeTransfer(NOTHING_KEPT, transfer, ['gym', 'lot-1']);
    expect(merge.personal.saved).toEqual(['gym']);
    expect(merge.personal.routes).toEqual([]);
    expect(merge.unknown).toBe(2);
  });
});

describe('mergeMessage', () => {
  const merge = (addedPlaces: number, addedRoutes: number, unknown = 0) =>
    mergeMessage({ personal: NOTHING_KEPT, addedPlaces, addedRoutes, unknown });

  it('says what was added', () => {
    expect(merge(2, 1)).toBe('Added 2 places and 1 route.');
    expect(merge(1, 0)).toBe('Added 1 place.');
    expect(merge(0, 3)).toBe('Added 3 routes.');
  });

  it('says when nothing was new, and when something was left out', () => {
    expect(merge(0, 0)).toBe('Nothing new: you already have these.');
    expect(merge(1, 0, 1)).toContain('1 was left out');
    expect(merge(1, 0, 2)).toContain('2 were left out');
  });
});

describe('spots in a file', () => {
  const spots = [
    { id: 'a', kind: 'car' as const, name: 'My car', position: [-82.13, 29.19] as const },
    { id: 'b', kind: 'spot' as const, name: 'Big bass', position: [-82.14, 29.2] as const },
  ];

  it('are written only when given, and read back as points and names', () => {
    expect(transferFile(transfer)).not.toContain('"x"');
    const read = readTransfer(transferFile(transfer, spots));
    expect(read?.saved).toEqual(transfer.saved);
    expect(read?.spots?.map(({ kind, name, position }) => ({ kind, name, position }))).toEqual(
      spots.map(({ kind, name, position }) => ({ kind, name, position })),
    );
  });

  it('are never put in a link, and are ignored if a link carries them', () => {
    expect(transferLink('https://maps.example', { ...transfer, spots })).toBe(
      transferLink('https://maps.example', transfer),
    );
    const forged = btoa(
      JSON.stringify({ v: 1, s: 'campus', p: [], x: [{ k: 'spot', n: 'Here', c: [1, 2] }] }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(readTransfer(forged)?.site).toBe('campus');
    expect(readTransfer(forged)?.spots).toBeUndefined();
    expect(readTransfer(`https://maps.example/s/campus/#places=${forged}`)?.spots).toBeUndefined();
  });

  it('drop any that are malformed and keep the rest', () => {
    const text = JSON.stringify({
      v: 1,
      s: 'campus',
      x: [{ k: 'spot', n: 'Fine', c: [1, 2] }, { k: 'spot', n: 'No point' }, 'nonsense'],
    });
    expect(readTransfer(text)?.spots?.map((spot) => spot.name)).toEqual(['Fine']);
  });

  it('are counted in what the person is told', () => {
    const told = mergeMessage({
      personal: NOTHING_KEPT,
      addedPlaces: 1,
      addedRoutes: 1,
      addedSpots: 2,
      unknown: 0,
    });
    expect(told).toBe('Added 1 place, 1 route and 2 spots.');
  });
});
