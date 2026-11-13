// The directions panel at the bottom of the map: the chosen destination, how far
// and how long, an arrow for the way to head, and the arrival message.

import type { PlaceFeature } from '@openwalk/search';
import type { Guidance } from '../directions';
import { labelOf } from './listing';

export interface PanelElements {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly detail: HTMLElement;
  readonly status: HTMLElement;
  /** Hidden from view; what a screen reader is told when the directions change. */
  readonly announce: HTMLElement;
  readonly arrow: HTMLElement;
  readonly action: HTMLButtonElement;
  /** The line that says where the walk starts; pressing it chooses another start. */
  readonly from: HTMLButtonElement;
  /** The part of that line that names the start. */
  readonly fromName: HTMLElement;
  /** The star: saves the place shown, or forgets it. */
  readonly save: HTMLButtonElement;
  readonly close: HTMLButtonElement;
}

export interface PanelHandlers {
  readonly onClose: () => void;
  /** The action button: turning location on. */
  readonly onAction: () => void;
  /** The star was pressed for the place shown. */
  readonly onSave: () => void;
  /** The From line was pressed: the person wants to choose where the walk starts. */
  readonly onFrom: () => void;
}

export type PanelState =
  | { readonly kind: 'needs-location' }
  /** The person's position is known and is not at the site. */
  | { readonly kind: 'away'; readonly siteName: string }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'guiding'; readonly guidance: Guidance; readonly mapBearing: number }
  /** A walk from a chosen place, shown whole: no arrow, and no arriving. */
  | {
      readonly kind: 'planned';
      readonly from: string;
      readonly distance: string;
      readonly duration: string;
    }
  | { readonly kind: 'arrived' }
  | { readonly kind: 'unreachable' };

/** The line of the panel that says how things stand. */
export function statusText(state: PanelState): string {
  switch (state.kind) {
    case 'needs-location':
      return 'Turn on location to get directions.';
    case 'away':
      return `Directions start when you are at ${state.siteName}.`;
    case 'waiting':
      return 'Waiting for your position…';
    case 'guiding':
      return [`${state.guidance.distance}, ${state.guidance.duration}`, state.guidance.instruction]
        .filter((part) => part !== '')
        .join(' · ');
    case 'planned':
      return `${state.distance}, ${state.duration}`;
    case 'arrived':
      return 'You have arrived.';
    case 'unreachable':
      return 'No walking route found from here.';
  }
}

/**
 * What a change in the directions turns on, for reading aloud. The distance
 * shrinks with every step and would be read out without pause, so while guiding
 * only a new instruction ("Head north" becoming "Head east") counts as news.
 */
export function spokenChange(state: PanelState): string {
  if (state.kind === 'guiding') return `guiding ${state.guidance.instruction}`;
  if (state.kind === 'planned') return `planned ${state.from}`;
  return state.kind;
}

export interface Panel {
  show(place: PlaceFeature): void;
  update(state: PanelState): void;
  /** Names where the walk starts on the From line. */
  setFrom(name: string): void;
  /** Shows the star filled for a saved place and hollow otherwise. */
  setSaved(saved: boolean): void;
  hide(): void;
}

export function setupPanel(elements: PanelElements, handlers: PanelHandlers): Panel {
  // The controls along the bottom of the screen move up to stay clear of the
  // panel. Its height changes with what it says, so the page is told the space it
  // takes whenever that changes. A ResizeObserver calls back when an element's
  // size changes, including when it is hidden (size zero) or shown again.
  const GAP_PX = 12;
  new ResizeObserver(() => {
    const height = elements.root.hidden ? 0 : elements.root.offsetHeight;
    document.body.style.setProperty('--panel-space', height > 0 ? `${height + GAP_PX}px` : '0px');
  }).observe(elements.root);

  elements.close.addEventListener('click', handlers.onClose);
  elements.action.addEventListener('click', handlers.onAction);
  elements.save.addEventListener('click', handlers.onSave);
  elements.from.addEventListener('click', handlers.onFrom);

  function setArrow(bearing: number | null, mapBearing: number): void {
    elements.arrow.hidden = bearing === null;
    if (bearing !== null) {
      // The arrow lives on the screen, so the map's own rotation is taken out.
      elements.arrow.style.transform = `rotate(${bearing - mapBearing}deg)`;
    }
  }

  // What was last read aloud, and the name of a destination not yet read.
  let spoken: string | null = null;
  let unnamed: string | null = null;

  return {
    show(place) {
      spoken = null;
      unnamed = labelOf(place);
      elements.name.textContent = labelOf(place);
      elements.detail.textContent = place.properties.annotation ?? '';
      elements.detail.hidden = elements.detail.textContent === '';
      elements.root.hidden = false;
    },
    update(state) {
      // Location can be tried again once the person has reached the site.
      elements.action.hidden = state.kind !== 'needs-location' && state.kind !== 'away';
      elements.root.classList.toggle('arrived', state.kind === 'arrived');
      setArrow(
        state.kind === 'guiding' ? state.guidance.bearing : null,
        state.kind === 'guiding' ? state.mapBearing : 0,
      );
      const text = statusText(state);
      elements.status.textContent = text;
      const change = spokenChange(state);
      if (change !== spoken) {
        spoken = change;
        // A new destination is named once, ahead of its first status.
        const said = state.kind === 'planned' ? `From ${state.from}: ${text}` : text;
        elements.announce.textContent = unnamed === null ? said : `${unnamed}. ${said}`;
        unnamed = null;
      }
    },
    setFrom(name) {
      elements.fromName.textContent = name;
    },
    setSaved(saved) {
      elements.save.setAttribute('aria-pressed', String(saved));
    },
    hide() {
      elements.announce.textContent = '';
      elements.root.hidden = true;
    },
  };
}
