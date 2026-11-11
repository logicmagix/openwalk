import { describe, expect, it } from 'vitest';
import { HEADER_POLICY, PAGE_POLICY, nginxHeaders, policyTag, withPolicy } from './policy';

const directives = (policy: string) =>
  new Map(policy.split('; ').map((part) => [part.split(' ')[0], part.split(' ').slice(1)]));

describe('the content security policy', () => {
  const page = directives(PAGE_POLICY);

  it('refuses whatever it does not name', () => {
    expect(page.get('default-src')).toEqual(["'none'"]);
  });

  it('takes scripts and styles only from its own host, with no inline code', () => {
    expect(page.get('script-src')).toEqual(["'self'"]);
    expect(page.get('style-src')).toEqual(["'self'"]);
    expect(PAGE_POLICY).not.toContain('unsafe');
  });

  it('connects only to its own host', () => {
    expect(page.get('connect-src')).toEqual(["'self'"]);
  });

  it('names no other host anywhere', () => {
    expect(HEADER_POLICY).not.toMatch(/https?:|\*|\w+\.\w+/);
  });

  it('says the same in the header as in the page, and adds what only a header may say', () => {
    expect(HEADER_POLICY.startsWith(PAGE_POLICY)).toBe(true);
    expect(directives(HEADER_POLICY).get('frame-ancestors')).toEqual(["'none'"]);
    expect(page.has('frame-ancestors')).toBe(false);
  });
});

describe('putting the policy in a page', () => {
  const html =
    '<!doctype html>\n<html><head>\n    <meta charset="utf-8" />\n    <title>x</title>\n</head></html>';

  it('adds the tag straight after the character set', () => {
    const out = withPolicy(html);
    expect(out).toContain(`<meta charset="utf-8" />\n    ${policyTag()}\n    <title>`);
    expect(out.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('refuses a page it cannot place the tag in', () => {
    expect(() => withPolicy('<html><head></head></html>')).toThrow(/charset/);
  });
});

it('writes the header as an nginx line', () => {
  expect(nginxHeaders()).toContain(`add_header Content-Security-Policy "${HEADER_POLICY}" always;`);
});
