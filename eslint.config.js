// ESLint "flat config": an array of config objects, applied in order.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // Build output, dependencies, and site data are never linted.
    ignores: ['**/node_modules/', '**/dist/', '**/coverage/', '**/.venv/', 'sites/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The app, and the two small scripts that are served as they are.
    files: ['apps/web/**/*.ts', 'apps/web/public/privacy/*.js', 'apps/web/public/theme.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The service worker runs in its own global scope (self, caches, clients).
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } },
  },
  {
    // Configuration files, build scripts and browser tests run in Node, not the browser.
    files: ['**/*.config.{js,ts}', 'apps/web/scripts/*.mjs', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  // Must come last: turns off every rule that would fight Prettier's formatting.
  prettier,
);
