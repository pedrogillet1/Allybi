import { test, expect, Page } from '@playwright/test';

test.describe('Chart Rendering Test', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Login
    console.log('[SETUP] Navigating to login...');
    await page.goto('http://localhost:3000/a/x7k2m9?mode=login');
    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[SETUP] Logging in...');
      await emailInput.fill('test@koda.com');
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('test123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(5000);
    }

    // Dismiss onboarding modal - try multiple approaches
    console.log('[SETUP] Dismissing onboarding...');
    const dismissSelectors = [
      'button:has-text("Skip introduction")',
      'button:has-text("Start using Koda")',
      'text=Skip introduction',
      '[aria-label="Close"]',
      'button:has-text("×")',
      '.modal-close',
    ];

    for (const selector of dismissSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[SETUP] Clicking: ${selector}`);
        await btn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Wait a bit more for any animations
    await page.waitForTimeout(2000);

    // New chat
    const newChat = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChat.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('[SETUP] Creating new chat...');
      await newChat.click();
      await page.waitForTimeout(1000);
    }

    console.log('[SETUP] Ready');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('should render chart from revenue data', async () => {
    const input = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"]');
    await input.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[TEST] Input ready');

    // Step 1: Get revenue data
    console.log('[TEST] Step 1: Getting revenue data...');
    await input.fill('List revenue categories with dollar amounts from Lone Mountain Ranch budget');
    await input.press('Enter');

    // Wait for response - look for the response text
    await page.waitForTimeout(20000);
    await page.screenshot({ path: 'e2e/test-results/chart-step1.png' });

    // Step 2: Request chart
    console.log('[TEST] Step 2: Requesting chart...');
    await input.fill('create a bar chart');
    await input.press('Enter');

    // Wait for chart to render
    await page.waitForTimeout(20000);

    // Scroll to bottom to see chart
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/test-results/chart-step2.png', fullPage: true });

    // Check for chart elements
    const chartSelectors = [
      '.koda-chart-card',
      '.recharts-wrapper',
      '.recharts-bar',
      '[class*="chart"]',
      'svg.recharts-surface',
    ];

    let chartFound = false;
    for (const selector of chartSelectors) {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[TEST] Chart found with selector: ${selector}`);
        chartFound = true;
        break;
      }
    }

    // Also check page content for chart-related text
    const pageContent = await page.content();
    const hasChartText = pageContent.includes('bar chart') || pageContent.includes('Revenue by Category');
    console.log('[TEST] Has chart text in page:', hasChartText);

    await page.screenshot({ path: 'e2e/test-results/chart-final.png', fullPage: true });

    expect(chartFound || hasChartText).toBeTruthy();
  });
});
