import { describe, expect, it } from 'vitest';
import { bestHeading, compassFrom, smoothHeading } from './compass';

describe('compassFrom', () => {
  it("takes an iPhone's own heading as it is", () => {
    expect(compassFrom({ alpha: 10, webkitCompassHeading: 90 }, 0)).toBe(90);
  });

  it('turns an absolute alpha, counted the other way round, into a heading', () => {
    expect(compassFrom({ alpha: 0, absolute: true }, 0)).toBe(0);
    expect(compassFrom({ alpha: 90, absolute: true }, 0)).toBe(270);
    expect(compassFrom({ alpha: 270, absolute: true }, 0)).toBe(90);
  });

  it('allows for the screen being turned', () => {
    expect(compassFrom({ alpha: 270, absolute: true }, 90)).toBe(180);
    expect(compassFrom({ alpha: null, webkitCompassHeading: 350 }, 90)).toBe(80);
  });

  it('has nothing to say about a reading not measured from north, or an empty one', () => {
    expect(compassFrom({ alpha: 90, absolute: false }, 0)).toBeNull();
    expect(compassFrom({ alpha: 90 }, 0)).toBeNull();
    expect(compassFrom({ alpha: null, absolute: true }, 0)).toBeNull();
  });
});

describe('smoothHeading', () => {
  it('starts at the first reading', () => {
    expect(smoothHeading(null, 123)).toBe(123);
  });

  it('moves part of the way to a new reading', () => {
    expect(smoothHeading(100, 120, 0.5)).toBe(110);
  });

  it('goes the short way round through north', () => {
    expect(smoothHeading(350, 10, 0.5)).toBe(0);
    expect(smoothHeading(10, 350, 0.5)).toBe(0);
    expect(smoothHeading(355, 15, 0.25)).toBe(0);
  });

  it('settles on a steady reading', () => {
    let heading: number | null = null;
    for (let i = 0; i < 40; i += 1) heading = smoothHeading(heading, i === 0 ? 0 : 90);
    expect(heading).toBeCloseTo(90, 3);
  });
});

describe('bestHeading', () => {
  it('prefers the compass, and falls back to the direction of travel', () => {
    expect(bestHeading(45, 200)).toBe(45);
    expect(bestHeading(null, 200)).toBe(200);
    expect(bestHeading(0, 200)).toBe(0);
    expect(bestHeading(null, null)).toBeNull();
  });
});
