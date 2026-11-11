// Writes the nginx lines that send the content security policy as a header.
//
//   node apps/web/scripts/security-headers.mjs <output-file>
//
// The policy has one source, src/policy.ts, which also puts it in the page.
// Node runs that TypeScript module directly, ignoring its type annotations.

import { writeFileSync } from 'node:fs';
import { nginxHeaders } from '../src/policy.ts';

const [output] = process.argv.slice(2);
if (!output) {
  console.error('usage: security-headers.mjs <output-file>');
  process.exit(2);
}
writeFileSync(output, nginxHeaders());
console.log(`content security policy header written to ${output}`);
