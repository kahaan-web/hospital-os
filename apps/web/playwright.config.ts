import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium-only smoke. Browsers are not installed and this project is not executed
 * during Phase A test authoring. Point it at a web server that is already on port 3400.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3400',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
