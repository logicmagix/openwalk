import { defineConfig } from 'vitest/config';

// Vite builds and serves the app; the `test` block configures Vitest for this
// workspace (it is read when `npm test` runs from the repository root).
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    name: 'web',
    environment: 'node',
  },
});
