// The one interface through which the app learns where the phone is. Every
// implementation (real GPS, a fixed mock, a replayed trace) delivers the same
// fixes, so the rest of the app never touches navigator.geolocation.

import type { Position } from '../site/types';

export interface PositionFix {
  readonly position: Position;
  /** Radius in meters within which the true position probably lies. */
  readonly accuracyM: number;
  /** Direction of travel in degrees clockwise from north, when known. */
  readonly heading: number | null;
  /** Milliseconds since the epoch. */
  readonly timestamp: number;
}

export type PositionErrorKind = 'denied' | 'unavailable' | 'timeout';

export interface PositionError {
  readonly kind: PositionErrorKind;
}

export interface PositionProvider {
  /** Start delivering fixes. Calling it while active has no effect. */
  start(onFix: (fix: PositionFix) => void, onError: (error: PositionError) => void): void;
  stop(): void;
  readonly active: boolean;
}

/** A short explanation of a position error for the person holding the phone. */
export function positionErrorMessage(error: PositionError): string {
  switch (error.kind) {
    case 'denied':
      return 'Location access is off. Allow it for this site in your browser settings.';
    case 'unavailable':
      return 'Your position is not available right now.';
    case 'timeout':
      return 'Still waiting for a position. Try moving to open sky.';
  }
}
