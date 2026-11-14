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

/**
 * True where the color of the status bar around the app is read only as the
 * page loads. An app installed on an iPhone is such a place: it paints the bar
 * from the page's theme-color tag once, and overlooks a later change to it. The
 * property asked for here exists on iPhones alone.
 */
export function readsBarColorAtLoadOnly(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
