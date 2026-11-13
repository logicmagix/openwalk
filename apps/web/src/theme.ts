// Light or dark (R4). The page's colours and the map's style both switch on it.
// It follows the device unless the person chose one in Settings.

import {
  APPEARANCE_KEY,
  THEME_ATTRIBUTE,
  attributeFor,
  readAppearance,
  themeOf,
  type Appearance,
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
}

function keptAppearance(): Appearance {
  try {
    return readAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Follows the device's setting and the person's choice. `onChange` is called
 * with the new theme whenever either makes it differ from the one in force.
 */
export function watchTheme(onChange: (theme: Theme) => void): ThemeControl {
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  let appearance = keptAppearance();
  let theme = themeOf(appearance, device.matches);

  function apply(): void {
    // The stylesheet reads this attribute; without it the page follows the device.
    const fixed = attributeFor(appearance);
    if (fixed === null) document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    else document.documentElement.setAttribute(THEME_ATTRIBUTE, fixed);
    const next = themeOf(appearance, device.matches);
    if (next !== theme) {
      theme = next;
      onChange(theme);
    }
  }

  device.addEventListener('change', apply);
  apply();

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
  };
}
