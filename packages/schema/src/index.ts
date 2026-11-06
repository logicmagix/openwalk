// @openwalk/schema: JSON Schema definitions shared by the data pipeline, which
// validates what it generates, and the app, which consumes it. The schema files
// are the contract; this module only exposes them to TypeScript.

import siteSchema from '../schemas/site.schema.json' with { type: 'json' };
import walkwaysSchema from '../schemas/walkways.schema.json' with { type: 'json' };

export const schemas = {
  site: siteSchema,
  walkways: walkwaysSchema,
} as const;

export type SchemaName = keyof typeof schemas;
