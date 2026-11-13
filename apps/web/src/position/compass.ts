// Which way the person is facing, for the wedge drawn beside their position.
//
// A phone offers two signs of direction. Its compass says which way the phone
// points, standing still or moving, but an iPhone asks the person's leave
// first and any compass can be thrown off by metal nearby. Its position
// readings carry the direction of travel, which needs no leave but exists only
// while walking. The compass is used when there is one and the direction of
// travel otherwise. Like the position, neither leaves the phone.
//
// The browser reports the compass through "device orientation" events. Android
// sends an absolute reading as `alpha`, counted counter-clockwise from north;
// an iPhone sends `webkitCompassHeading`, counted clockwise. Both are for the
// phone held upright in portrait, so the screen's own rotation is added.

/** The part of a device orientation event that carries a compass reading. */
export interface OrientationReading {
  readonly alpha: number | null;
  /** True when `alpha` is measured from north and not from where the phone began. */
  readonly absolute?: boolean;
  /** An iPhone's own compass heading, clockwise from north. */
  readonly webkitCompassHeading?: number;
}

function turn(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * The compass heading in degrees clockwise from north, or null when the event
 * carries none. `screenAngle` is how far the screen is turned from portrait.
 */
export function compassFrom(reading: OrientationReading, screenAngle: number): number | null {
  const iphone = reading.webkitCompassHeading;
  if (typeof iphone === 'number' && Number.isFinite(iphone)) return turn(iphone + screenAngle);
  if (reading.absolute === true && reading.alpha !== null && Number.isFinite(reading.alpha)) {
    return turn(360 - reading.alpha + screenAngle);
  }
  return null;
}

/**
 * A heading moved part of the way from the last towards a new reading, the
 * short way round. A compass jitters by a few degrees even at rest; following
 * it a step at a time keeps the wedge steady without making it slow to turn.
 */
export function smoothHeading(previous: number | null, next: number, share = 0.3): number {
  if (previous === null) return turn(next);
  const difference = ((next - previous + 540) % 360) - 180;
  return turn(previous + difference * share);
}

/** The heading to show: the compass when there is one, else the direction of travel. */
export function bestHeading(compass: number | null, travel: number | null): number | null {
  return compass ?? travel;
}

/** What an iPhone adds to the event type: a way to ask the person's leave. */
interface PermissionGate {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** Listens to the phone's compass while it is wanted. */
export class Compass {
  private heading: number | null = null;
  private sawAbsolute = false;
  private listener: ((event: DeviceOrientationEvent) => void) | null = null;

  /**
   * Asks leave to read the compass where the browser requires it, which an
   * iPhone does and only in answer to a press. Resolves false when refused or
   * when there is no compass to ask for. Nothing need wait on the answer:
   * without leave no readings arrive.
   */
  static async request(): Promise<boolean> {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    const gate = DeviceOrientationEvent as unknown as PermissionGate;
    if (typeof gate.requestPermission !== 'function') return true;
    try {
      return (await gate.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  /** Starts reporting the heading, smoothed, each time the compass moves. */
  start(onHeading: (heading: number) => void): void {
    if (this.listener !== null || typeof window === 'undefined') return;
    this.listener = (event) => {
      const absolute = event.type === 'deviceorientationabsolute' || event.absolute;
      // Once the browser has sent readings measured from north, the plain
      // event's readings, measured from wherever the phone began, are ignored.
      if (absolute) this.sawAbsolute = true;
      else if (this.sawAbsolute) return;
      const reading = compassFrom(
        {
          alpha: event.alpha,
          absolute,
          webkitCompassHeading: (event as unknown as OrientationReading).webkitCompassHeading,
        },
        window.screen.orientation?.angle ?? 0,
      );
      if (reading === null) return;
      this.heading = smoothHeading(this.heading, reading);
      onHeading(this.heading);
    };
    // Android reports north-based readings under the first name; an iPhone
    // reports its compass under the second.
    window.addEventListener('deviceorientationabsolute', this.listener as EventListener);
    window.addEventListener('deviceorientation', this.listener as EventListener);
  }

  stop(): void {
    if (this.listener === null) return;
    window.removeEventListener('deviceorientationabsolute', this.listener as EventListener);
    window.removeEventListener('deviceorientation', this.listener as EventListener);
    this.listener = null;
    this.heading = null;
    this.sawAbsolute = false;
  }
}
