import { defineConfig, devices } from '@playwright/test';

// FV_PLAYWRIGHT_CHANNEL may name an installed browser (msedge, chrome) instead of the
// Chromium that `npx playwright install` downloads; see .env.example.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: the defaults apply.
}
const channel = process.env.FV_PLAYWRIGHT_CHANNEL?.trim() ?? '';
const ci = Boolean(process.env.CI);

// A port of its own, so the tests never reuse some other app's dev or preview server.
const PORT = 4317;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The scene then draws each frame's end state at once; one test turns motion back on.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel === '' ? {} : { channel }) },
    },
  ],
  webServer: {
    // CI builds in its own step; locally the tests build what they test.
    command: `${ci ? '' : 'npm run build && '}npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
