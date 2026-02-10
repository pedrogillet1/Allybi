/**
 * Edit/Creation E2E Test
 * Tests editing functionality across different query types
 */

import { test, expect, Page } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  loginUrl: 'http://localhost:3000/a/x7k2m9?mode=login',
};

test.describe('Edit/Creation Tests', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to login page
    console.log('[SETUP] Navigating to login page...');
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(2000);

    // Handle onboarding modal if present
    const skipButton = page.locator('text=Skip introduction, button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    // Close any other modals
    const closeButton = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.first().click();
    }

    // Check if need to login
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[SETUP] Logging in as test@koda.com...');
      await emailInput.fill(CONFIG.email);

      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(CONFIG.password);
      }

      const loginButton = page.locator('button[type="submit"]');
      await loginButton.click();

      // Wait for chat to load
      await page.waitForTimeout(5000);
      console.log('[SETUP] Login successful');
    }

    // Handle onboarding modal AGAIN after login
    const skipButton2 = page.locator('text=Skip introduction');
    if (await skipButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton2.click();
      await page.waitForTimeout(1000);
    }

    // Start new chat
    console.log('[SETUP] Creating new conversation...');
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    // Wait for chat input to be ready
    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[SETUP] Chat input ready');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Thinking phase indicators to skip
  const THINKING_PHRASES = [
    'Getting the core of it',
    'Turning the question over',
    'Catching your vibe',
    'Okay—thinking out loud',
    'Making sure I',
    'Let me think',
    'Processing',
    'Analyzing',
  ];

  function isThinkingPhase(text: string): boolean {
    return THINKING_PHRASES.some(phrase => text.includes(phrase));
  }

  async function sendAndWait(message: string): Promise<string> {
    console.log(`\n--- Sending: "${message}" ---`);

    // Find and fill input
    const input = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(message);

    // Press Enter to send
    await input.press('Enter');

    // Wait for response to start
    await page.waitForTimeout(2000);

    // Wait for streaming to complete (skip thinking phases)
    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;

    while (stableCount < 4 && Date.now() - startTime < 60000) {
      await page.waitForTimeout(1000);

      // Get all assistant messages and take the last one
      const messages = page.locator('[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]');
      const count = await messages.count();

      if (count > 0) {
        const lastMessage = messages.last();
        const content = await lastMessage.textContent() || '';

        // Skip if still in thinking phase
        if (isThinkingPhase(content)) {
          console.log(`  [thinking]: ${content.slice(0, 40)}...`);
          stableCount = 0;
          continue;
        }

        if (content === lastContent && content.length > 20) {
          stableCount++;
        } else {
          stableCount = 0;
          lastContent = content;
        }
      }
    }

    console.log(`Response (${lastContent.length} chars): ${lastContent.slice(0, 100)}...`);
    return lastContent;
  }

  test('1. list my files', async () => {
    const response = await sendAndWait('list my files');
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/edit-1-list.png' });
  });

  test('2. where is budget file', async () => {
    const response = await sendAndWait('where is my budget file?');
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/edit-2-locate.png' });
  });

  test('3. summarize documents', async () => {
    const response = await sendAndWait('summarize the budget data');
    expect(response.length).toBeGreaterThan(20);
    await page.screenshot({ path: 'e2e/test-results/edit-3-summarize.png' });
  });

  test('4. edit paragraph', async () => {
    const response = await sendAndWait('rewrite the introduction to be more concise');
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/edit-4-edit.png' });
  });

  test('5. create chart', async () => {
    const response = await sendAndWait('create a chart from the revenue data');
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/edit-5-chart.png' });
  });

  test('6. hello greeting', async () => {
    const response = await sendAndWait('hello');
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/edit-6-greeting.png' });
  });
});
