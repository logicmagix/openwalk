import { describe, expect, it } from 'vitest';
import { versionLine } from './version';

describe('versionLine', () => {
  it('names the version a release was built with', () => {
    expect(versionLine('1.2.0')).toBe('OpenWalk 1.2.0');
    expect(versionLine(' 0.1.1 ')).toBe('OpenWalk 0.1.1');
  });

  it('says so when the build is not a release', () => {
    expect(versionLine(undefined)).toBe('OpenWalk, development build');
    expect(versionLine('')).toBe('OpenWalk, development build');
  });
});
