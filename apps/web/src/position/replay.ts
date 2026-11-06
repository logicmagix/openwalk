// Replays a recorded track as if the phone were walking it: for demos away from
// the site, and for testing directions and arrival without leaving a desk. The
// position moves smoothly between the recorded points, at the recorded pace or a
// multiple of it, and the heading is the direction between points.

import { haversineDistance, initialBearing, interpolate } from '@openwalk/routing';
import type { TrackPoint } from './gpx';
import type { PositionError, PositionFix, PositionProvider } from './provider';

export interface ReplayOptions {
  /** Multiplier on the recorded pace: 2 walks twice as fast. */
  readonly speed?: number;
  /** Start again from the beginning after the last point. */
  readonly loop?: boolean;
  /** Milliseconds between fixes. */
  readonly intervalMs?: number;
  /** Accuracy reported when the track carries none. */
  readonly accuracyM?: number;
  /** Pace assumed when the track carries no times, in metres per second. */
  readonly walkingSpeedMps?: number;
}

/** Time in milliseconds at which each point is reached, starting at zero. */
export function pointTimes(points: readonly TrackPoint[], walkingSpeedMps: number): number[] {
  const times: number[] = [];
  let elapsed = 0;
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous !== undefined) {
      if (point.time !== null && previous.time !== null && point.time >= previous.time) {
        elapsed += point.time - previous.time;
      } else {
        elapsed += (haversineDistance(previous.position, point.position) / walkingSpeedMps) * 1000;
      }
    }
    times.push(elapsed);
  });
  return times;
}

/** The fix along the track at a replay time, with the track's end held after it. */
export function fixAt(
  points: readonly TrackPoint[],
  times: readonly number[],
  elapsedMs: number,
  accuracyM: number,
  timestamp: number,
): PositionFix | null {
  const first = points[0];
  if (first === undefined) return null;
  let index = 0;
  while (index + 1 < times.length && (times[index + 1] as number) <= elapsedMs) index += 1;
  const from = points[index] as TrackPoint;
  const to = points[index + 1];
  if (to === undefined) {
    const before = points[index - 1];
    return {
      position: from.position,
      accuracyM: from.accuracyM ?? accuracyM,
      heading: before === undefined ? null : initialBearing(before.position, from.position),
      timestamp,
    };
  }
  const span = (times[index + 1] as number) - (times[index] as number);
  const t = span > 0 ? Math.min(1, (elapsedMs - (times[index] as number)) / span) : 1;
  return {
    position: interpolate(from.position, to.position, t),
    accuracyM: from.accuracyM ?? accuracyM,
    heading: initialBearing(from.position, to.position),
    timestamp,
  };
}

export class ReplayProvider implements PositionProvider {
  private readonly times: number[];
  private readonly speed: number;
  private readonly loop: boolean;
  private readonly intervalMs: number;
  private readonly accuracyM: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  constructor(
    private readonly points: readonly TrackPoint[],
    options: ReplayOptions = {},
  ) {
    this.speed = options.speed ?? 1;
    this.loop = options.loop ?? false;
    this.intervalMs = options.intervalMs ?? 1000;
    this.accuracyM = options.accuracyM ?? 10;
    this.times = pointTimes(points, options.walkingSpeedMps ?? 1.3);
  }

  get active(): boolean {
    return this.timer !== null;
  }

  /** Total replay time at the chosen speed, in milliseconds. */
  get durationMs(): number {
    return (this.times.at(-1) ?? 0) / this.speed;
  }

  start(onFix: (fix: PositionFix) => void, onError: (error: PositionError) => void): void {
    if (this.timer !== null) return;
    if (this.points.length === 0) {
      onError({ kind: 'unavailable' });
      return;
    }
    this.startedAt = Date.now();
    const tick = (): void => {
      let elapsed = (Date.now() - this.startedAt) * this.speed;
      const total = this.times.at(-1) ?? 0;
      if (this.loop && total > 0) elapsed %= total;
      const fix = fixAt(this.points, this.times, elapsed, this.accuracyM, Date.now());
      if (fix !== null) onFix(fix);
      if (!this.loop && elapsed >= total) this.stop();
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
