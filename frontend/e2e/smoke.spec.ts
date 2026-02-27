import { test, expect } from '@playwright/test';

test('app loads login page', async ({ page }) => {
  await page.goto('/');
  // Should redirect to login or show main app
  await expect(page.locator('body')).toBeVisible();
});

test('documents page loads without JS errors', async ({ page }) => {
  // This verifies the build works and no missing imports crash the page
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/documents');
  // Allow redirects to login
  await page.waitForTimeout(2000);
  expect(errors.filter((e) => !e.includes('401'))).toHaveLength(0);
});
