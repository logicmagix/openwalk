import { describe, expect, it } from 'vitest';
import { ROUGH_ABOVE_M, ROUGH_MESSAGE, SETTLED_AT_M, isRough, roughNoteStep } from './accuracy';

describe('isRough', () => {
  it('begins when a reading is worse than the upper mark', () => {
    expect(isRough(false, ROUGH_ABOVE_M + 1)).toBe(true);
    expect(isRough(false, ROUGH_ABOVE_M)).toBe(false);
    expect(isRough(false, 5)).toBe(false);
  });

  it('ends only when a reading reaches the lower mark', () => {
    expect(isRough(true, ROUGH_ABOVE_M - 5)).toBe(true);
    expect(isRough(true, SETTLED_AT_M + 1)).toBe(true);
    expect(isRough(true, SETTLED_AT_M)).toBe(false);
  });

  it('does not flicker for a reading hovering between the two marks', () => {
    let rough = false;
    const seen: boolean[] = [];
    for (const accuracy of [80, 38, 42, 30, 39, 26, 20, 30, 38]) {
      rough = isRough(rough, accuracy);
      seen.push(rough);
    }
    expect(seen).toEqual([true, true, true, true, true, true, false, false, false]);
  });
});

describe('roughNoteStep', () => {
  it('shows the message while the position is rough and nothing else is said', () => {
    expect(roughNoteStep(true, null, false)).toBe('show');
  });

  it('leaves another message alone', () => {
    expect(roughNoteStep(true, 'Finding the nearest parking…', false)).toBe('nothing');
  });

  it('does not put the message back after the person closed it', () => {
    expect(roughNoteStep(true, null, true)).toBe('nothing');
  });

  it('does nothing while the message is already up', () => {
    expect(roughNoteStep(true, ROUGH_MESSAGE, false)).toBe('nothing');
  });

  it('takes the message away once the position has settled', () => {
    expect(roughNoteStep(false, ROUGH_MESSAGE, false)).toBe('hide');
  });

  it('does not take away a different message when the position settles', () => {
    expect(roughNoteStep(false, 'Something else', false)).toBe('nothing');
    expect(roughNoteStep(false, null, false)).toBe('nothing');
  });
});
