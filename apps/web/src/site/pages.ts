// Each site installs to a phone's home screen as its own app, named after the
// site and opening on its own map. A phone decides an installed app's name and
// starting address from what the server sends for the page: the page's title
// tags and the web app manifest it links to. Setting them later from script is
// not honoured, so every site is given its own copy of the page and its own
// manifest file. The image build writes them for the sites it carries, and the
// development server produces the same on request.
//
// Pure text in, text out. This file is also run directly by Node during the
// image build, so it imports nothing.

export const APP_NAME = 'OpenWalk';

/** Colours the phone paints around an installed app before the page draws. */
const THEME_COLOUR = '#1a73e8';
const BACKGROUND_COLOUR = '#ffffff';

/** The icons every site shares. */
const ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
] as const;

/** The part of a site's configuration its page and manifest are built from. */
export interface SiteIdentity {
  readonly id: string;
  readonly name: string;
  readonly short_name?: string;
}

/** The page title for a site. */
export function pageTitle(config: { readonly name: string }): string {
  return `${config.name} · ${APP_NAME}`;
}

/** The label under the home-screen icon: the site's short name, or its name. */
export function installName(config: SiteIdentity): string {
  return config.short_name ?? config.name;
}

/** Where a site's manifest file is served. */
export function siteManifestPath(siteId: string): string {
  return `/sites/${siteId}/manifest.webmanifest`;
}

export interface WebAppManifest {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: 'standalone';
  readonly background_color: string;
  readonly theme_color: string;
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: string;
    readonly purpose: string;
  }[];
}

/** The web app manifest for one site: its name, and its own map as the start. */
export function siteManifest(config: SiteIdentity): WebAppManifest {
  const page = `/s/${config.id}/`;
  return {
    // The id tells one installed app from another on the same origin.
    id: page,
    name: config.name,
    short_name: installName(config),
    description: `Find your way around ${config.name} on foot.`,
    start_url: page,
    scope: page,
    display: 'standalone',
    background_color: BACKGROUND_COLOUR,
    theme_color: THEME_COLOUR,
    icons: ICONS,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replaces the one match of `pattern`; a page without it is a build error. */
function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) throw new Error(`the page has no ${what} to fill in`);
  return html.replace(pattern, () => replacement);
}

/**
 * The app's page as served for one site: the same document with the title, the
 * home-screen name and the manifest link filled in for that site.
 */
export function sitePageHtml(html: string, config: SiteIdentity): string {
  let page = html;
  page = replaceOnce(
    page,
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(pageTitle(config))}</title>`,
    'title',
  );
  page = replaceOnce(
    page,
    /(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(installName(config))}"`,
    'home-screen title',
  );
  page = replaceOnce(
    page,
    /(<link\s+rel="manifest"\s+href=")[^"]*(")/,
    `<link rel="manifest" href="${siteManifestPath(config.id)}"`,
    'manifest link',
  );
  return page;
}
