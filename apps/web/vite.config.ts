import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import {
  SITE_INDEX_PATH,
  siteIndex,
  siteManifest,
  sitePageHtml,
  type SiteIdentity,
} from './src/site/pages.ts';
import { withPolicy } from './src/policy.ts';

// Local HTTPS for testing on a phone (see docs/DEVICE_TESTING.md). The
// certificate is issued by mkcert and lives in apps/web/certs/, which is
// gitignored. When it is absent the dev server stays on plain HTTP, which is
// enough for http://localhost on this machine.
const certDir = resolve(import.meta.dirname, 'certs');
const certFile = resolve(certDir, 'dev.pem');
const keyFile = resolve(certDir, 'dev-key.pem');
const https =
  existsSync(certFile) && existsSync(keyFile)
    ? { cert: readFileSync(certFile), key: readFileSync(keyFile) }
    : undefined;

// Site directories live at the repository root. In production nginx serves them
// under /sites/; in development this plugin maps the same URLs onto the files,
// through Vite's own file serving, which answers range requests for the map
// archive. A site cloned elsewhere and symlinked in is allowed by its real path.
const repoRoot = resolve(import.meta.dirname, '..', '..');
const sitesDir = resolve(repoRoot, 'sites');
const siteRealPaths = existsSync(sitesDir)
  ? readdirSync(sitesDir).map((entry) => realpathSync(resolve(sitesDir, entry)))
  : [];

/** Reads a site's configuration from its directory, or null when it has none. */
function readSite(siteId: string): SiteIdentity | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(siteId)) return null;
  const file = resolve(sitesDir, siteId, 'site.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as SiteIdentity) : null;
}

const serveSites: Plugin = {
  name: 'serve-sites',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? '';
      // The list of sites, and each site's web app manifest below, are written
      // into the image when it is built; here they are produced on request from
      // the same code. Every directory under sites/ that has been built is listed.
      if (url.split('?')[0] === SITE_INDEX_PATH) {
        const all = existsSync(sitesDir) ? readdirSync(sitesDir) : [];
        const configs = all.map(readSite).filter((config) => config !== null);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(siteIndex(configs)));
        return;
      }
      const manifestFor = /^\/sites\/([^/]+)\/manifest\.webmanifest$/.exec(url.split('?')[0] ?? '');
      const site = manifestFor ? readSite(manifestFor[1] ?? '') : null;
      if (site) {
        response.setHeader('Content-Type', 'application/manifest+json');
        response.end(JSON.stringify(siteManifest(site)));
        return;
      }
      if (url.startsWith('/sites/')) {
        request.url = `/@fs${sitesDir}${url.slice('/sites'.length)}`;
      }
      next();
    });
  },
  // The page for a site's map or share link is served named for that site, as
  // the built image serves it. `originalUrl` is the address the browser asked for.
  transformIndexHtml(html, context) {
    const match = /^\/(?:s|p)\/([^/?]+)/.exec(context.originalUrl ?? '');
    const site = match ? readSite(match[1] ?? '') : null;
    return site ? sitePageHtml(html, site) : html;
  },
};

// Vite marks its built <script> and <link> tags `crossorigin`, which makes the
// browser request them in CORS mode. For this same-origin app that is needless,
// and a CORS subresource is not served from the service worker's cache the way a
// same-origin one is — so the app shell fails to load with no network. Dropping
// the attribute lets the worker serve the whole shell offline.
const sameOriginAssets: Plugin = {
  name: 'same-origin-assets',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/ crossorigin/g, ''),
  },
};

// The built page carries the content security policy as a tag (see
// src/policy.ts). The development server's page does not: Vite's live reload
// works by adding scripts and styles to the page, which the policy would refuse.
const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: (html) => withPolicy(html) },
};

// The service worker caches under a version name. Stamping that version with the
// build's content hash means a new deployment changes sw.js, which is what makes
// the browser notice a new worker and the page offer to reload into it. The
// source keeps a `__BUILD_ID__` placeholder that this fills in at build time.
const stampServiceWorker: Plugin = {
  name: 'stamp-service-worker',
  apply: 'build',
  writeBundle(options, bundle) {
    const entry = Object.values(bundle).find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
    const name = entry && entry.type === 'chunk' ? entry.fileName : '';
    const buildId = /-([^.]+)\./.exec(name)?.[1] ?? String(Date.now());
    const swPath = resolve(options.dir ?? 'dist', 'sw.js');
    if (existsSync(swPath)) {
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD_ID__', buildId));
    }
  },
};

// Vite builds and serves the app; the `test` block configures Vitest for this
// workspace (it is read when `npm test` runs from the repository root).
export default defineConfig({
  plugins: [serveSites, sameOriginAssets, contentSecurityPolicy, stampServiceWorker],
  server: {
    // Listen on every interface so a phone on the same network can connect.
    host: true,
    ...(https ? { https } : {}),
    fs: { allow: [repoRoot, ...siteRealPaths] },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The map library alone is most of the bundle; the default warning threshold
    // would fire on every build.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    name: 'web',
    environment: 'node',
  },
});
