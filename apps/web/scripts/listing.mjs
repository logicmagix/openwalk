// Writes what tells search engines whether they may list the host.
//
//   node apps/web/scripts/listing.mjs <robots-file> <headers-file>
//
// The LISTED environment variable decides: "yes" lets search engines list the
// host, and "no" or nothing keeps it out of them. The first file is the
// robots.txt the host serves; the second holds the nginx line for the header
// that goes with everything the server sends, or nothing when the host is
// listed. Node runs the TypeScript module directly, ignoring its type
// annotations.

import { writeFileSync } from 'node:fs';
import { isListed, nginxListingHeaders, robotsTxt } from '../src/listing.ts';

const [robotsFile, headersFile] = process.argv.slice(2);
if (!robotsFile || !headersFile) {
  console.error('usage: listing.mjs <robots-file> <headers-file>');
  process.exit(2);
}
const listed = isListed(process.env.LISTED ?? '');
writeFileSync(robotsFile, robotsTxt(listed));
writeFileSync(headersFile, nginxListingHeaders(listed));
console.log(
  listed
    ? `search engines may list this host: ${robotsFile} lets them in`
    : `search engines are asked not to list this host: ${robotsFile} and ${headersFile}`,
);
