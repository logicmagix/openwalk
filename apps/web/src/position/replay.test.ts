import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackPoint } from './gpx';
import type { PositionFix } from './provider';
import { ReplayProvider, fixAt, pointTimes } from './replay';

// Three points 111 m apart heading north, two seconds between the timed ones.
const T0 = Date.parse('2026-01-01T10:00:00Z');
const TRACK: TrackPoint[] = [
  { position: [0, 0], time: T0, accuracyM: 5 },
  { position: [0, 0.001], time: T0 + 2000, accuracyM: null },
  { position: [0, 0.002], time: null, accuracyM: null },
];

describe('pointTimes', () => {
  it('uses recorded times and falls back to walking pace', () => {
    const times = pointTimes(TRACK, 1.3);
    expect(times[0]).toBe(0);
    expect(times[1]).toBe(2000);
    expect(times[2]).toBeCloseTo(2000 + (111.195 / 1.3) * 1000, -1);
  });
});

describe('fixAt', () => {
  const times = [0, 2000, 4000];

  it('interpolates between points and reports the heading', () => {
    const fix = fixAt(TRACK, times, 1000, 10, 42);
    expect(fix?.position[1]).toBeCloseTo(0.0005, 9);
    expect(fix?.heading).toBeCloseTo(0, 6);
    expect(fix?.accuracyM).toBe(5);
    expect(fix?.timestamp).toBe(42);
  });

  it('uses the default accuracy when the point carries none', () => {
    expect(fixAt(TRACK, times, 3000, 10, 0)?.accuracyM).toBe(10);
  });

  it('holds the last point after the end', () => {
    const fix = fixAt(TRACK, times, 9000, 10, 0);
    expect(fix?.position).toEqual([0, 0.002]);
    expect(fix?.heading).toBeCloseTo(0, 6);
  });

  it('returns null for an empty track', () => {
    expect(fixAt([], [], 0, 10, 0)).toBeNull();
  });
});

describe('ReplayProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers fixes on a timer at the chosen speed and stops at the end', () => {
    const provider = new ReplayProvider(TRACK.slice(0, 2), { speed: 2, intervalMs: 500 });
    const fixes: PositionFix[] = [];
    provider.start(
      (fix) => fixes.push(fix),
      () => {
        throw new Error('unexpected error');
      },
    );
    expect(provider.active).toBe(true);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.position).toEqual([0, 0]);

    vi.advanceTimersByTime(500);
    expect(fixes).toHaveLength(2);
    // Half a second at double speed is one second into a two-second leg.
    expect(fixes[1]?.position[1]).toBeCloseTo(0.0005, 9);

    vi.advanceTimersByTime(500);
    expect(fixes.at(-1)?.position).toEqual([0, 0.001]);
    expect(provider.active).toBe(false);
    expect(provider.durationMs).toBe(1000);
  });

  it('loops when asked', () => {
    const provider = new ReplayProvider(TRACK.slice(0, 2), { loop: true, intervalMs: 1000 });
    const fixes: PositionFix[] = [];
    provider.start(
      (fix) => fixes.push(fix),
      () => {},
    );
    vi.advanceTimersByTime(3000);
    expect(provider.active).toBe(true);
    expect(fixes.at(-1)?.position[1]).toBeCloseTo(0.0005, 9);
    provider.stop();
    expect(provider.active).toBe(false);
  });

  it('reports an error for an empty track', () => {
    const provider = new ReplayProvider([]);
    const errors: string[] = [];
    provider.start(
      () => {},
      (error) => errors.push(error.kind),
    );
    expect(errors).toEqual(['unavailable']);
    expect(provider.active).toBe(false);
  });
});
