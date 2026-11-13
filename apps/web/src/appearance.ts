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
