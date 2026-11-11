import { describe, expect, it } from 'vitest';
import { sitePagePath } from './load';
import { installName, pageTitle, siteManifest, siteManifestPath, sitePageHtml } from './pages';

const site = { id: 'some-site', name: 'Somewhere & Sons', short_name: 'Some' };

describe('installName', () => {
  it('prefers the short name and falls back to the name', () => {
    expect(installName(site)).toBe('Some');
    expect(installName({ id: 'a', name: 'Somewhere' })).toBe('Somewhere');
  });
});

describe('siteManifest', () => {
  const manifest = siteManifest(site);

  it('names the app after the site', () => {
    expect(manifest.name).toBe('Somewhere & Sons');
    expect(manifest.short_name).toBe('Some');
  });

  it('starts on, and is scoped to, the site map page', () => {
    expect(manifest.start_url).toBe(sitePagePath('some-site'));
    expect(manifest.scope).toBe(sitePagePath('some-site'));
    expect(manifest.display).toBe('standalone');
  });

  it('gives each site a distinct id', () => {
    expect(siteManifest({ id: 'other-site', name: 'Elsewhere' }).id).not.toBe(manifest.id);
  });

  it('points at nothing outside the origin', () => {
    const addresses = [manifest.id, manifest.start_url, manifest.scope].concat(
      manifest.icons.map((icon) => icon.src),
    );
    for (const address of addresses) expect(address.startsWith('/')).toBe(true);
  });
});

describe('sitePageHtml', () => {
  const html = `<!doctype html>
<html><head>
    <title>OpenWalk</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="OpenWalk" />
</head><body></body></html>`;
  const page = sitePageHtml(html, site);

  it('titles the page after the site, escaped for HTML', () => {
    expect(page).toContain(`<title>Somewhere &amp; Sons · OpenWalk</title>`);
    expect(pageTitle(site)).toBe('Somewhere & Sons · OpenWalk');
  });

  it('sets the home-screen name', () => {
    expect(page).toContain('<meta name="apple-mobile-web-app-title" content="Some" />');
  });

  it("links the site's own manifest", () => {
    expect(page).toContain(`<link rel="manifest" href="${siteManifestPath('some-site')}" />`);
    expect(page).not.toContain('"/manifest.webmanifest"');
  });

  it('leaves the rest of the page alone', () => {
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page.endsWith('<body></body></html>')).toBe(true);
  });

  it('refuses a page it cannot fill in', () => {
    expect(() => sitePageHtml('<html></html>', site)).toThrow(/title/);
  });
});
