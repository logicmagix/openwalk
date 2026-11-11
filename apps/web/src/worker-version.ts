// The service worker's version: what makes a phone notice a new deployment.
//
// A browser replaces a service worker only when the worker's file changes by at
// least one byte. The worker keeps everything it has saved under its version
// and answers from that copy first, so the version has to change whenever
// anything the app serves changes: a script, a stylesheet, a page, or a site's
// places, walkways and base map. Stamping it with a fingerprint of all of those
// files does that. This module imports nothing, so the build script can run it
// directly.

/** One served file: its path and a digest of its bytes. */
export type FileDigest = readonly [path: string, digest: string];

/**
 * A text listing of the files, one per line, the same whatever order they were
 * found in. Hashing this listing gives the fingerprint of the whole set.
 */
export function listing(files: readonly FileDigest[]): string {
  return files
    .map(([path, digest]) => `${digest}  ${path}\n`)
    .sort()
    .join('');
}

// The line in sw.js that holds the version, whether still the placeholder from
// the source or a value from an earlier stamp.
const VERSION_LINE = /const VERSION = '[^']*';/;

/** The worker's source with its version set. */
export function stampWorker(source: string, version: string): string {
  if (!VERSION_LINE.test(source)) throw new Error('the worker has no VERSION line to stamp');
  return source.replace(VERSION_LINE, `const VERSION = '${version}';`);
}
