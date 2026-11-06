import { describe, expect, it } from 'vitest';
import { chooseProvider, replayAllowed, traceUrl } from './select';

describe('replayAllowed', () => {
  it('is on in development and off in production unless a build opts in', () => {
    expect(replayAllowed({ DEV: true })).toBe(true);
    expect(replayAllowed({ DEV: false })).toBe(false);
    expect(replayAllowed({ DEV: false, VITE_ENABLE_REPLAY: 'true' })).toBe(true);
    expect(replayAllowed({ DEV: false, VITE_ENABLE_REPLAY: 'yes' })).toBe(false);
  });
});

describe('chooseProvider', () => {
  it('defaults to the GPS', () => {
    expect(chooseProvider('', true)).toEqual({ kind: 'gps' });
    expect(chooseProvider('?foo=bar', true)).toEqual({ kind: 'gps' });
  });

  it('ignores every parameter when replay is not allowed', () => {
    expect(chooseProvider('?replay=walk', false)).toEqual({ kind: 'gps' });
    expect(chooseProvider('?at=1,2', false)).toEqual({ kind: 'gps' });
  });

  it('reads a replay request with its speed and loop flag', () => {
    expect(chooseProvider('?replay=demo-walk&speed=5&loop', true)).toEqual({
      kind: 'replay',
      trace: 'demo-walk',
      speed: 5,
      loop: true,
    });
    expect(chooseProvider('?replay=demo-walk&speed=-1', true)).toMatchObject({
      speed: 1,
      loop: false,
    });
    expect(chooseProvider('?replay=../x', true)).toEqual({ kind: 'gps' });
  });

  it('reads a fixed position with its accuracy', () => {
    expect(chooseProvider('?at=-82.13,29.19&accuracy=4', true)).toEqual({
      kind: 'fixed',
      position: [-82.13, 29.19],
      accuracyM: 4,
    });
    expect(chooseProvider('?at=-82.13,29.19', true)).toMatchObject({ accuracyM: 10 });
    expect(chooseProvider('?at=1', true)).toEqual({ kind: 'gps' });
    expect(chooseProvider('?at=200,1', true)).toEqual({ kind: 'gps' });
  });
});

it('locates traces in the site directory', () => {
  expect(traceUrl('/sites/demo/', 'walk')).toBe('/sites/demo/traces/walk.gpx');
});
