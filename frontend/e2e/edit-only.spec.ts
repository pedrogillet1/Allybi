/**
 * Edit-Only E2E Test
 *
 * Tests ONLY editing operations across DOCX, XLSX, and Slides
 * using REAL files from test@koda.com.
 *
 * Strict assertions: fails if EditSessionCard does NOT render.
 */

import { test, expect, Page } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  loginUrl: 'http://localhost:3000/a/x7k2m9?mode=login',
  backendUrl: 'http://localhost:5000',
};

const RESULTS_DIR = 'e2e/test-results/edit-only';

// ── Real files in test@koda.com ──
const DOCX_FILE = 'Koda AI Testing Suite';
const XLSX_FILE = 'Lone Mountain Ranch P L 2024';
const PPTX_FILE = 'Project Management Presentation';

// ── Thinking / streaming phrases to ignore ──
const THINKING_PHRASES = [
  'Getting the core of it',
  'Turning the question over',
  'Catching your vibe',
  'Okay—thinking out loud',
  'Making sure I',
  'Let me think',
  'Processing',
  'Analyzing',
  'Finding file',
  'Reading',
  'Drafting',
  'Building',
  'Generating',
];

function isThinking(text: string): boolean {
  return THINKING_PHRASES.some(p => text.includes(p));
}

test.describe.serial('Edit-Only — All Formats (Real Files)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // Wait for backend
    for (let i = 0; i < 10; i++) {
      try {
        const resp = await page.request.get(`${CONFIG.backendUrl}/health`);
        if (resp.ok()) break;
      } catch { /* retry */ }
      await page.waitForTimeout(2000);
    }

    console.log('[SETUP] Logging in...');
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(3000);

    // Dismiss onboarding / modals
    const skipBtn = page.locator('text=Skip introduction');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(1000);
    }
    const closeBtn = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.first().click();
    }

    // Login
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await emailInput.fill(CONFIG.email);
      const pwInput = page.locator('input[type="password"]');
      if (await pwInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pwInput.fill(CONFIG.password);
      }
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(6000);

      // Retry on network error
      const errBanner = page.locator('text=errors.noServerResponse, text=Server error, text=Network error');
      if (await errBanner.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[SETUP] Retrying login...');
        await page.goto(CONFIG.loginUrl);
        await page.waitForTimeout(3000);
        await page.locator('input[type="email"], input[name="email"]').fill(CONFIG.email);
        const pw2 = page.locator('input[type="password"]');
        if (await pw2.isVisible({ timeout: 2000 }).catch(() => false)) await pw2.fill(CONFIG.password);
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(6000);
      }
    }

    // Post-login modals
    if (await page.locator('text=Skip introduction').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.locator('text=Skip introduction').click();
      await page.waitForTimeout(1000);
    }
    const close2 = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await close2.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await close2.first().click();
    }

    // Wait for chat input
    await page.waitForTimeout(3000);
    const chatInput = page.locator(
      'textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]'
    );
    await chatInput.waitFor({ state: 'visible', timeout: 30000 });
    console.log('[SETUP] Chat ready');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─── Helpers ─────────────────────────────────────────────────────

  async function sendMessage(message: string): Promise<void> {
    console.log(`\n[SEND] "${message}"`);
    const input = page.locator(
      'textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]'
    );
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(message);
    await input.press('Enter');
  }

  /**
   * Wait for a stable assistant response (non-thinking, non-empty).
   * Returns the text content of the last assistant message.
   */
  async function waitForResponse(timeoutMs = 120_000): Promise<string> {
    const start = Date.now();
    let lastContent = '';
    let stableCount = 0;

    while (stableCount < 4 && Date.now() - start < timeoutMs) {
      await page.waitForTimeout(1500);

      const msgs = page.locator(
        '[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]'
      );
      const count = await msgs.count();
      if (count === 0) continue;

      const content = (await msgs.last().textContent()) || '';
      if (isThinking(content)) {
        console.log(`  [thinking] ${content.slice(0, 60)}…`);
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

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[RECV] ${elapsed}s | ${lastContent.length} chars`);
    return lastContent;
  }

  async function newChat(): Promise<void> {
    const btn = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(3000);
    }
    const chatInput = page.locator(
      'textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]'
    );
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  async function screenshot(name: string): Promise<void> {
    await page.screenshot({ path: `${RESULTS_DIR}/${name}.png`, fullPage: true });
    console.log(`  [screenshot] ${RESULTS_DIR}/${name}.png`);
  }

  /**
   * Core assertion: the EditSessionCard rendered.
   * Checks for .koda-edit-card OR a fallback Confirm/Apply button.
   */
  async function expectEditCard(testName: string): Promise<void> {
    const editCard = page.locator('.koda-edit-card');
    const applyBtn = page.locator(
      '.koda-edit-card__btn--primary, button:has-text("Apply"), button:has-text("Confirm")'
    );

    const cardVisible = await editCard.first().isVisible({ timeout: 8000 }).catch(() => false);
    const btnVisible = await applyBtn.first().isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`  [edit-card] visible: ${cardVisible}, apply-btn: ${btnVisible}`);

    if (!cardVisible && !btnVisible) {
      // Check if the response was a refusal or conversational fallback
      const msgs = page.locator(
        '[data-testid="assistant-message"], .assistant-message, [data-role="assistant"]'
      );
      const lastText = ((await msgs.last().textContent()) || '').toLowerCase();
      const isRefusal = [
        'you can make this change directly',
        'you can make this modification directly',
        'you can make this addition directly',
        'not equipped to modify',
        'cannot edit',
        'cannot modify',
        'unable to edit',
        "can't directly edit",
      ].some(p => lastText.includes(p));

      if (isRefusal) {
        console.log(`  [FAIL] "${testName}": Got conversational refusal instead of EditSessionCard`);
      }
    }

    expect(
      cardVisible || btnVisible,
      `"${testName}": EditSessionCard must render with Apply button`
    ).toBe(true);
  }

  /**
   * Click "Apply (new revision)" and verify success.
   */
  async function applyEdit(testName: string): Promise<string | null> {
    const applyBtn = page.locator(
      '.koda-edit-card__btn--primary, button:has-text("Apply"), button:has-text("Confirm")'
    );
    await expect(applyBtn.first()).toBeVisible({ timeout: 5000 });
    await applyBtn.first().click();
    console.log(`  [action] clicked Apply`);

    await page.waitForTimeout(4000);

    // Check for error
    const errEl = page.locator('.koda-edit-card__error');
    const hasError = await errEl.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasError) {
      const errText = await errEl.textContent();
      console.log(`  [ERROR] Apply failed: ${errText}`);
      return null;
    }

    // Check for "Open revised document" button (success indicator)
    const openBtn = page.locator('button:has-text("Open revised document")');
    const hasOpen = await openBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  [apply] success: ${hasOpen}`);

    return hasOpen ? 'revision-created' : null;
  }

  /**
   * Verify the diff panel shows before/after content.
   */
  async function expectDiffPanel(testName: string): Promise<void> {
    const diff = page.locator('.koda-edit-card__diff');
    const visible = await diff.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  [diff] visible: ${visible}`);

    if (visible) {
      const pres = page.locator('.koda-edit-card__pre');
      const count = await pres.count();
      console.log(`  [diff] before/after panels: ${count}`);
      if (count >= 2) {
        const before = await pres.nth(0).textContent();
        const after = await pres.nth(1).textContent();
        console.log(`  [diff] before: ${(before || '').slice(0, 80)}…`);
        console.log(`  [diff] after:  ${(after || '').slice(0, 80)}…`);
      }
    }
  }

  /**
   * Detect if Koda gave a conversational answer instead of routing to edit.
   */
  function wasConversational(response: string): boolean {
    const lower = response.toLowerCase();
    return [
      'you can make this change directly',
      'you can make this modification directly',
      'you can make this addition directly',
      'you can make these modifications directly',
      'not equipped to modify',
      'cannot edit',
      'unable to edit',
      "can't directly edit",
    ].some(p => lower.includes(p));
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 1: DOCX EDITING
  // ═══════════════════════════════════════════════════════════════════

  test('D01 — DOCX: change title', async () => {
    await newChat();
    await sendMessage(`change the title in ${DOCX_FILE} to "Koda QA Suite — Feb 2026"`);
    const response = await waitForResponse();
    await screenshot('D01-docx-change-title');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('D01-docx-change-title');
    await expectDiffPanel('D01-docx-change-title');
    const result = await applyEdit('D01-docx-change-title');
    await screenshot('D01-docx-change-title-applied');
    expect(result, 'D01: Apply should create a revision').toBeTruthy();
  });

  test('D02 — DOCX: rewrite paragraph formal', async () => {
    await newChat();
    await sendMessage(
      `edit the first paragraph in ${DOCX_FILE}: rewrite it to be more formal and professional`
    );
    const response = await waitForResponse();
    await screenshot('D02-docx-rewrite-formal');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('D02-docx-rewrite-formal');
    await expectDiffPanel('D02-docx-rewrite-formal');
  });

  test('D03 — DOCX: add paragraph', async () => {
    await newChat();
    await sendMessage(
      `add a paragraph at the end of ${DOCX_FILE}: "Verified on February 8, 2026."`
    );
    const response = await waitForResponse();
    await screenshot('D03-docx-add-paragraph');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('D03-docx-add-paragraph');
  });

  test('D04 — DOCX: rewrite in Portuguese', async () => {
    await newChat();
    await sendMessage(
      `edit the introduction in ${DOCX_FILE}: translate it to Portuguese`
    );
    const response = await waitForResponse();
    await screenshot('D04-docx-translate-pt');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('D04-docx-translate-pt');
  });

  test('D05 — DOCX: fix grammar', async () => {
    await newChat();
    await sendMessage(`fix grammar in the first paragraph of ${DOCX_FILE}`);
    const response = await waitForResponse();
    await screenshot('D05-docx-fix-grammar');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('D05-docx-fix-grammar');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 2: XLSX EDITING
  // ═══════════════════════════════════════════════════════════════════

  test('X01 — XLSX: edit single cell', async () => {
    await newChat();
    await sendMessage(`set cell B2 to 525000 in ${XLSX_FILE}`);
    const response = await waitForResponse();
    await screenshot('X01-xlsx-edit-cell');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('X01-xlsx-edit-cell');
    await expectDiffPanel('X01-xlsx-edit-cell');
    const result = await applyEdit('X01-xlsx-edit-cell');
    await screenshot('X01-xlsx-edit-cell-applied');
    expect(result, 'X01: Apply should create a revision').toBeTruthy();
  });

  test('X02 — XLSX: edit range', async () => {
    await newChat();
    await sendMessage(`update range B2:B4 to 180000, 195000, 205000 in ${XLSX_FILE}`);
    const response = await waitForResponse();
    await screenshot('X02-xlsx-edit-range');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('X02-xlsx-edit-range');
    await expectDiffPanel('X02-xlsx-edit-range');
  });

  test('X03 — XLSX: add new sheet', async () => {
    await newChat();
    await sendMessage(`add a new sheet called "Q1 Summary" in ${XLSX_FILE}`);
    const response = await waitForResponse();
    await screenshot('X03-xlsx-add-sheet');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('X03-xlsx-add-sheet');
  });

  test('X04 — XLSX: rename sheet', async () => {
    await newChat();
    await sendMessage(`rename sheet "Sheet1" to "Revenue Data" in ${XLSX_FILE}`);
    const response = await waitForResponse();
    await screenshot('X04-xlsx-rename-sheet');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('X04-xlsx-rename-sheet');
  });

  test('X05 — XLSX: edit cell by column name', async () => {
    await newChat();
    await sendMessage(
      `edit cell A1 in ${XLSX_FILE}: change it to "Monthly Revenue"`
    );
    const response = await waitForResponse();
    await screenshot('X05-xlsx-edit-cell-a1');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    await expectEditCard('X05-xlsx-edit-cell-a1');
  });

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 3: SLIDES EDITING (on existing PPTX)
  // ═══════════════════════════════════════════════════════════════════

  test('S01 — SLIDES: add slide to existing presentation', async () => {
    await newChat();
    await sendMessage(
      `add a new slide to ${PPTX_FILE} with title "Next Steps" and bullet points about timeline`
    );
    const response = await waitForResponse();
    await screenshot('S01-slides-add-slide');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    // Slides edits may render differently — check for edit card OR deck card
    const editCard = page.locator('.koda-edit-card');
    const deckCard = page.locator('.koda-deck-card');
    const editVisible = await editCard.first().isVisible({ timeout: 5000 }).catch(() => false);
    const deckVisible = await deckCard.first().isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`  [slides] edit-card: ${editVisible}, deck-card: ${deckVisible}`);
    expect(
      editVisible || deckVisible,
      'S01: Should show edit card or deck card for slide edit'
    ).toBe(true);
  });

  test('S02 — SLIDES: rewrite slide text', async () => {
    await newChat();
    await sendMessage(
      `rewrite the title slide text in ${PPTX_FILE} to be more executive and concise`
    );
    const response = await waitForResponse();
    await screenshot('S02-slides-rewrite-text');

    if (wasConversational(response)) {
      console.log('  [DIAGNOSTIC] Intent engine did NOT route to editing family');
    }

    const editCard = page.locator('.koda-edit-card');
    const deckCard = page.locator('.koda-deck-card');
    const editVisible = await editCard.first().isVisible({ timeout: 5000 }).catch(() => false);
    const deckVisible = await deckCard.first().isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`  [slides] edit-card: ${editVisible}, deck-card: ${deckVisible}`);
    expect(
      editVisible || deckVisible,
      'S02: Should show edit card or deck card for slide rewrite'
    ).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 4: VERIFY PERSISTENCE (read-back after edits)
  // ═══════════════════════════════════════════════════════════════════

  test('V01 — Verify DOCX title was changed', async () => {
    await newChat();
    await sendMessage(`what is the title of ${DOCX_FILE}?`);
    const response = await waitForResponse();
    await screenshot('V01-verify-docx-title');

    console.log(`  [verify] Response: ${response.slice(0, 200)}`);
    // If D01 succeeded, title should contain "QA Suite" or "Feb 2026"
    // This is a soft check — just logs
    const lower = response.toLowerCase();
    const edited = lower.includes('qa suite') || lower.includes('feb 2026');
    console.log(`  [verify] Title reflects edit: ${edited}`);
  });

  test('V02 — Verify XLSX cell was changed', async () => {
    await newChat();
    await sendMessage(`what is the value in cell B2 of ${XLSX_FILE}?`);
    const response = await waitForResponse();
    await screenshot('V02-verify-xlsx-cell');

    console.log(`  [verify] Response: ${response.slice(0, 200)}`);
    const has525 = response.includes('525000') || response.includes('525,000');
    console.log(`  [verify] Cell reflects edit (525000): ${has525}`);
  });
});
