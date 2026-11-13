// When to tell someone their position is still rough. A phone's first reading
// often comes from Wi-Fi and cell towers and can be a street away; it tightens
// over the next seconds as the satellites are found. Until then the dot may sit
// in the wrong place, and a short message says the app knows.
//
// The message turns on at one accuracy and off at a better one. With a single
// threshold, a reading hovering around it would switch the message on and off
// with every fix.

/** A reading this uncertain or worse, in meters, is called rough. */
export const ROUGH_ABOVE_M = 40;
/** A rough position counts as settled once a reading is this good or better. */
export const SETTLED_AT_M = 25;

export const ROUGH_MESSAGE = 'Finding a more exact position…';

/** Whether the position is rough now, given whether it was before this reading. */
export function isRough(wasRough: boolean, accuracyM: number): boolean {
  return wasRough ? accuracyM > SETTLED_AT_M : accuracyM > ROUGH_ABOVE_M;
}

/**
 * What to do about the message after a reading:
 *   show     the position is rough, nothing else is being said, and the person
 *            has not closed this message since the position last settled
 *   hide     the position has settled and the message is still up
 *   nothing  otherwise
 * `showing` is the message on screen now, if any; a different message is left alone.
 */
export function roughNoteStep(
  rough: boolean,
  showing: string | null,
  closedByPerson: boolean,
): 'show' | 'hide' | 'nothing' {
  if (rough && showing === null && !closedByPerson) return 'show';
  if (!rough && showing === ROUGH_MESSAGE) return 'hide';
  return 'nothing';
}
