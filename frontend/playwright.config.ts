import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load E2E environment variables
dotenv.config({ path: '.env.e2e' });

export default defineConfig({
  testDir: './e2e',

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL EXECUTION - Each shard runs in its own worker
  // ═══════════════════════════════════════════════════════════════════════════
  fullyParallel: true,
  workers: parseInt(process.env.E2E_MAX_WORKERS || '6'),

  // CI/Local settings
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTING - Generate comprehensive artifacts
  // ═══════════════════════════════════════════════════════════════════════════
  reporter: [
    ['html', { open: 'never', outputFolder: 'e2e/reports/html' }],
    ['json', { outputFile: 'e2e/reports/results.json' }],
    ['list'], // Show progress in console
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // BROWSER SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    // Trace, screenshot, video for debugging failures
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Permissions
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMEOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  timeout: 300000, // 5 minute timeout per test (shard)
  expect: {
    timeout: 30000, // 30 second expect timeout
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ═══════════════════════════════════════════════════════════════════════════
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Optionally test Firefox and Safari
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // WEB SERVER - Start frontend if not already running
  // ═══════════════════════════════════════════════════════════════════════════
  webServer: {
    command: 'npm run start',
    url: process.env.E2E_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTPUT DIRECTORY
  // ═══════════════════════════════════════════════════════════════════════════
  outputDir: 'e2e/test-results',
});
