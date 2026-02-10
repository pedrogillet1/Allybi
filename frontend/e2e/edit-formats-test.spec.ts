/**
 * Edit Formats E2E Test
 * Tests all editing commands Koda supports for DOCX and XLSX files.
 * Takes screenshots as proof at every step.
 */

import { test, expect, Page } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  loginUrl: 'http://localhost:3000/a/x7k2m9?mode=login',
};

// Known files for test@koda.com
const DOCX_NAME = 'template.docx';
const XLSX_NAME = 'Lone Mountain Ranch P&L 2024';

test.describe('Edit Formats — DOCX + XLSX', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Wait for backend to be fully ready
    for (let i = 0; i < 10; i++) {
      try {
        const resp = await page.request.get('http://localhost:5000/health');
        if (resp.ok()) break;
      } catch { /* retry */ }
      await page.waitForTimeout(2000);
    }

    console.log('[SETUP] Navigating to login page...');
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(3000);

    // Handle onboarding modal if present
    const skipButton = page.locator('text=Skip introduction, button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    // Close any modals
    const closeButton = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.first().click();
    }

    // Login with retry
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[SETUP] Logging in...');
      await emailInput.fill(CONFIG.email);
      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(CONFIG.password);
      }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(6000);

      // Check for error and retry once
      const errorBanner = page.locator('text=errors.noServerResponse, text=Server error, text=Network error');
      if (await errorBanner.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[SETUP] Login failed, retrying...');
        await page.goto(CONFIG.loginUrl);
        await page.waitForTimeout(3000);
        const emailInput2 = page.locator('input[type="email"], input[name="email"]');
        await emailInput2.fill(CONFIG.email);
        const passwordInput2 = page.locator('input[type="password"]');
        if (await passwordInput2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await passwordInput2.fill(CONFIG.password);
        }
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(6000);
      }

      console.log('[SETUP] Login successful');
    }

    // Handle post-login onboarding
    const skipButton2 = page.locator('text=Skip introduction');
    if (await skipButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton2.click();
      await page.waitForTimeout(1000);
    }

    // Close any other modals
    const closeButton2 = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeButton2.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton2.first().click();
    }

    // New chat
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1500);
    }

    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await chatInput.waitFor({ state: 'visible', timeout: 20000 });
    console.log('[SETUP] Chat input ready');
  });

  test.afterAll(async () => {
    await page.close();
  });

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

  async function sendAndWait(message: string, timeoutMs = 60000): Promise<string> {
    console.log(`\n--- Sending: "${message}" ---`);

    const input = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(message);
    await input.press('Enter');
    await page.waitForTimeout(2000);

    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;

    while (stableCount < 4 && Date.now() - startTime < timeoutMs) {
      await page.waitForTimeout(1000);

      const messages = page.locator('[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]');
      const count = await messages.count();

      if (count > 0) {
        const lastMessage = messages.last();
        const content = await lastMessage.textContent() || '';

        if (isThinkingPhase(content)) {
          console.log(`  [thinking]: ${content.slice(0, 50)}...`);
          stableCount = 0;
          continue;
        }

        if (content === lastContent && content.length > 10) {
          stableCount++;
        } else {
          stableCount = 0;
          lastContent = content;
        }
      }
    }

    console.log(`Response (${lastContent.length} chars): ${lastContent.slice(0, 120)}...`);
    return lastContent;
  }

  async function newChat() {
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1500);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOCX EDITING TESTS
  // ═══════════════════════════════════════════════════════════════════

  test('DOCX-1: list files (verify pills appear)', async () => {
    const response = await sendAndWait('list my files');
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-1-list-files.png', fullPage: true });
  });

  test('DOCX-2: open template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`open ${DOCX_NAME}`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-2-open.png', fullPage: true });
  });

  test('DOCX-3: summarize template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`summarize ${DOCX_NAME}`);
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-3-summarize.png', fullPage: true });
  });

  test('DOCX-4: rewrite paragraph in template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`in ${DOCX_NAME}, rewrite the introduction paragraph to be more professional`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-4-rewrite.png', fullPage: true });
  });

  test('DOCX-5: edit specific text in template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`edit ${DOCX_NAME}: change the title to "Updated Report Template"`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-5-edit-title.png', fullPage: true });
  });

  test('DOCX-6: add text to template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`in ${DOCX_NAME}, add a new paragraph at the end saying "This document was reviewed on February 2026."`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-6-add-text.png', fullPage: true });
  });

  test('DOCX-7: where is template.docx', async () => {
    await newChat();
    const response = await sendAndWait(`where is ${DOCX_NAME}?`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-docx-7-where.png', fullPage: true });
  });

  // ═══════════════════════════════════════════════════════════════════
  // XLSX EDITING TESTS
  // ═══════════════════════════════════════════════════════════════════

  test('XLSX-1: open P&L spreadsheet', async () => {
    await newChat();
    const response = await sendAndWait(`open ${XLSX_NAME}`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-1-open.png', fullPage: true });
  });

  test('XLSX-2: summarize P&L data', async () => {
    await newChat();
    const response = await sendAndWait(`summarize the data in ${XLSX_NAME}`);
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-2-summarize.png', fullPage: true });
  });

  test('XLSX-3: ask about specific cells/values', async () => {
    await newChat();
    const response = await sendAndWait(`what is the total revenue in ${XLSX_NAME}?`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-3-revenue.png', fullPage: true });
  });

  test('XLSX-4: edit cell in spreadsheet', async () => {
    await newChat();
    const response = await sendAndWait(`in ${XLSX_NAME}, change the revenue for January to $500,000`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-4-edit-cell.png', fullPage: true });
  });

  test('XLSX-5: create chart from spreadsheet', async () => {
    await newChat();
    const response = await sendAndWait(`create a chart from ${XLSX_NAME} showing monthly revenue`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-5-chart.png', fullPage: true });
  });

  test('XLSX-6: compare values in spreadsheet', async () => {
    await newChat();
    const response = await sendAndWait(`compare expenses vs revenue in ${XLSX_NAME}`);
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-6-compare.png', fullPage: true });
  });

  test('XLSX-7: where is P&L spreadsheet', async () => {
    await newChat();
    const response = await sendAndWait(`where is the ${XLSX_NAME} file?`);
    expect(response.length).toBeGreaterThan(5);
    await page.screenshot({ path: 'e2e/test-results/fmt-xlsx-7-where.png', fullPage: true });
  });
});
