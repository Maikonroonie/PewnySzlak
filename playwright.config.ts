import { defineConfig } from '@playwright/test';

/**
 * Testy end-to-end na wyeksportowanej aplikacji web (apps/mobile/dist) z działającym API (:4000).
 * Uruchomienie: npm run build:web && npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // Testy współdzielą jedną bazę (zgłoszenia) – uruchamiamy je szeregowo.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8099',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 420, height: 900 },
    locale: 'pl-PL',
    permissions: [],
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx serve -s apps/mobile/dist -l 8099 -n', url: 'http://localhost:8099', reuseExistingServer: true, timeout: 30_000 },
});
