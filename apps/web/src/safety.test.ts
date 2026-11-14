import { describe, expect, it } from 'vitest';
import { telHref } from './safety';

describe('telHref', () => {
  it('keeps a short number as it is', () => {
    expect(telHref('911')).toBe('tel:911');
  });

  it('drops the spaces, brackets and hyphens people write', () => {
    expect(telHref('(352) 555-0100')).toBe('tel:3525550100');
    expect(telHref('352 555 0100')).toBe('tel:3525550100');
    expect(telHref('800-555-0199')).toBe('tel:8005550199');
  });

  it('keeps the plus of a number given with its country code', () => {
    expect(telHref('+44 20 7946 0000')).toBe('tel:+442079460000');
    expect(telHref(' +1 (352) 555-0100')).toBe('tel:+13525550100');
  });
});
