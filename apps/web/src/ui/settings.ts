// Settings: how the app looks, which applies to every map on the device, and
// which of the optional buttons this map shows. The panel owns no settings: it
// shows what it is given and reports each change as it is made.

import { APPEARANCES, type Appearance } from '../appearance';
import type { Controls } from '../prefs';

export interface SettingsElements {
  /** The panel itself, a dialog element. */
  readonly dialog: HTMLDialogElement;
  readonly close: HTMLButtonElement;
  /** Where the choice of light or dark is listed. */
  readonly appearance: HTMLElement;
  /** Where the switches for this map's buttons are listed. */
  readonly controls: HTMLElement;
}

/** One optional button: which it is and what it is called. */
export interface ControlChoice {
  readonly id: keyof Controls;
  readonly label: string;
}

export interface SettingsOptions {
  readonly appearance: () => Appearance;
  readonly onAppearance: (appearance: Appearance) => void;
  /** The optional buttons this site has; one it lacks is not offered. */
  readonly choices: readonly ControlChoice[];
  readonly controls: () => Controls;
  readonly onControls: (controls: Controls) => void;
}

export interface Settings {
  open(): void;
}

export function setupSettings(elements: SettingsElements, options: SettingsOptions): Settings {
  const { dialog } = elements;

  function render(): void {
    const chosen = options.appearance();
    elements.appearance.replaceChildren(
      ...APPEARANCES.map(({ value, label }) => {
        const row = document.createElement('label');
        row.className = 'settings-row';
        const input = document.createElement('input');
        input.type = 'radio';
        // Radio buttons with one name form one choice: picking one clears the others.
        input.name = 'appearance';
        input.value = value;
        input.checked = value === chosen;
        input.addEventListener('change', () => {
          if (input.checked) options.onAppearance(value);
        });
        const text = document.createElement('span');
        text.textContent = label;
        row.append(input, text);
        return row;
      }),
    );

    const shown = options.controls();
    elements.controls.replaceChildren(
      ...options.choices.map(({ id, label }) => {
        const row = document.createElement('label');
        row.className = 'settings-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = shown[id];
        input.addEventListener('change', () => {
          options.onControls({ ...options.controls(), [id]: input.checked });
        });
        const text = document.createElement('span');
        text.textContent = label;
        row.append(input, text);
        return row;
      }),
    );
  }

  elements.close.addEventListener('click', () => dialog.close());
  // A press on the dimmed page around the panel closes it, as Escape does.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  return {
    open() {
      render();
      if (!dialog.open) dialog.showModal();
    },
  };
}
