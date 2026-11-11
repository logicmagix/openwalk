// Stamps the service worker with a fingerprint of everything the app serves.
//
//   node apps/web/scripts/stamp-worker.mjs <dist-dir> [<sites-dir>]
//
// The fingerprint covers every file under <dist-dir> except the worker itself,
// and every file under <sites-dir> when one is given. A phone that has the app
// saved offers to reload into a new version when this value changes, so it must
// change with a site's data as well as with the app's code. Run it last, after
// anything else that writes into those directories.
// Node runs the TypeScript module below directly, ignoring its type annotations.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { listing, stampWorker } from '../src/worker-version.ts';

const WORKER = 'sw.js';

const [distDir, sitesDir] = process.argv.slice(2);
if (!distDir) {
  console.error('usage: stamp-worker.mjs <dist-dir> [<sites-dir>]');
  process.exit(2);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Every file under `root` as [label/relative/path, digest of its bytes]. */
function digests(root, label) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((path) => [
      `${label}/${relative(root, path).split(sep).join('/')}`,
      sha256(readFileSync(path)),
    ]);
}

const files = digests(distDir, 'app').filter(([path]) => path !== `app/${WORKER}`);
if (sitesDir) files.push(...digests(sitesDir, 'sites'));

const version = sha256(listing(files)).slice(0, 12);
const workerPath = join(distDir, WORKER);
writeFileSync(workerPath, stampWorker(readFileSync(workerPath, 'utf8'), version));
console.log(`service worker stamped ${version} from ${files.length} files`);
