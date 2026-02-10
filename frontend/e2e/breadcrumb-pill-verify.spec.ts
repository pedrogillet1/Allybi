/**
 * Breadcrumb Pill Button Verification
 *
 * Logs in as test@koda.com, sends a "locate file" query,
 * and screenshots the breadcrumb rendering to verify pill buttons.
 */
import { test, expect, Page } from '@playwright/test';

const LOGIN_URL = '/a/x7k2m9?mode=login';
const CHAT_URL = '/c/k4r8f5';
const RESPONSE_TIMEOUT = 90_000;

const SEL = {
  chatInput: 'textarea[data-chat-input]',
  assistantMsg: '[data-testid="msg-assistant"]',
  sourcePill: '.koda-source-pill',
};

async function login(page: Page) {
  await page.goto(LOGIN_URL);
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill('test@koda.com');

  const passwordInput = page.locator('input[type="password"], input[name="password"]');
  await passwordInput.fill('test123');

  const loginBtn = page.locator('button[type="submit"]');
  await loginBtn.click();

  await page.waitForURL(/\/c\//, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

async function sendMessage(page: Page, text: string) {
  const input = page.locator(SEL.chatInput);
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill(text);
  await page.keyboard.press('Enter');
}

async function waitForResponse(page: Page, msgIndex: number) {
  const msg = page.locator(SEL.assistantMsg).nth(msgIndex);
  await msg.waitFor({ state: 'visible', timeout: RESPONSE_TIMEOUT });

  let lastText = '';
  let stableCount = 0;
  const start = Date.now();

  while (Date.now() - start < RESPONSE_TIMEOUT) {
    const text = (await msg.textContent()) || '';
    const isThinking = text.includes('Thinking') || text.includes('Searching') || text.includes('Analyzing') || text.length < 5;
    if (!isThinking && text === lastText) {
      stableCount++;
      if (stableCount >= 3) break;
    } else {
      stableCount = 0;
    }
    lastText = text;
    await page.waitForTimeout(1500);
  }

  // Extra wait for any pills/attachments to render
  await page.waitForTimeout(2000);
}

async function newChat(page: Page) {
  // Use the button or data-testid variant; force click to bypass overlay
  const btn = page.locator('button:has-text("New Chat"), [data-testid="new-chat"], [aria-label="New chat"]').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
  }
}

test.describe('Breadcrumb Pill Verification', () => {

  test('Locate file breadcrumb uses pill buttons', async ({ page }) => {
    await login(page);
    await page.goto(CHAT_URL);
    await page.waitForLoadState('networkidle');
    await newChat(page);

    // Ask to locate a file
    await sendMessage(page, 'Where is the Koda AI Testing Suite file located? Show me the folder path.');
    await waitForResponse(page, 0);

    // Screenshot the full chat area
    await page.screenshot({
      path: 'e2e/test-results/breadcrumb-pill-locate.png',
      fullPage: false,
    });

    // Check for pill buttons in the response
    const assistantMsg = page.locator(SEL.assistantMsg).nth(0);
    const pills = assistantMsg.locator(SEL.sourcePill);
    const pillCount = await pills.count();

    console.log(`[BREADCRUMB TEST] Found ${pillCount} pill buttons in response`);

    // Screenshot just the assistant message for a closer look
    if (await assistantMsg.isVisible()) {
      await assistantMsg.screenshot({
        path: 'e2e/test-results/breadcrumb-pill-message.png',
      });
    }

    // Log pill labels
    for (let i = 0; i < pillCount; i++) {
      const label = await pills.nth(i).textContent();
      console.log(`  Pill ${i + 1}: "${label?.trim()}"`);
    }
  });

  test('File listing breadcrumb uses pill buttons', async ({ page }) => {
    await login(page);
    await page.goto(CHAT_URL);
    await page.waitForLoadState('networkidle');
    await newChat(page);

    // Ask to list files
    await sendMessage(page, 'List all my files');
    await waitForResponse(page, 0);

    // Screenshot
    await page.screenshot({
      path: 'e2e/test-results/breadcrumb-pill-listing.png',
      fullPage: false,
    });

    const assistantMsg = page.locator(SEL.assistantMsg).nth(0);
    const pills = assistantMsg.locator(SEL.sourcePill);
    const pillCount = await pills.count();
    console.log(`[FILE LISTING TEST] Found ${pillCount} pill buttons in listing`);

    if (await assistantMsg.isVisible()) {
      await assistantMsg.screenshot({
        path: 'e2e/test-results/breadcrumb-pill-listing-msg.png',
      });
    }
  });
});
