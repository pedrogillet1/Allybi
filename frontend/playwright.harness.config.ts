import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load E2E environment variables (optional).
dotenv.config({ path: '.env.e2e' });

// Harness config: does NOT auto-start the dev server.
// The wrapper script is responsible for starting/stopping the frontend.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: parseInt(process.env.E2E_MAX_WORKERS || '6'),
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'e2e/reports/html' }],
    ['json', { outputFile: 'e2e/reports/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  timeout: 300000,
  expect: {
    timeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'e2e/test-results',
});

