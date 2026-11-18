// Whether search engines may list the pages a host serves. They may not, unless
// whoever builds the image says so: a copy put up to try the app, or one still
// being prepared, then stays out of search results without anyone having to
// remember to keep it out.
//
// Two things say it. robots.txt asks a crawler not to fetch the pages at all.
// The X-Robots-Tag header, sent with everything, asks a search engine not to
// list a page it has heard of some other way, such as a link on another site.

/**
 * Reads the setting as given to the image build: "yes" lists the host, and
 * "no" or nothing does not. Anything else is refused, so that a slip of the
 * hand does not pass for a choice.
 */
export function isListed(setting: string): boolean {
  const value = setting.trim().toLowerCase();
  if (value === 'yes') return true;
  if (value === '' || value === 'no') return false;
  throw new Error(`"${setting}" does not say whether to be listed: give "yes" or "no"`);
}

/** The robots.txt the host serves. */
export function robotsTxt(listed: boolean): string {
  return ['User-agent: *', listed ? 'Allow: /' : 'Disallow: /', ''].join('\n');
}

/** The nginx line that asks search engines not to list what it is sent with. */
export function nginxListingHeaders(listed: boolean): string {
  const lines = ['# Written by the image build; do not edit.'];
  if (!listed) lines.push('add_header X-Robots-Tag "noindex, nofollow" always;');
  return [...lines, ''].join('\n');
}
