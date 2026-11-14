// Writes the nginx lines that send the security headers.
//
//   node apps/web/scripts/security-headers.mjs <policy-file> <transport-file>
//
// The content security policy has one source, src/policy.ts, which also puts it
// in the page; it goes with the pages. The strict transport security header
// takes its value from the HSTS environment variable and goes with everything
// the server sends; an empty value leaves it out.
// Node runs that TypeScript module directly, ignoring its type annotations.

import { writeFileSync } from 'node:fs';
import { nginxHeaders, nginxTransportHeaders } from '../src/policy.ts';

const [policyFile, transportFile] = process.argv.slice(2);
if (!policyFile || !transportFile) {
  console.error('usage: security-headers.mjs <policy-file> <transport-file>');
  process.exit(2);
}
writeFileSync(policyFile, nginxHeaders());
console.log(`content security policy header written to ${policyFile}`);
const hsts = process.env.HSTS ?? '';
writeFileSync(transportFile, nginxTransportHeaders(hsts));
console.log(
  hsts.trim() === ''
    ? `no strict transport security header: ${transportFile} is empty`
    : `strict transport security header (${hsts.trim()}) written to ${transportFile}`,
);
