// Pure helpers that do not touch the DOM live here so they can be unit tested
// in Node without a browser environment.

export const APP_NAME = 'OpenWalk';

/** The text shown on the placeholder page while the map does not exist yet. */
export function placeholderStatus(): string {
  return `${APP_NAME} placeholder page.`;
}
