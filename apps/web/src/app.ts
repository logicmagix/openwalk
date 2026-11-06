// Pure helpers that do not touch the DOM live here so they can be unit tested
// in Node without a browser environment.

export const APP_NAME = 'OpenWalk';

/** The text shown on the placeholder page while the map does not exist yet. */
export function placeholderStatus(): string {
  return `${APP_NAME} placeholder page.`;
}

/**
 * Browsers expose the Geolocation API only in a "secure context": an https://
 * page, or http://localhost. This message tells a tester which case they are in
 * before they tap the button.
 */
export function secureContextMessage(isSecure: boolean): string {
  return isSecure
    ? 'Secure context: location access is possible.'
    : 'Not a secure context: open this page over https to allow location access.';
}

/** Human-readable summary of a received position. Shows accuracy, never coordinates. */
export function positionMessage(accuracyMetres: number): string {
  return `Position received, accurate to about ${Math.round(accuracyMetres)} m.`;
}

/** Maps GeolocationPositionError.code (1, 2, 3) to a short explanation. */
export function positionErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied.';
    case 2:
      return 'Position unavailable.';
    case 3:
      return 'Timed out waiting for a position.';
    default:
      return 'Unknown location error.';
  }
}
