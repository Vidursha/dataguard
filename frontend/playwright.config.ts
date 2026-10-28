import { defineConfig } from '@playwright/test'

/**
 * Live end-to-end checks against the real system. API Manager, the backend
 * and the Vite dev server must all be running. It uses the Microsoft Edge that
 * Windows already has, so there's no browser to download.
 * Run it with: npm run e2e
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
    // LOCAL ONLY: accept API Manager's self-signed certificate on ports 9443 and 8243.
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
  },
})
