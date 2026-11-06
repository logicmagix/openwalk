import { defineConfig } from 'vitest/config';

// One `npm test` at the repository root runs every workspace as a separate
// Vitest project. Each project picks up its own vite.config.ts or
// vitest.config.ts, so the browser app and the pure packages can differ.
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
  },
});
