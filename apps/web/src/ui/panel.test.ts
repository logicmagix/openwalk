import { describe, expect, it } from 'vitest';
import { spokenChange, statusText, type PanelState } from './panel';

const guiding = (distance: string, instruction: string): PanelState => ({
  kind: 'guiding',
  guidance: { distance, duration: '2 min', bearing: 0, instruction },
  mapBearing: 0,
});

describe('statusText', () => {
  it('joins the distance, the time and the instruction while guiding', () => {
    expect(statusText(guiding('450 ft', 'Head north'))).toBe('450 ft, 2 min · Head north');
    expect(statusText(guiding('450 ft', ''))).toBe('450 ft, 2 min');
  });

  it('says how things stand otherwise', () => {
    expect(statusText({ kind: 'arrived' })).toBe('You have arrived.');
    expect(statusText({ kind: 'away', siteName: 'the park' })).toContain('the park');
  });
});

describe('spokenChange', () => {
  it('is the same while only the distance shrinks', () => {
    expect(spokenChange(guiding('450 ft', 'Head north'))).toBe(
      spokenChange(guiding('440 ft', 'Head north')),
    );
  });

  it('differs when the instruction changes', () => {
    expect(spokenChange(guiding('450 ft', 'Head north'))).not.toBe(
      spokenChange(guiding('450 ft', 'Head east')),
    );
  });

  it('differs between kinds of state', () => {
    const kinds = [
      spokenChange({ kind: 'waiting' }),
      spokenChange({ kind: 'arrived' }),
      spokenChange({ kind: 'unreachable' }),
      spokenChange(guiding('1 ft', '')),
    ];
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe('a planned walk', () => {
  const planned = (from: string, distance: string): PanelState => ({
    kind: 'planned',
    from,
    distance,
    duration: '6 min',
  });

  it('is described by its length alone', () => {
    expect(statusText(planned('Parking Lot P9', '0.3 mi'))).toBe('0.3 mi, 6 min');
  });

  it('is news when the start changes, and differs from being guided', () => {
    expect(spokenChange(planned('Parking Lot P9', '0.3 mi'))).not.toBe(
      spokenChange(planned('Library', '0.3 mi')),
    );
    expect(spokenChange(planned('Library', '0.3 mi'))).not.toBe(
      spokenChange(guiding('0.3 mi', '')),
    );
  });
});
