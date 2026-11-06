// Light or dark, following the system setting (R4). The map style and the page
// colours both switch on it.

export type Theme = 'light' | 'dark';

export function themeFor(prefersDark: boolean): Theme {
  return prefersDark ? 'dark' : 'light';
}

/** The current theme, and a callback whenever the system setting changes. */
export function watchTheme(onChange: (theme: Theme) => void): Theme {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', (event) => onChange(themeFor(event.matches)));
  return themeFor(query.matches);
}
