// What the locate button does, separated from the page so it can be tested with a
// fake provider: toggle the watch, centre the map on the first fix, drop the marker
// when switched off, and pause while the page is hidden.
//
// While locating is on the map follows the person as they walk. Moving the map
// by hand pauses that, so someone can look ahead without being pulled back;
// pressing the button again returns to them and resumes following.

import type { PositionError, PositionFix, PositionProvider } from './position/provider';

export interface LocatorEvents {
  readonly onFix: (fix: PositionFix, first: boolean) => void;
  readonly onError: (error: PositionError) => void;
  readonly onCleared: () => void;
}

export class Locator {
  private wanted = false;
  private centred = false;
  private follows = false;

  constructor(
    private readonly provider: PositionProvider,
    private readonly events: LocatorEvents,
  ) {}

  /** Whether the person has switched locating on. */
  get on(): boolean {
    return this.wanted;
  }

  /** Whether the map should keep the person's position in the centre. */
  get following(): boolean {
    return this.wanted && this.follows;
  }

  /** The person moved the map themselves, or it moved to show something else. */
  pause(): void {
    this.follows = false;
  }

  /** Keep the person in the centre again, after a pause. */
  follow(): void {
    this.follows = this.wanted;
  }

  toggle(): boolean {
    this.wanted = !this.wanted;
    this.follows = this.wanted;
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
