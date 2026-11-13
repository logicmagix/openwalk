import { describe, expect, it } from 'vitest';
import {
  CAR_NAME,
  MAX_NAME,
  MAX_SPOTS,
  addSpot,
  carOf,
  keptSpots,
  mergeSpots,
  nextSpotName,
  parkCar,
  readSpots,
  removeSpot,
  renameSpot,
  spotsKey,
  type Spot,
} from './spots';

const here = [-82.13, 29.19] as const;
const there = [-82.14, 29.2] as const;

describe('the car', () => {
  it('is saved under its own name, first in the list', () => {
    const spots = parkCar(addSpot([], here, 'a'), there, 'car');
    expect(spots[0]).toEqual({ id: 'car', kind: 'car', name: CAR_NAME, position: there });
    expect(carOf(spots)?.id).toBe('car');
  });

  it('is moved by parking again, not doubled', () => {
    const spots = parkCar(parkCar([], here, 'first'), there, 'second');
    expect(spots).toHaveLength(1);
    expect(spots[0]?.position).toEqual(there);
  });

  it('is absent until parked', () => {
    expect(carOf(addSpot([], here, 'a'))).toBeNull();
  });
});

describe('other spots', () => {
  it('are named in turn until the person names them', () => {
    let spots: Spot[] = [];
    for (const id of ['a', 'b', 'c']) spots = addSpot(spots, here, id);
    expect(spots.map((spot) => spot.name)).toEqual(['My spot', 'My spot 2', 'My spot 3']);
  });

  it('reuse a name that has come free, and skip one the person took', () => {
    let spots = addSpot(addSpot([], here, 'a'), here, 'b');
    spots = removeSpot(spots, 'a');
    expect(nextSpotName(spots)).toBe('My spot');
    spots = renameSpot(spots, 'b', 'My spot');
    expect(nextSpotName(spots)).toBe('My spot 2');
  });

  it('can be renamed, with the name tidied and an empty one refused', () => {
    const spots = addSpot([], here, 'a');
    expect(renameSpot(spots, 'a', '  Big   bass\n here ')[0]?.name).toBe('Big bass here');
    expect(renameSpot(spots, 'a', '   ')[0]?.name).toBe('My spot');
    expect(renameSpot(spots, 'a', 'x'.repeat(200))[0]?.name).toHaveLength(MAX_NAME);
  });

  it('stop being added when the site is full', () => {
    let spots: Spot[] = [];
    for (let i = 0; i < MAX_SPOTS + 5; i += 1) spots = addSpot(spots, here, `s${i}`);
    expect(spots).toHaveLength(MAX_SPOTS);
  });

  it('can be removed', () => {
    expect(removeSpot(addSpot([], here, 'a'), 'a')).toEqual([]);
  });
});

describe('reading what was kept', () => {
  it('gives back what was saved', () => {
    const spots = parkCar(addSpot([], here, 'a'), there, 'car');
    expect(readSpots(keptSpots(spots))).toEqual(spots);
  });

  it('starts empty when nothing, or nonsense, was kept', () => {
    expect(readSpots(undefined)).toEqual([]);
    expect(readSpots({ spots: 'none' })).toEqual([]);
  });

  it('drops anything malformed and keeps the rest', () => {
    const kept = {
      spots: [
        { id: 'ok', kind: 'spot', name: 'Fine', position: [1, 2] },
        { id: 'ok', kind: 'spot', name: 'Same id again', position: [1, 2] },
        { id: 'a', kind: 'boat', name: 'Wrong kind', position: [1, 2] },
        { id: 'b', kind: 'spot', name: '  ', position: [1, 2] },
        { id: 'c', kind: 'spot', name: 'Off the earth', position: [500, 2] },
        { id: 'd', kind: 'spot', name: 'No point' },
        'nonsense',
      ],
    };
    expect(readSpots(kept).map((spot) => spot.id)).toEqual(['ok']);
  });

  it('keeps one car; a second is an ordinary spot', () => {
    const kept = {
      spots: [
        { id: 'a', kind: 'car', name: 'My car', position: [1, 2] },
        { id: 'b', kind: 'car', name: 'My car', position: [3, 4] },
      ],
    };
    expect(readSpots(kept).map((spot) => spot.kind)).toEqual(['car', 'spot']);
  });
});

describe('adding spots that arrived in a file', () => {
  const ids = () => {
    let next = 0;
    return () => `new-${(next += 1)}`;
  };

  it('adds what is new and skips what is already here', () => {
    const held = addSpot([], here, 'a');
    const incoming: Spot[] = [
      { id: 'x', kind: 'spot', name: 'My spot', position: here },
      { id: 'y', kind: 'spot', name: 'Big bass', position: there },
    ];
    const merged = mergeSpots(held, incoming, ids());
    expect(merged.added).toBe(1);
    expect(merged.spots.map((spot) => spot.name)).toEqual(['My spot', 'Big bass']);
    expect(merged.spots[1]?.id).toBe('new-1');
  });

  it('keeps the car that is here, and takes an arriving one as a spot', () => {
    const held = parkCar([], here, 'mine');
    const merged = mergeSpots(
      held,
      [{ id: 'x', kind: 'car', name: CAR_NAME, position: there }],
      ids(),
    );
    expect(merged.spots.map((spot) => spot.kind)).toEqual(['car', 'spot']);
  });
});

describe('spotsKey', () => {
  it('keeps each site apart', () => {
    expect(spotsKey('park')).not.toBe(spotsKey('campus'));
  });
});
