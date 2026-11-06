// A provider that reports one position and never moves: for tests, and for
// checking the app on a desk by passing a position in the address.

import type { PositionFix, PositionProvider } from './provider';

export class FixedPositionProvider implements PositionProvider {
  private running = false;

  constructor(private readonly fix: PositionFix) {}

  get active(): boolean {
    return this.running;
  }

  // A fixed position cannot fail, so the error callback is not taken.
  start(onFix: (fix: PositionFix) => void): void {
    if (this.running) return;
    this.running = true;
    onFix(this.fix);
  }

  stop(): void {
    this.running = false;
  }
}
