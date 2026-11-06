import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  placeholderStatus,
  positionErrorMessage,
  positionMessage,
  secureContextMessage,
} from './app';

describe('placeholderStatus', () => {
  it('mentions the app name', () => {
    expect(placeholderStatus()).toContain(APP_NAME);
  });
});

describe('secureContextMessage', () => {
  it('tells the tester to use https when the context is not secure', () => {
    expect(secureContextMessage(false)).toContain('https');
    expect(secureContextMessage(true)).not.toContain('https');
  });
});

describe('positionMessage', () => {
  it('rounds the accuracy to whole metres and never includes coordinates', () => {
    expect(positionMessage(12.6)).toBe('Position received, accurate to about 13 m.');
  });
});

describe('positionErrorMessage', () => {
  it('maps the three standard error codes and falls back for others', () => {
    expect(positionErrorMessage(1)).toMatch(/denied/);
    expect(positionErrorMessage(2)).toMatch(/unavailable/);
    expect(positionErrorMessage(3)).toMatch(/Timed out/);
    expect(positionErrorMessage(99)).toMatch(/Unknown/);
  });
});
