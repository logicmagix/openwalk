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
  readonly arrow: HTMLElement;
  readonly action: HTMLButtonElement;
  readonly close: HTMLButtonElement;
}

export interface PanelHandlers {
  readonly onClose: () => void;
  /** The action button: turning location on. */
  readonly onAction: () => void;
}

export type PanelState =
  | { readonly kind: 'needs-location' }
  /** The person's position is known and is not at the site. */
  | { readonly kind: 'away'; readonly siteName: string }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'guiding'; readonly guidance: Guidance; readonly mapBearing: number }
  | { readonly kind: 'arrived' }
  | { readonly kind: 'unreachable' };

export interface Panel {
  show(place: PlaceFeature): void;
  update(state: PanelState): void;
  hide(): void;
}

export function setupPanel(elements: PanelElements, handlers: PanelHandlers): Panel {
  elements.close.addEventListener('click', handlers.onClose);
  elements.action.addEventListener('click', handlers.onAction);

  function setArrow(bearing: number | null, mapBearing: number): void {
    elements.arrow.hidden = bearing === null;
    if (bearing !== null) {
      // The arrow lives on the screen, so the map's own rotation is taken out.
      elements.arrow.style.transform = `rotate(${bearing - mapBearing}deg)`;
    }
  }

  return {
    show(place) {
      elements.name.textContent = labelOf(place);
      elements.detail.textContent = place.properties.annotation ?? '';
      elements.detail.hidden = elements.detail.textContent === '';
      elements.root.hidden = false;
    },
    update(state) {
      // Location can be tried again once the person has reached the site.
      elements.action.hidden = state.kind !== 'needs-location' && state.kind !== 'away';
      elements.root.classList.toggle('arrived', state.kind === 'arrived');
      switch (state.kind) {
        case 'needs-location':
          setArrow(null, 0);
          elements.status.textContent = 'Turn on location to get directions.';
          break;
        case 'away':
          setArrow(null, 0);
          elements.status.textContent = `Directions start when you are at ${state.siteName}.`;
          break;
        case 'waiting':
          setArrow(null, 0);
          elements.status.textContent = 'Waiting for your position…';
          break;
        case 'guiding':
          setArrow(state.guidance.bearing, state.mapBearing);
          elements.status.textContent = [
            `${state.guidance.distance}, ${state.guidance.duration}`,
            state.guidance.instruction,
          ]
            .filter((part) => part !== '')
            .join(' · ');
          break;
        case 'arrived':
          setArrow(null, 0);
          elements.status.textContent = 'You have arrived.';
          break;
        case 'unreachable':
          setArrow(null, 0);
          elements.status.textContent = 'No walking route found from here.';
          break;
      }
    },
    hide() {
      elements.root.hidden = true;
    },
  };
}
