import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

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

const serveSites: Plugin = {
  name: 'serve-sites',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const url = request.url ?? '';
      if (url.startsWith('/sites/')) {
        request.url = `/@fs${sitesDir}${url.slice('/sites'.length)}`;
      }
      next();
    });
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
  plugins: [serveSites, sameOriginAssets, stampServiceWorker],
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
