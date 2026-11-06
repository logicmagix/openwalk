// The layers control: a button that opens a small panel of checkboxes for the
// optional map layers. The site's overlays come first (each a georeferenced image,
// off by default), then the walkways and place labels, which are on by default.
// The control owns no map state; it reports the chosen set and the caller restyles.

import type { LayerPrefs } from '../map/style';

export interface LayersElements {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
}

export interface LayersOptions {
  /** The site's overlays, in the order they should appear. */
  readonly overlays: readonly { readonly id: string; readonly name: string }[];
  /** Called with the full, normalised preferences whenever a checkbox changes. */
  readonly onChange: (prefs: LayerPrefs) => void;
}

/** A labelled checkbox row. */
function checkbox(label: string, checked: boolean, onToggle: (on: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'layers-row';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onToggle(input.checked));
  const text = document.createElement('span');
  text.textContent = label;
  row.append(input, text);
  return row;
}

/**
 * Wires the layers button and panel. Returns the initial preferences so the first
 * style is built to match the checkboxes (overlays off, walkways and labels on).
 */
export function setupLayers(elements: LayersElements, options: LayersOptions): LayerPrefs {
  const { button, panel } = elements;
  // The working set of shown overlay ids; walkways and labels start on.
  const shownOverlays = new Set<string>();
  let walkways = true;
  let labels = true;

  function current(): LayerPrefs {
    return { overlays: [...shownOverlays], walkways, labels };
  }

  for (const overlay of options.overlays) {
    panel.append(
      checkbox(overlay.name, false, (on) => {
        if (on) shownOverlays.add(overlay.id);
        else shownOverlays.delete(overlay.id);
        options.onChange(current());
      }),
    );
  }
  panel.append(
    checkbox('Walkways', true, (on) => {
      walkways = on;
      options.onChange(current());
    }),
    checkbox('Place labels', true, (on) => {
      labels = on;
      options.onChange(current());
    }),
  );

  let open = false;
  function setOpen(next: boolean): void {
    open = next;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', () => setOpen(!open));
  // A tap or click outside the control, and Escape, close the panel.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (open && !panel.contains(target) && !button.contains(target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      button.focus();
    }
  });

  button.disabled = false;
  return current();
}
