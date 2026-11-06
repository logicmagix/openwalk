// What the locate button does, separated from the page so it can be tested with a
// fake provider: toggle the watch, centre the map on the first fix, drop the marker
// when switched off, and pause while the page is hidden.

import type { PositionError, PositionFix, PositionProvider } from './position/provider';

export interface LocatorEvents {
  readonly onFix: (fix: PositionFix, first: boolean) => void;
  readonly onError: (error: PositionError) => void;
  readonly onCleared: () => void;
}

export class Locator {
  private wanted = false;
  private centred = false;

  constructor(
    private readonly provider: PositionProvider,
    private readonly events: LocatorEvents,
  ) {}

  /** Whether the person has switched locating on. */
  get on(): boolean {
    return this.wanted;
  }

  toggle(): boolean {
    this.wanted = !this.wanted;
    this.centred = false;
    if (this.wanted) {
      this.watch();
    } else {
      this.provider.stop();
      this.events.onCleared();
    }
    return this.wanted;
  }

  /** Called when the page is hidden or shown again; a return centres anew. */
  setVisible(visible: boolean): void {
    if (!this.wanted) return;
    if (visible) {
      this.centred = false;
      this.watch();
    } else {
      this.provider.stop();
    }
  }

  private watch(): void {
    this.provider.start(
      (fix) => {
        const first = !this.centred;
        this.centred = true;
        this.events.onFix(fix, first);
      },
      (error) => this.events.onError(error),
    );
  }
}
