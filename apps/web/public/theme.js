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
    // The color a phone paints its status bar around the app: the color of
    // the app's surfaces under the choices above. The page's own tags give it
    // for someone following their device with the standard colors.
    if (chosen === 'light' || chosen === 'dark' || scheme === 'contrast') {
      var dark =
        chosen === 'dark' ||
        (chosen !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var color =
        scheme === 'contrast' ? (dark ? '#000000' : '#ffffff') : dark ? '#202124' : '#ffffff';
      var tags = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < tags.length; i += 1) {
        tags[i].removeAttribute('media');
        tags[i].setAttribute('content', color);
      }
    }
  } catch {
    // Storage refused: the page follows the device, as it does by default.
  }
})();
