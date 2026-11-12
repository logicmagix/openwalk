// The privacy page reads the same for every site. Reached from a site's map
// (as /privacy/?site=<site-id>), it adds two things: a way back to that map,
// and who runs it, when the site's settings say.

const siteId = new URLSearchParams(location.search).get('site') ?? '';

async function showSite() {
  // A site id is lower-case letters, digits and hyphens; anything else is ignored.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(siteId)) return;
  const response = await fetch(`/sites/${siteId}/site.json`);
  if (!response.ok) return;
  const site = await response.json();

  document.getElementById('back').href = `/s/${siteId}/`;

  const operator = site.operator;
  if (!operator || typeof operator.name !== 'string') return;
  // textContent, never innerHTML: a site's settings are shown as text only.
  document.getElementById('operator-name').textContent =
    `${site.name} on OpenWalk is run by ${operator.name}.`;

  const contact = document.getElementById('operator-contact');
  const links = [];
  if (typeof operator.email === 'string') {
    links.push({ href: `mailto:${operator.email}`, text: operator.email });
  }
  if (typeof operator.url === 'string' && /^https:\/\//.test(operator.url)) {
    links.push({ href: operator.url, text: operator.url.replace(/^https:\/\//, '') });
  }
  if (links.length > 0) {
    contact.append('Contact: ');
    links.forEach((link, index) => {
      if (index > 0) contact.append(', ');
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.rel = 'noopener';
      anchor.textContent = link.text;
      contact.append(anchor);
    });
    contact.hidden = false;
  }
  document.getElementById('operator').hidden = false;
}

showSite().catch(() => {
  // Without the site's settings the page still says everything that matters.
});
