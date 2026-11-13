import { describe, expect, it } from 'vitest';
// The script as text: `?raw` asks the build tool for a file's contents, not its exports.
import script from '../public/theme.js?raw';
import {
  APPEARANCE_KEY,
  SCHEME_ATTRIBUTE,
  SCHEME_KEY,
  readScheme,
  THEME_ATTRIBUTE,
  attributeFor,
  readAppearance,
  themeOf,
} from './appearance';

describe('readAppearance', () => {
  it('follows the device unless light or dark was chosen', () => {
    expect(readAppearance(null)).toBe('system');
    expect(readAppearance('')).toBe('system');
    expect(readAppearance('sepia')).toBe('system');
    expect(readAppearance('light')).toBe('light');
    expect(readAppearance('dark')).toBe('dark');
  });
});

describe('themeOf', () => {
  it('is the device’s own preference while following it', () => {
    expect(themeOf('system', true)).toBe('dark');
    expect(themeOf('system', false)).toBe('light');
  });

  it('is the choice, whatever the device prefers', () => {
    expect(themeOf('light', true)).toBe('light');
    expect(themeOf('dark', false)).toBe('dark');
  });
});

describe('attributeFor', () => {
  it('is absent while following the device', () => {
    expect(attributeFor('system')).toBeNull();
    expect(attributeFor('dark')).toBe('dark');
  });
});

describe('the script that runs before the page is drawn', () => {
  // It cannot import this module, so it repeats the name and the attribute.
  it('does the same for the set of colours', () => {
    expect(script).toContain(`'${SCHEME_KEY}'`);
    expect(script).toContain(`'${SCHEME_ATTRIBUTE}'`);
  });

  it('reads the same name and sets the same attribute', () => {
    expect(script).toContain(`'${APPEARANCE_KEY}'`);
    expect(script).toContain(`'${THEME_ATTRIBUTE}'`);
  });
});

describe('readScheme', () => {
  it('is the standard scheme unless another of the three was chosen', () => {
    expect(readScheme(null)).toBe('standard');
    expect(readScheme('standard')).toBe('standard');
    expect(readScheme('neon')).toBe('standard');
    expect(readScheme('contrast')).toBe('contrast');
    expect(readScheme('muted')).toBe('muted');
  });
});
