// "My spots": a button that opens a short menu. Its first two rows mark where
// the person is standing, as the parked car or as a spot; under them are the
// spots already marked, each leading to directions, with a way to rename or
// remove it. The menu owns no data: it shows what it is given and reports what
// is asked of it.

import type { Spot } from '../spots';

export interface SpotsElements {
  readonly button: HTMLButtonElement;
  readonly panel: HTMLElement;
}

export interface SpotsOptions {
  readonly spots: () => readonly Spot[];
  /** Whether another spot may be added; false when the site holds all it may. */
  readonly roomForMore: () => boolean;
  /** Mark where the person is as the parked car, or as a spot. */
  readonly onPark: () => void;
  readonly onAdd: () => void;
  /** Directions to a spot were asked for. */
  readonly onGo: (spot: Spot) => void;
  readonly onRename: (spot: Spot, name: string) => void;
  readonly onRemove: (spot: Spot) => void;
}

export interface SpotsMenu {
  /** Redraws the menu after the spots changed. */
  refresh(): void;
  /** Opens the menu with one spot's rename and remove showing. */
  show(spotId: string): void;
  close(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const CAR =
  'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-4a2 2 0 0 1 2-2zm2.1 0h9.8l-1.2-3.6a.5.5 0 0 0-.5-.4H8.8a.5.5 0 0 0-.5.4z';
const PIN =
  'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z';

/** The sign for a spot: a car for the parked car, a pin for any other. */
export function spotSign(kind: Spot['kind']): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('spot-sign');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', kind === 'car' ? CAR : PIN);
  svg.append(path);
  return svg;
}

function plainButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

export function setupSpots(elements: SpotsElements, options: SpotsOptions): SpotsMenu {
  const { button, panel } = elements;
  // The spot whose rename and remove are showing, and whether it is being renamed.
  let expanded: string | null = null;
  let renaming = false;

  let open = false;
  function setOpen(next: boolean): void {
    open = next;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (!open) {
      expanded = null;
      renaming = false;
    }
  }

  function action(kind: Spot['kind'], label: string, run: () => void, enabled = true): HTMLElement {
    const row = plainButton('', 'spots-action');
    row.append(spotSign(kind), document.createTextNode(label));
    row.disabled = !enabled;
    row.addEventListener('click', () => {
      setOpen(false);
      run();
    });
    return row;
  }

  function spotRow(spot: Spot): HTMLLIElement {
    const item = document.createElement('li');
    const line = document.createElement('div');
    line.className = 'spots-line';

    const go = plainButton('', 'spots-go');
    go.append(spotSign(spot.kind), document.createTextNode(spot.name));
    go.setAttribute('aria-label', `Directions to ${spot.name}`);
    go.addEventListener('click', () => {
      setOpen(false);
      options.onGo(spot);
    });

    const more = plainButton('⋯', 'spots-more');
    more.setAttribute('aria-label', `Rename or remove ${spot.name}`);
    more.setAttribute('aria-expanded', String(expanded === spot.id));
    more.addEventListener('click', () => {
      expanded = expanded === spot.id ? null : spot.id;
      renaming = false;
      render();
    });
    line.append(go, more);
    item.append(line);

    if (expanded === spot.id && !renaming) {
      const tools = document.createElement('div');
      tools.className = 'spots-tools';
      const rename = plainButton('Rename', 'plain-button');
      rename.addEventListener('click', () => {
        renaming = true;
        render();
        panel.querySelector<HTMLInputElement>('.spots-name')?.focus();
      });
      const remove = plainButton('Remove', 'plain-button');
      remove.addEventListener('click', () => {
        expanded = null;
        options.onRemove(spot);
        button.focus();
      });
      tools.append(rename, remove);
      item.append(tools);
    }

    if (expanded === spot.id && renaming) {
      const form = document.createElement('form');
      form.className = 'spots-tools';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'spots-name';
      name.value = spot.name;
      name.maxLength = 40;
      name.setAttribute('aria-label', `Name for ${spot.name}`);
      name.autocomplete = 'off';
      const save = plainButton('Save', 'plain-button');
      save.type = 'submit';
      form.append(name, save);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        expanded = null;
        renaming = false;
        options.onRename(spot, name.value);
        button.focus();
      });
      item.append(form);
    }
    return item;
  }

  function render(): void {
    const spots = options.spots();
    const hasCar = spots.some((spot) => spot.kind === 'car');
    const room = options.roomForMore();
    const children: HTMLElement[] = [
      // Parking again moves the car, so it is offered even when the site is full.
      action(
        'car',
        hasCar ? 'Move my car here' : 'Park my car here',
        options.onPark,
        hasCar || room,
      ),
      action('spot', 'Save a spot here', options.onAdd, room),
    ];
    if (!room) {
      const full = document.createElement('p');
      full.className = 'spots-note';
      full.textContent = 'That is as many spots as can be kept. Remove one to add another.';
      children.push(full);
    }
    if (spots.length > 0) {
      const list = document.createElement('ul');
      list.className = 'spots-list';
      list.append(...spots.map(spotRow));
      children.push(list);
    }
    panel.replaceChildren(...children);
  }

  button.addEventListener('click', () => {
    setOpen(!open);
    if (open) render();
  });
  // A tap or click outside the control, and Escape, close the menu.
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

  return {
    refresh() {
      if (open) render();
    },
    show(spotId) {
      setOpen(true);
      expanded = spotId;
      render();
    },
    close: () => setOpen(false),
  };
}
