// The two visible cues for offline support, in one small banner near the bottom
// of the screen:
//   - a brief confirmation, shown once, when the app has finished caching and is
//     safe to use with no network (so a tester knows the cache is complete);
//   - a prompt when a new version is waiting, which reloads into it on request
//     rather than swapping silently.
// It owns no offline logic; the caller wires these to the service worker.

import type { OfflineHooks } from '../offline';

// Remembered per device so the "ready" confirmation appears on the first visit
// and not on every load afterwards. A browser with storage blocked just shows it
// each time, which is harmless.
const READY_SHOWN = 'openwalk.offline-ready-shown';

export function setupOfflineStatus(): OfflineHooks {
  const banner = document.createElement('div');
  banner.className = 'offline-note';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  // Beside the app's other messages, so the two stack and never overlap.
  (document.getElementById('notices') ?? document.body).append(banner);

  let hideTimer = 0;

  function show(message: string, action?: { label: string; run: () => void }): void {
    window.clearTimeout(hideTimer);
    banner.replaceChildren();
    const text = document.createElement('span');
    text.textContent = message;
    banner.append(text);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      banner.append(button);
    }
    banner.hidden = false;
  }

  return {
    onReady(ok) {
      if (!ok) return; // only claim "ready" when every file is cached
      let alreadyShown = false;
      try {
        alreadyShown = localStorage.getItem(READY_SHOWN) === '1';
        localStorage.setItem(READY_SHOWN, '1');
      } catch {
        // Storage unavailable; fall through and show it this time.
      }
      if (alreadyShown) return;
      show('Ready to use offline');
      hideTimer = window.setTimeout(() => {
        banner.hidden = true;
      }, 4000);
    },
    onUpdate(apply) {
      // Stays until the person chooses to reload.
      show('A new version is available', { label: 'Reload', run: apply });
    },
  };
}
