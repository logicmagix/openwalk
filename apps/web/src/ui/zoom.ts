// The zoom buttons: a plus and a minus for people who cannot, or would rather
// not, pinch. Each steps the map one zoom level and goes grey at the limit.

/** Whether the map can zoom further each way. */
export interface ZoomRoom {
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
}

export interface ZoomElements {
  readonly zoomIn: HTMLButtonElement;
  readonly zoomOut: HTMLButtonElement;
}

/**
 * Wires the buttons. `onStep` is called with +1 or -1; the returned function is
 * told how much room is left whenever the map's zoom changes.
 */
export function setupZoom(
  elements: ZoomElements,
  onStep: (direction: 1 | -1) => void,
): (room: ZoomRoom) => void {
  elements.zoomIn.addEventListener('click', () => onStep(1));
  elements.zoomOut.addEventListener('click', () => onStep(-1));
  return (room) => {
    elements.zoomIn.disabled = !room.canZoomIn;
    elements.zoomOut.disabled = !room.canZoomOut;
  };
}
