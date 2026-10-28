import { defineConfig } from '@playwright/test'

/**
 * Live end-to-end checks against the real stack (API Manager, backend and the
 * Vite dev server must be running). Uses the Microsoft Edge already installed
 * on Windows, so no browser download is needed.
 * Run: npm run e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  outputDir: './e2e-results',
  use: {
    channel: 'msedge',
    baseURL: 'http://localhost:5173',
    // LOCAL ONLY: accept API Manager's self-signed certificate on 9443 and 8243.
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
})
