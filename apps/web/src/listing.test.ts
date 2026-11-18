import { describe, expect, it } from 'vitest';
import { isListed, nginxListingHeaders, robotsTxt } from './listing';

describe('whether a host is listed by search engines', () => {
  it('is not, unless the build says yes', () => {
    expect(isListed('')).toBe(false);
    expect(isListed('  ')).toBe(false);
    expect(isListed('no')).toBe(false);
    expect(isListed('yes')).toBe(true);
    expect(isListed(' Yes ')).toBe(true);
  });

  it('refuses a setting that is neither', () => {
    expect(() => isListed('true')).toThrow(/yes/);
    expect(() => isListed('yes"; return 200')).toThrow();
  });
});

describe('robots.txt', () => {
  it('asks every crawler to stay out of a host that is not listed', () => {
    expect(robotsTxt(false)).toBe('User-agent: *\nDisallow: /\n');
  });

  it('lets them in to one that is', () => {
    expect(robotsTxt(true)).toBe('User-agent: *\nAllow: /\n');
  });
});

describe('the header', () => {
  it('asks not to be listed, and is sent whatever the response', () => {
    expect(nginxListingHeaders(false)).toContain(
      'add_header X-Robots-Tag "noindex, nofollow" always;',
    );
  });

  it('is left out for a host that is listed', () => {
    expect(nginxListingHeaders(true)).not.toContain('add_header');
  });
});
