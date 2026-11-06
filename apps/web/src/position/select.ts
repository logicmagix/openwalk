// Which position provider the page uses. The phone's GPS, unless the address asks
// for a replayed trace or a fixed position and the build allows it: those exist
// for demos and testing, and a production build ignores them.

import type { Position } from '../site/types';

export type ProviderChoice =
  | { readonly kind: 'gps' }
  | { readonly kind: 'fixed'; readonly position: Position; readonly accuracyM: number }
  | {
      readonly kind: 'replay';
      readonly trace: string;
      readonly speed: number;
      readonly loop: boolean;
    };

const TRACE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Replay and fixed positions are on in development, and in builds that opt in. */
export function replayAllowed(env: {
  readonly DEV: boolean;
  readonly VITE_ENABLE_REPLAY?: string;
}): boolean {
  return env.DEV || env.VITE_ENABLE_REPLAY === 'true';
}

/**
 * Reads `?replay=<trace>&speed=<n>&loop` or `?at=<lon>,<lat>&accuracy=<m>` from
 * the page's query string. Anything malformed, or anything at all when replay is
 * not allowed, falls back to the GPS.
 */
export function chooseProvider(search: string, allowed: boolean): ProviderChoice {
  if (!allowed) return { kind: 'gps' };
  const params = new URLSearchParams(search);

  const trace = params.get('replay');
  if (trace !== null) {
    if (!TRACE_NAME.test(trace)) return { kind: 'gps' };
    const speed = Number(params.get('speed') ?? '1');
    return {
      kind: 'replay',
      trace,
      speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
      loop: params.has('loop'),
    };
  }

  const at = params.get('at');
  if (at !== null) {
    const [lon, lat] = at.split(',').map(Number);
    if (lon === undefined || lat === undefined || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      return { kind: 'gps' };
    }
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return { kind: 'gps' };
    const accuracy = Number(params.get('accuracy') ?? '10');
    return {
      kind: 'fixed',
      position: [lon, lat],
      accuracyM: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 10,
    };
  }

  return { kind: 'gps' };
}

/** Where a site keeps its recorded traces. */
export function traceUrl(siteBase: string, trace: string): string {
  return `${siteBase}traces/${trace}.gpx`;
}
