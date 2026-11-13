// Sets light or dark, and the set of colors, before the page is drawn, when
// the person has chosen them in Settings. It is a small file of its own,
// loaded ahead of everything else, so the page never shows in one and then
// switches to the other. The app's own code (src/appearance.ts) keeps the same
// choice under the same name; the two must agree.
(function () {
  try {
    var chosen = localStorage.getItem('openwalk.appearance');
    if (chosen === 'light' || chosen === 'dark') {
      document.documentElement.setAttribute('data-theme', chosen);
    }
    var scheme = localStorage.getItem('openwalk.scheme');
    if (scheme === 'contrast' || scheme === 'muted') {
      document.documentElement.setAttribute('data-scheme', scheme);
    }
  } catch {
    // Storage refused: the page follows the device, as it does by default.
  }
})();
