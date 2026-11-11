// End-to-end tests: a real browser drives the built app the way a person would.
//
// The tests expect the app to be running already, as the image built by
// deploy/compose.yaml serves it:
//
//   docker compose -f deploy/compose.yaml up --build -d
//   npm run test:e2e
//
// E2E_BASE_URL points the tests at another address, and E2E_SITE at another
// site, whose directory under sites/ the tests read for places to search for.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // A test that needs a retry to pass is hiding a fault, except on CI machines,
  // where a slow start is not the app's doing.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    // Keep a recording of what the browser did when a test fails.
    trace: 'retain-on-failure',
  },
  // Phones are what the app is for. Two engines: the one behind Chrome on
  // Android, and WebKit, the engine behind Safari on iPhone.
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
