// Light or dark (R4). The page's colors and the map's style both switch on it.
// It follows the device unless the person chose one in Settings.

import {
  APPEARANCE_KEY,
  SCHEME_ATTRIBUTE,
  SCHEME_KEY,
  THEME_ATTRIBUTE,
  attributeFor,
  readAppearance,
  readScheme,
  themeOf,
  type Appearance,
  type Scheme,
} from './appearance';

export type Theme = 'light' | 'dark';

export function themeFor(prefersDark: boolean): Theme {
  return prefersDark ? 'dark' : 'light';
}

export interface ThemeControl {
  /** The theme in force now. */
  readonly theme: Theme;
  /** What the person chose: one theme, or to follow the device. */
  readonly appearance: Appearance;
  /** Changes the choice, keeps it for next time, and applies it at once. */
  choose(appearance: Appearance): void;
  /** The set of colors in use. */
  readonly scheme: Scheme;
  chooseScheme(scheme: Scheme): void;
}

function keptScheme(): Scheme {
  try {
    return readScheme(localStorage.getItem(SCHEME_KEY));
  } catch {
    return 'standard';
  }
}

function keptAppearance(): Appearance {
  try {
    return readAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Follows the device's setting and the person's choices. `onChange` is called
 * with the theme and the scheme whenever either differs from what was in force.
 */
export function watchTheme(onChange: (theme: Theme, scheme: Scheme) => void): ThemeControl {
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  let appearance = keptAppearance();
  let theme = themeOf(appearance, device.matches);
  let scheme = keptScheme();

  function apply(): void {
    // The stylesheet reads this attribute; without it the page follows the device.
    const fixed = attributeFor(appearance);
    if (fixed === null) document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    else document.documentElement.setAttribute(THEME_ATTRIBUTE, fixed);
    const next = themeOf(appearance, device.matches);
    if (next !== theme) {
      theme = next;
      onChange(theme, scheme);
    }
  }

  function applyScheme(): void {
    // Absent for the standard scheme, so the stylesheet's own colors stand.
    if (scheme === 'standard') document.documentElement.removeAttribute(SCHEME_ATTRIBUTE);
    else document.documentElement.setAttribute(SCHEME_ATTRIBUTE, scheme);
  }

  device.addEventListener('change', apply);
  apply();
  applyScheme();

  return {
    get theme() {
      return theme;
    },
    get appearance() {
      return appearance;
    },
    choose(next) {
      appearance = next;
      try {
        if (next === 'system') localStorage.removeItem(APPEARANCE_KEY);
        else localStorage.setItem(APPEARANCE_KEY, next);
      } catch {
        // Storage refused: the choice holds until the page is closed.
      }
      apply();
    },
    get scheme() {
      return scheme;
    },
    chooseScheme(next) {
      if (next === scheme) return;
      scheme = next;
      try {
        if (next === 'standard') localStorage.removeItem(SCHEME_KEY);
        else localStorage.setItem(SCHEME_KEY, next);
      } catch {
        // Storage refused: the choice holds until the page is closed.
      }
      applyScheme();
      onChange(theme, scheme);
    },
  };
}
