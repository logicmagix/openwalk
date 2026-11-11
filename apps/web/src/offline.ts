// Offline support: register the service worker and tell it which files to keep,
// so the app works with no network after the first visit. Production builds only
// — in development a service worker would fight Vite's hot reload (and strand the
// page on a stale cache). The visible "ready for offline" and "update available"
// cues are wired by the caller through the hooks below.

export interface OfflineHooks {
  /** The offline set finished caching; `ok` is true when every file was stored. */
  readonly onReady?: (ok: boolean) => void;
  /** A new version installed and is waiting; call apply() to switch to it. */
  readonly onUpdate?: (apply: () => void) => void;
}

/**
 * @param collectUrls Returns the same-origin files to pre-cache. It is called
 *   once a worker controls the page, so it can read what the page actually
 *   loaded (bundles, site data, the basemap) rather than a guessed list.
 */
export function setupOffline(collectUrls: () => string[], hooks: OfflineHooks = {}): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;

  sw.addEventListener('message', (event) => {
    if (event.data?.type === 'OFFLINE_READY') hooks.onReady?.(event.data.ok === true);
  });

  // Reload once the replacement worker takes over, but only after the person
  // chose to apply an update — not on the first install's clients.claim().
  let applying = false;
  sw.addEventListener('controllerchange', () => {
    if (applying) window.location.reload();
  });

  const register = () => {
    sw.register('/sw.js', { scope: '/' }).then(
      (registration) => {
        // Ask the worker to pre-cache the offline set once it controls the page.
        const cacheOffline = () => {
          const worker = sw.controller ?? registration.active;
          if (!worker) return;
          // Give the map a beat to pull its own assets before taking inventory.
          const send = () => worker.postMessage({ type: 'CACHE_OFFLINE', urls: collectUrls() });
          if ('requestIdleCallback' in window) requestIdleCallback(send, { timeout: 3000 });
          else setTimeout(send, 1500);
        };
        if (sw.controller) cacheOffline();
        else sw.addEventListener('controllerchange', cacheOffline, { once: true });

        // A new worker beside the one controlling the page is an update: surface
        // it rather than swapping silently. The browser checks for one by itself
        // as the page opens, so by now it may be on its way, or already installed
        // and waiting from this visit or an earlier one. All three are covered;
        // listening for `updatefound` alone misses the update whenever the
        // browser is quicker than this code.
        const offer = (next: ServiceWorker): void => {
          hooks.onUpdate?.(() => {
            applying = true;
            next.postMessage({ type: 'SKIP_WAITING' });
          });
        };
        const track = (next: ServiceWorker): void => {
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && sw.controller) offer(next);
          });
        };
        if (registration.waiting && sw.controller) offer(registration.waiting);
        if (registration.installing) track(registration.installing);
        registration.addEventListener('updatefound', () => {
          if (registration.installing) track(registration.installing);
        });
      },
      () => {
        // Registration failed; the app still works online.
      },
    );
  };

  // start() is async and finishes after the page's load event has already
  // fired, so register right away when the document is ready rather than waiting
  // for an event that has come and gone.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
