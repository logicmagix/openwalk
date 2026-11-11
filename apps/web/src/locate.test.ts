import { describe, expect, it } from 'vitest';
import { Locator } from './locate';
import { FixedPositionProvider } from './position/fixed';
import type { PositionError, PositionFix, PositionProvider } from './position/provider';

const FIX: PositionFix = { position: [1, 2], accuracyM: 5, heading: null, timestamp: 0 };

function harness(provider: PositionProvider) {
  const log: string[] = [];
  const locator = new Locator(provider, {
    onFix: (fix, first) => log.push(`fix ${fix.position.join(',')} ${first ? 'first' : 'again'}`),
    onError: (error) => log.push(`error ${error.kind}`),
    onCleared: () => log.push('cleared'),
  });
  return { locator, log };
}

describe('Locator', () => {
  it('starts the provider on toggle, centres once, and clears on toggle off', () => {
    const provider = new FixedPositionProvider(FIX);
    const { locator, log } = harness(provider);
    expect(locator.toggle()).toBe(true);
    expect(provider.active).toBe(true);
    expect(log).toEqual(['fix 1,2 first']);
    expect(locator.toggle()).toBe(false);
    expect(provider.active).toBe(false);
    expect(log).toEqual(['fix 1,2 first', 'cleared']);
  });

  it('pauses while hidden and resumes, centring again', () => {
    const provider = new FixedPositionProvider(FIX);
    const { locator, log } = harness(provider);
    locator.toggle();
    locator.setVisible(false);
    expect(provider.active).toBe(false);
    locator.setVisible(true);
    expect(provider.active).toBe(true);
    expect(log).toEqual(['fix 1,2 first', 'fix 1,2 first']);
  });

  it('does nothing on visibility changes while off', () => {
    const provider = new FixedPositionProvider(FIX);
    const { locator } = harness(provider);
    locator.setVisible(true);
    expect(provider.active).toBe(false);
  });

  it('passes provider errors on', () => {
    const failing: PositionProvider = {
      active: false,
      start: (_onFix, onError: (error: PositionError) => void) => onError({ kind: 'denied' }),
      stop: () => {},
    };
    const { locator, log } = harness(failing);
    locator.toggle();
    expect(log).toEqual(['error denied']);
  });

  it('follows from the moment it is switched on, until the map is moved by hand', () => {
    const { locator } = harness(new FixedPositionProvider(FIX));
    expect(locator.following).toBe(false);
    locator.toggle();
    expect(locator.following).toBe(true);
    locator.pause();
    expect(locator.on).toBe(true);
    expect(locator.following).toBe(false);
  });

  it('follows again when asked, and not at all while off', () => {
    const { locator } = harness(new FixedPositionProvider(FIX));
    locator.follow();
    expect(locator.following).toBe(false);
    locator.toggle();
    locator.pause();
    locator.follow();
    expect(locator.following).toBe(true);
    locator.toggle();
    expect(locator.following).toBe(false);
  });

  it('keeps a pause across the page being hidden and shown', () => {
    const { locator } = harness(new FixedPositionProvider(FIX));
    locator.toggle();
    locator.pause();
    locator.setVisible(false);
    locator.setVisible(true);
    expect(locator.following).toBe(false);
  });
});
