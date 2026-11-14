// Whether the app is running from a phone's home screen, in a window of its
// own, and not in a browser tab.

/**
 * True when the page was opened as an installed app. Browsers answer through a
 * media query; an iPhone also, and in older versions only, through a property
 * of its own on `navigator`.
 */
export function runsInstalled(): boolean {
  const own = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return own || window.matchMedia('(display-mode: standalone)').matches;
}
