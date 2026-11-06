// The real position provider: the browser's Geolocation API. It works only in a
// secure context (https:// or http://localhost) and only while the page is in the
// foreground, which suits an app that never tracks anyone.

import type { PositionError, PositionFix, PositionProvider } from './provider';

export class GeolocationProvider implements PositionProvider {
  private watchId: number | null = null;

  get active(): boolean {
    return this.watchId !== null;
  }

  start(onFix: (fix: PositionFix) => void, onError: (error: PositionError) => void): void {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      onError({ kind: 'unavailable' });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (reading) => onFix(toFix(reading)),
      (error) => {
        // A denial ends the watch; the other errors may clear on their own.
        if (error.code === error.PERMISSION_DENIED) this.stop();
        onError({ kind: toKind(error.code) });
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
  }

  stop(): void {
    if (this.watchId === null) return;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

function toFix(reading: GeolocationPosition): PositionFix {
  const { longitude, latitude, accuracy, heading } = reading.coords;
  return {
    position: [longitude, latitude],
    accuracyM: accuracy,
    heading: heading === null || Number.isNaN(heading) ? null : heading,
    timestamp: reading.timestamp,
  };
}

function toKind(code: number): PositionError['kind'] {
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}
