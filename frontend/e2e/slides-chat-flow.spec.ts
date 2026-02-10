/**
 * Slides Deck – Real Chat Flow E2E
 * Logs into test@koda.com, sends slide-generation prompts, captures screenshots.
 */

import { test, expect, Page } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  loginUrl: 'http://localhost:3000/a/x7k2m9?mode=login',
};

test.describe('Slides Deck – Chat Flow', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Wait for backend
    for (let i = 0; i < 15; i++) {
      try {
        const resp = await page.request.get('http://localhost:5000/health');
        if (resp.ok()) break;
      } catch { /* retry */ }
      await page.waitForTimeout(2000);
    }

    console.log('[SETUP] Navigating to login page...');
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(3000);

    // Dismiss onboarding
    const skipBtn = page.locator('text=Skip introduction');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(1000);
    }

    // Close modals
    const closeBtn = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.first().click();
    }

    // Login
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[SETUP] Logging in...');
      await emailInput.fill(CONFIG.email);
      const pwInput = page.locator('input[type="password"]');
      if (await pwInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pwInput.fill(CONFIG.password);
      }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(6000);

      // Retry on error
      const errBanner = page.locator('text=errors.noServerResponse, text=Server error, text=Network error');
      if (await errBanner.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[SETUP] Login failed, retrying...');
        await page.goto(CONFIG.loginUrl);
        await page.waitForTimeout(3000);
        const em2 = page.locator('input[type="email"], input[name="email"]');
        await em2.fill(CONFIG.email);
        const pw2 = page.locator('input[type="password"]');
        if (await pw2.isVisible({ timeout: 2000 }).catch(() => false)) {
          await pw2.fill(CONFIG.password);
        }
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(6000);
      }

      console.log('[SETUP] Login successful');
    }

    // Post-login modals
    const skipBtn2 = page.locator('text=Skip introduction');
    if (await skipBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn2.click();
      await page.waitForTimeout(1000);
    }
    const closeBtn2 = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeBtn2.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn2.first().click();
    }

    // Wait for chat input — allow extra time for post-login rendering
    await page.waitForTimeout(5000);
    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await chatInput.waitFor({ state: 'visible', timeout: 30000 });
    console.log('[SETUP] Chat input ready');
  });

  test.afterAll(async () => {
    await page.close();
  });

  const STAGE_PHRASES = [
    'Getting the core of it',
    'Turning the question over',
    'Catching your vibe',
    'Okay—thinking out loud',
    'Making sure I',
    'Let me think',
    'Processing',
    'Analyzing',
    'Drafting slide outline',
    'Building the Google Slides deck',
    'Generating slide thumbnails',
    'Finding file',
    'Reading',
  ];

  function isStillProcessing(text: string): boolean {
    return STAGE_PHRASES.some(p => text.includes(p));
  }

  async function sendAndWait(message: string, timeoutMs = 180000): Promise<string> {
    console.log(`\n--- Sending: "${message}" ---`);

    const input = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill(message);
    await input.press('Enter');
    await page.waitForTimeout(3000);

    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;

    while (stableCount < 5 && Date.now() - startTime < timeoutMs) {
      await page.waitForTimeout(3000);

      // Check if deck card appeared — that means we're done
      const deckCard = page.locator('.koda-deck-card');
      if (await deckCard.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log('  [deck card appeared]');
        await page.waitForTimeout(1000); // let thumbnails load
        const msgs = page.locator('[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]');
        const count = await msgs.count();
        lastContent = count > 0 ? (await msgs.last().textContent() || '') : '';
        break;
      }

      const msgs = page.locator('[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]');
      const count = await msgs.count();

      if (count > 0) {
        const lastMsg = msgs.last();
        const content = await lastMsg.textContent() || '';

        if (isStillProcessing(content)) {
          console.log(`  [processing]: ${content.slice(0, 70)}...`);
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

    console.log(`Response (${lastContent.length} chars): ${lastContent.slice(0, 150)}...`);
    return lastContent;
  }

  async function newChat() {
    const btn = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1500);
    }
  }

  // ─── Prompt 1: Single slide ───
  test('Prompt 1: Generate minimalist first slide for Allybi', async () => {
    const response = await sendAndWait(
      'Generate a minimalist first slide black and white introducing Allybi'
    );
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/slides-chat-1-single-slide.png', fullPage: true });

    // Check for deck card or slide-related content
    const deckCard = page.locator('.koda-deck-card');
    const hasDeck = await deckCard.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('  Deck card visible:', hasDeck);
    if (hasDeck) {
      await page.screenshot({ path: 'e2e/test-results/slides-chat-1-deck-card.png', fullPage: true });
    }
  });

  // ─── Prompt 2: Full pitch deck ───
  test('Prompt 2: Create 8-slide pitch deck for Allybi', async () => {
    await newChat();
    const response = await sendAndWait(
      'Create an 8-slide pitch deck for Allybi. Minimal, black/white, strong typography.'
    );
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/slides-chat-2-pitch-deck.png', fullPage: true });

    const deckCard = page.locator('.koda-deck-card');
    const hasDeck = await deckCard.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('  Deck card visible:', hasDeck);
    if (hasDeck) {
      const title = await deckCard.locator('.koda-deck-card__title').textContent();
      console.log('  Deck title:', title);
      const thumbs = await deckCard.locator('.koda-deck-card__thumb img').count();
      console.log('  Thumbnails:', thumbs);
      await page.screenshot({ path: 'e2e/test-results/slides-chat-2-deck-card.png', fullPage: true });
    }
  });

  // ─── Prompt 3: From existing file ───
  test('Prompt 3: Generate presentation from existing file', async () => {
    await newChat();
    const response = await sendAndWait(
      'Using file Koda_AI_Testing_Suite_30_Questions (1).docx generate a 10-slide presentation summarizing it (title + key bullets + 1 chart slide if applicable).'
    );
    expect(response.length).toBeGreaterThan(10);
    await page.screenshot({ path: 'e2e/test-results/slides-chat-3-from-file.png', fullPage: true });

    const deckCard = page.locator('.koda-deck-card');
    const hasDeck = await deckCard.isVisible({ timeout: 5000 }).catch(() => false);
    console.log('  Deck card visible:', hasDeck);
    if (hasDeck) {
      const thumbs = await deckCard.locator('.koda-deck-card__thumb img').count();
      console.log('  Thumbnails:', thumbs);
      await page.screenshot({ path: 'e2e/test-results/slides-chat-3-deck-card.png', fullPage: true });
    }
  });
});
