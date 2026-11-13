// Light or dark: following the device, or as the person chose in Settings. The
// choice is about their eyes and their screen, not about one map, so it is kept
// once for the device and applies to every site.
//
// It is kept in localStorage, the browser's simplest store, because it must be
// read before the page is drawn: public/theme.js does that with the same name
// and the same attribute, and the two must agree. The stylesheet follows the
// device unless the page carries data-theme="light" or data-theme="dark".

import type { Theme } from './theme';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_KEY = 'openwalk.appearance';
/** The attribute on the page's root element that fixes the theme. */
export const THEME_ATTRIBUTE = 'data-theme';

export const APPEARANCES: readonly { readonly value: Appearance; readonly label: string }[] = [
  { value: 'system', label: 'Follow my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * A set of colors for the map and the controls. Each is fixed and checked for
 * contrast; a person picks one, they do not mix their own.
 *   standard  the colors the app was designed in
 *   contrast  stronger lines, heavier outlines and plain black or white
 *             surfaces, for bright sun and for eyes that need more
 *   muted     a quieter base map, so the route and the places stand out
 * The kinds of place keep their colors in all three, so the legend reads the same.
 */
export type Scheme = 'standard' | 'contrast' | 'muted';

export const SCHEME_KEY = 'openwalk.scheme';
/** The attribute on the page's root element that names a scheme other than the standard. */
export const SCHEME_ATTRIBUTE = 'data-scheme';

export const SCHEMES: readonly { readonly value: Scheme; readonly label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'contrast', label: 'High contrast' },
  { value: 'muted', label: 'Muted' },
];

/** The scheme from what was kept; anything else is the standard one. */
export function readScheme(kept: string | null): Scheme {
  return kept === 'contrast' || kept === 'muted' ? kept : 'standard';
}

/**
 * The color a phone paints its status bar, and a browser its toolbar, around
 * the app: the color of the app's own surfaces, so the two read as one. It is
 * told to the browser through the page's theme-color tag. public/theme.js
 * holds the same four values, to set the tag before the page is drawn.
 */
export function barColor(theme: Theme, scheme: Scheme): string {
  if (scheme === 'contrast') return theme === 'dark' ? '#000000' : '#ffffff';
  return theme === 'dark' ? '#202124' : '#ffffff';
}

/** The choice from what was kept; anything else means following the device. */
export function readAppearance(kept: string | null): Appearance {
  return kept === 'light' || kept === 'dark' ? kept : 'system';
}

/** The theme to show for a choice, given what the device itself prefers. */
export function themeOf(appearance: Appearance, deviceIsDark: boolean): Theme {
  if (appearance === 'system') return deviceIsDark ? 'dark' : 'light';
  return appearance;
}

/** What the root element's attribute should be: absent while following the device. */
export function attributeFor(appearance: Appearance): Theme | null {
  return appearance === 'system' ? null : appearance;
}
