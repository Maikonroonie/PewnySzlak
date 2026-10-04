import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './launch-tests',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:launch',
    url: 'http://127.0.0.1:8090',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
