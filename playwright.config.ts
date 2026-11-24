import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Every E2E run is recorded: the video is the "recorded feature run" evidence QA checks before merge.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORT}`, video: 'on', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: `PORT=${PORT} npx tsx src/server.ts`, url: `http://127.0.0.1:${PORT}/health`, reuseExistingServer: false },
});
