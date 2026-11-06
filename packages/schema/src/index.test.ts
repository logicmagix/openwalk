import { describe, expect, it } from 'vitest';
import { schemas } from './index';

describe('schemas', () => {
  it('declare the 2020-12 dialect and an id matching their key', () => {
    for (const [name, schema] of Object.entries(schemas)) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.$id).toBe(`https://openwalk.app/schemas/${name}.schema.json`);
    }
  });
});
