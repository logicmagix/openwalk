// The content security policy: the rule the page gives the browser about where
// its code and data may come from. Everything the app needs comes from its own
// host, so the rule is "this host and nowhere else". A script, style, image or
// connection from any other host is refused by the browser, whoever put it on
// the page — including a network between the server and the phone that adds a
// script of its own.
//
// The rule is declared twice: in a tag in the page, which travels with the page
// to any host, and as a header from the server, which can also say things a tag
// cannot. Both are built from this one list. This file is also run directly by
// Node during the image build, so it imports nothing.

/** One line of the rule: what kind of thing, and where it may come from. */
type Directive = readonly [name: string, ...sources: string[]];

const SELF = "'self'";
const NONE = "'none'";

const DIRECTIVES: readonly Directive[] = [
  // Anything not named below is refused outright.
  ['default-src', NONE],
  // The app's bundles. No inline scripts and no scripts built from text.
  ['script-src', SELF],
  // The stylesheets the build produces.
  ['style-src', SELF],
  // The site's overlay images and the app's icons. The map library hands the
  // browser images it has already fetched as in-memory "blob:" and "data:"
  // addresses; those carry no host and reach nobody.
  ['img-src', SELF, 'blob:', 'data:'],
  // Site data, map tiles, fonts for map labels: all fetched from this host.
  ['connect-src', SELF],
  ['font-src', SELF],
  ['manifest-src', SELF],
  // The map library's background worker and the offline service worker.
  // child-src says the same to older browsers that do not know worker-src.
  ['worker-src', SELF],
  ['child-src', SELF],
  // No plugins; no <base> tag to redirect the page's own addresses; no forms
  // to post anything anywhere.
  ['object-src', NONE],
  ['base-uri', NONE],
  ['form-action', NONE],
];

/** Said only by the server: a tag in the page is not allowed to say these. */
const HEADER_ONLY: readonly Directive[] = [
  // The page may not be shown inside a frame on another site.
  ['frame-ancestors', NONE],
];

function render(directives: readonly Directive[]): string {
  return directives.map((directive) => directive.join(' ')).join('; ');
}

/** The rule as the page's own tag states it. */
export const PAGE_POLICY = render(DIRECTIVES);

/** The rule as the server's header states it: the same, and a little more. */
export const HEADER_POLICY = render([...DIRECTIVES, ...HEADER_ONLY]);

/** The tag that states the rule in a page. */
export function policyTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}" />`;
}

/**
 * The page with the rule's tag added, straight after the tag that names the
 * character set, so it is in force before anything else in the page is read.
 */
export function withPolicy(html: string): string {
  const charset = /<meta\s+charset="[^"]*"\s*\/?>/i;
  if (!charset.test(html)) throw new Error('the page has no charset tag to put the policy after');
  return html.replace(charset, (tag) => `${tag}\n    ${policyTag()}`);
}

/** The nginx lines that send the rule as a header. */
export function nginxHeaders(): string {
  return [
    '# Written by the image build from apps/web/src/policy.ts; do not edit.',
    `add_header Content-Security-Policy "${HEADER_POLICY}" always;`,
    '',
  ].join('\n');
}
