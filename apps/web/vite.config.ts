import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

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

// Vite builds and serves the app; the `test` block configures Vitest for this
// workspace (it is read when `npm test` runs from the repository root).
export default defineConfig({
  server: {
    // Listen on every interface so a phone on the same network can connect.
    host: true,
    ...(https ? { https } : {}),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    name: 'web',
    environment: 'node',
  },
});
