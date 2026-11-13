// The notice: one short message near the bottom of the map, such as why there
// is no position, or that a spot was saved. It can be closed with its button,
// and most notices also go away by themselves after a few seconds. One that
// says the app is still working on something stays until that is settled.

export interface NoticeElements {
  /** The notice as a whole: the words and the button that closes it. */
  readonly root: HTMLElement;
  /** Where the words go; a screen reader reads out a change here. */
  readonly text: HTMLElement;
  readonly close: HTMLButtonElement;
}

/**
 * How long a notice is shown:
 *   pass   it goes away by itself after a while (and can be closed sooner)
 *   stay   it remains until closed or replaced, for something still under way
 *          or something the person must know before going on
 */
export type NoticeLife = 'pass' | 'stay';

export interface Notice {
  show(message: string, life?: NoticeLife): void;
  hide(): void;
  /** The words now showing, or null when nothing is. */
  readonly message: string | null;
}

/** How long a passing notice is shown, in milliseconds: time to read two short lines. */
export const PASS_AFTER_MS = 8000;
/** How long the fade out takes; it must match the stylesheet's. */
const FADE_MS = 250;

export function setupNotice(
  elements: NoticeElements,
  /** Told which message the person closed with the button. */
  onClosed: (message: string) => void = () => undefined,
): Notice {
  const { root, text, close } = elements;
  let passTimer = 0;
  let fadeTimer = 0;
  let current: string | null = null;

  function clearTimers(): void {
    window.clearTimeout(passTimer);
    window.clearTimeout(fadeTimer);
  }

  /** Takes the notice away at once, with no fade. */
  function remove(): void {
    clearTimers();
    current = null;
    root.hidden = true;
    root.classList.remove('leaving');
    text.textContent = '';
  }

  /** Fades the notice out, then takes it away. */
  function leave(): void {
    clearTimers();
    root.classList.add('leaving');
    fadeTimer = window.setTimeout(remove, FADE_MS);
  }

  function pass(): void {
    // Someone reading it with a finger or the keyboard on it is given longer.
    if (root.matches(':hover') || root.contains(document.activeElement)) {
      passTimer = window.setTimeout(pass, PASS_AFTER_MS / 2);
      return;
    }
    leave();
  }

  close.addEventListener('click', () => {
    const closed = current;
    remove();
    if (closed !== null) onClosed(closed);
  });

  return {
    show(message, life = 'pass') {
      clearTimers();
      current = message;
      text.textContent = message;
      root.classList.remove('leaving');
      root.hidden = false;
      if (life === 'pass') passTimer = window.setTimeout(pass, PASS_AFTER_MS);
    },
    hide: remove,
    get message() {
      return current;
    },
  };
}
