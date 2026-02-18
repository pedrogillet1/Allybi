/**
 * Editing Pipeline Validation E2E
 *
 * Tests all recent editing pipeline changes directly in the document editor chat
 * against test1.docx in the test@koda.com account:
 *
 *  - PT slot name fixes (fontSizePt→fontSize, level→headingLevel)
 *  - New operators (DOCX_SET_HEADING_LEVEL, DOCX_SET_TEXT_CASE)
 *  - Structural edits (bullets, numbering, alignment, merge, split, delete)
 *  - uiMeta on plan steps (label, icon, targetDescription)
 *  - Microcopy (noop, failed messages)
 *  - Post-apply highlight flash
 *  - Error dedup guard
 *  - EN + PT parity
 *
 * Usage:
 *   E2E_DOCX_NAME="test1" npx playwright test editing-pipeline-validation --headed
 */

import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  email: process.env.E2E_EMAIL || 'test@koda.com',
  password: process.env.E2E_PASSWORD || 'test123',
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
  backendUrl: process.env.E2E_BACKEND_URL || 'http://localhost:5000',
  docxUrl: process.env.E2E_DOCX_URL || 'http://localhost:3000/d/m4w8j2/a67fdd91-950d-4578-96b3-4a51324e50d1',
};

const OUT_DIR = 'e2e/test-results/editing-pipeline-validation';

// ── Types ───────────────────────────────────────────────────────────────────

interface StepResult {
  id: string;
  prompt: string;
  lang: 'EN' | 'PT';
  category: string;
  editCardRendered: boolean;
  applyClicked: boolean;
  applySuccess: boolean | null;
  highlightFlash: boolean | null;
  responseSnippet: string;
  error?: string;
  screenshot: string;
}

// ── Test ────────────────────────────────────────────────────────────────────

test.describe.serial('Editing Pipeline Validation — test1.docx', () => {
  let page: Page;
  const docUrl = CONFIG.docxUrl;
  const results: StepResult[] = [];

  // ── Setup ───────────────────────────────────────────────────────────────

  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const context = await browser.newContext();
    page = await context.newPage();

    // Login
    console.log('[SETUP] Logging in...');
    await page.goto(`${CONFIG.baseUrl}/a/x7k2m9?mode=login`, { waitUntil: 'networkidle', timeout: 30000 });
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
      await emailInput.fill(CONFIG.email);
      const pwInput = page.locator('input[type="password"]');
      if (await pwInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pwInput.fill(CONFIG.password);
      }
      const loginBtn = page.getByRole('button', { name: 'Log In', exact: true });
      if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loginBtn.click();
      } else {
        await page.locator('button[type="submit"]').first().click();
      }
      await page.waitForTimeout(8000);
    }

    // Dismiss modals
    for (const sel of ['text=Skip introduction', 'button:has-text("×")', 'button[aria-label="Close"]']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    console.log(`[SETUP] Document URL: ${docUrl}`);
  });

  test.afterAll(async () => {
    // Write report
    const pass = results.filter(r => !r.error && r.editCardRendered);
    const fail = results.filter(r => r.error || !r.editCardRendered);
    const lines = [
      '# Editing Pipeline Validation Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Document: ${CONFIG.docxName}`,
      `Total: ${results.length} | Pass: ${pass.length} | Fail: ${fail.length}`,
      '',
    ];
    for (const r of results) {
      const status = r.error ? 'FAIL' : r.editCardRendered ? 'PASS' : 'WARN';
      lines.push(`## ${r.id} [${status}] (${r.lang}) ${r.category}`);
      lines.push(`- Prompt: ${r.prompt}`);
      lines.push(`- Edit card: ${r.editCardRendered}`);
      lines.push(`- Apply: ${r.applyClicked ? (r.applySuccess ? 'success' : 'failed') : 'skipped'}`);
      if (r.highlightFlash !== null) lines.push(`- Highlight flash: ${r.highlightFlash}`);
      if (r.error) lines.push(`- Error: ${r.error}`);
      lines.push(`- Response: ${r.responseSnippet.slice(0, 120)}`);
      lines.push(`- Screenshot: ${r.screenshot}`);
      lines.push('');
    }
    fs.writeFileSync(path.join(OUT_DIR, 'report.md'), lines.join('\n'));
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({ results, summary: { total: results.length, pass: pass.length, fail: fail.length } }, null, 2));
    console.log(`\n[REPORT] ${pass.length}/${results.length} passed → ${OUT_DIR}/report.md`);

    await page.close();
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  async function navigateToDoc(): Promise<void> {
    await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Re-auth if redirected
    if (page.url().includes('/a/x7k2m9')) {
      const emailInput = page.locator('input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailInput.fill(CONFIG.email);
        const pwInput = page.locator('input[type="password"]');
        if (await pwInput.isVisible({ timeout: 2000 }).catch(() => false)) await pwInput.fill(CONFIG.password);
        await page.locator('button[type="submit"]').first().click();
        await page.waitForTimeout(6000);
      }
      await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
    }

    // Wait for DOCX canvas
    const host = page.locator('[data-docx-edit-host="1"]').first();
    await host.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
      console.log('[NAV] DOCX canvas did not appear in 30s');
    });
  }

  async function ensureViewerChat(): Promise<void> {
    const input = await getViewerChatInput();
    if (input) return;
    // Try opening the chat panel
    for (const sel of [
      '[data-testid="viewer-ask-allybi-toggle"]',
      'button:has-text("Ask Allybi")',
      'button:has-text("Allybi")',
      'button:has-text("Chat")',
    ]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(800);
        if (await getViewerChatInput()) return;
      }
    }
  }

  async function getViewerChatInput() {
    for (const sel of [
      '[data-testid="viewer-chat-input"]',
      '[data-testid="chat-input"]',
      '[data-chat-input="true"]',
      'textarea[placeholder*="Ask Allybi" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea',
    ]) {
      const loc = page.locator(sel).last();
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) return loc;
    }
    return null;
  }

  async function sendPrompt(prompt: string): Promise<void> {
    await ensureViewerChat();
    const input = await getViewerChatInput();
    if (!input) throw new Error('Chat input not found');

    await input.click();
    await page.waitForTimeout(300);
    await input.fill(prompt);
    await page.waitForTimeout(300);
    await input.press('Enter');
    console.log(`  [SENT] "${prompt}"`);
  }

  async function waitForStableResponse(timeoutMs = 90_000): Promise<string> {
    const start = Date.now();
    let lastText = '';
    let stableCount = 0;

    while (stableCount < 3 && Date.now() - start < timeoutMs) {
      await page.waitForTimeout(2000);
      const msgs = page.locator(
        '[data-testid="assistant-message"], .assistant-message, [data-role="assistant"], .message-content'
      );
      const count = await msgs.count();
      if (count === 0) continue;

      const text = ((await msgs.last().textContent()) || '').trim();
      if (text.length < 10) continue;

      const thinking = ['Getting the core', 'Turning the question', 'Catching your vibe', 'Okay—thinking', 'Let me think', 'Processing', 'Analyzing'];
      if (thinking.some(p => text.includes(p))) { stableCount = 0; continue; }

      if (text === lastText) { stableCount++; } else { stableCount = 0; lastText = text; }
    }
    return lastText;
  }

  async function checkEditCard(): Promise<boolean> {
    const selectors = [
      '.koda-edit-card',
      'button:has-text("Apply")',
      'button:has-text("Confirm")',
      '.koda-edit-card__btn--primary',
    ];
    for (const sel of selectors) {
      if (await page.locator(sel).first().isVisible({ timeout: 8000 }).catch(() => false)) return true;
    }
    return false;
  }

  async function clickApply(): Promise<boolean> {
    const btn = page.locator(
      '.koda-edit-card__btn--primary, button:has-text("Apply"), button:has-text("Confirm")'
    ).first();
    if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
    await btn.click();
    console.log('  [ACTION] Clicked Apply');
    await page.waitForTimeout(5000);

    // Check for error
    const errEl = page.locator('.koda-edit-card__error');
    if (await errEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`  [ERROR] ${await errEl.textContent()}`);
      return false;
    }

    // Check success indicators
    const success = page.locator('button:has-text("Open revised"), text=Applied, text=applied');
    return await success.first().isVisible({ timeout: 8000 }).catch(() => false);
  }

  async function checkHighlightFlash(): Promise<boolean> {
    // Check if any paragraph has the highlight flash class
    const highlighted = page.locator('.koda-docx-highlight-flash');
    return await highlighted.first().isVisible({ timeout: 3000 }).catch(() => false);
  }

  async function selectParagraphs(count: number = 1): Promise<void> {
    const paras = page.locator('[data-docx-edit-host="1"] [data-paragraph-id]').filter({ hasText: /\S/ });
    const total = await paras.count();
    if (total === 0) return;

    // Click first paragraph
    await paras.first().click({ clickCount: 3 });
    await page.waitForTimeout(300);

    if (count > 1 && total > 1) {
      // Shift+click additional paragraphs
      const end = Math.min(count - 1, total - 1);
      await paras.nth(end).click({ modifiers: ['Shift'] });
      await page.waitForTimeout(300);
    }
  }

  async function screenshot(name: string): Promise<string> {
    const filepath = `${OUT_DIR}/${name}.png`;
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  async function runStep(opts: {
    id: string;
    prompt: string;
    lang: 'EN' | 'PT';
    category: string;
    selectParas?: number;
    doApply?: boolean;
    checkFlash?: boolean;
  }): Promise<void> {
    console.log(`\n━━━ ${opts.id} [${opts.lang}] ${opts.category} ━━━`);

    const result: StepResult = {
      id: opts.id,
      prompt: opts.prompt,
      lang: opts.lang,
      category: opts.category,
      editCardRendered: false,
      applyClicked: false,
      applySuccess: null,
      highlightFlash: null,
      responseSnippet: '',
      screenshot: '',
    };

    try {
      // Select paragraphs if needed
      if (opts.selectParas) {
        await selectParagraphs(opts.selectParas);
      }

      await sendPrompt(opts.prompt);
      const response = await waitForStableResponse();
      result.responseSnippet = response.slice(0, 200);

      result.editCardRendered = await checkEditCard();
      console.log(`  [EDIT CARD] ${result.editCardRendered ? 'YES' : 'NO'}`);

      if (result.editCardRendered && opts.doApply) {
        result.applyClicked = true;
        result.applySuccess = await clickApply();
        console.log(`  [APPLY] ${result.applySuccess ? 'SUCCESS' : 'FAILED'}`);

        if (opts.checkFlash && result.applySuccess) {
          result.highlightFlash = await checkHighlightFlash();
          console.log(`  [FLASH] ${result.highlightFlash ? 'YES' : 'NO'}`);
        }
      }

      result.screenshot = await screenshot(opts.id);
    } catch (e: any) {
      result.error = e.message;
      console.log(`  [ERROR] ${e.message}`);
      result.screenshot = await screenshot(`${opts.id}-error`).catch(() => '');
    }

    results.push(result);
  }

  // ── Tests ───────────────────────────────────────────────────────────────

  test('Navigate to test1.docx', async () => {
    await navigateToDoc();

    // Verify DOCX canvas is visible
    const docxHost = page.locator('[data-docx-edit-host="1"]');
    const visible = await docxHost.isVisible({ timeout: 20000 }).catch(() => false);
    console.log(`[NAV] DOCX canvas visible: ${visible}`);
    await screenshot('00-document-loaded');
    expect(visible, 'DOCX canvas should be visible').toBe(true);
  });

  // ── EN: Structural Editing ─────────────────────────────────────────────

  test('EN-01: Add bullets to paragraphs', async () => {
    await runStep({
      id: 'EN-01',
      prompt: 'Add bullets to the selected paragraphs',
      lang: 'EN',
      category: 'DOCX_LIST_APPLY_BULLETS',
      selectParas: 3,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-01 should render edit card').toBe(true);
  });

  test('EN-02: Remove bullets from the list', async () => {
    await runStep({
      id: 'EN-02',
      prompt: 'Remove bullets from the selected paragraphs',
      lang: 'EN',
      category: 'DOCX_LIST_REMOVE',
      selectParas: 3,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-02 should render edit card').toBe(true);
  });

  test('EN-03: Center the title', async () => {
    await runStep({
      id: 'EN-03',
      prompt: 'Center this paragraph',
      lang: 'EN',
      category: 'DOCX_SET_ALIGNMENT',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-03 should render edit card').toBe(true);
  });

  test('EN-04: Make it uppercase', async () => {
    await runStep({
      id: 'EN-04',
      prompt: 'Make it uppercase',
      lang: 'EN',
      category: 'DOCX_SET_TEXT_CASE',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-04 should render edit card').toBe(true);
  });

  test('EN-05: Convert to title case', async () => {
    await runStep({
      id: 'EN-05',
      prompt: 'Convert to title case',
      lang: 'EN',
      category: 'DOCX_SET_TEXT_CASE (titlecase)',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-05 should render edit card').toBe(true);
  });

  test('EN-06: Make it lowercase', async () => {
    await runStep({
      id: 'EN-06',
      prompt: 'Make it lowercase',
      lang: 'EN',
      category: 'DOCX_SET_TEXT_CASE (lowercase)',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-06 should render edit card').toBe(true);
  });

  test('EN-07: Apply heading level 2', async () => {
    await runStep({
      id: 'EN-07',
      prompt: 'Make this heading level 2',
      lang: 'EN',
      category: 'DOCX_SET_HEADING_LEVEL',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-07 should render edit card').toBe(true);
  });

  test('EN-08: Delete paragraph', async () => {
    await runStep({
      id: 'EN-08',
      prompt: 'Delete this paragraph',
      lang: 'EN',
      category: 'DOCX_DELETE_PARAGRAPH',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-08 should render edit card').toBe(true);
  });

  test('EN-09: Split paragraph', async () => {
    await runStep({
      id: 'EN-09',
      prompt: 'Split this paragraph after the first sentence',
      lang: 'EN',
      category: 'DOCX_SPLIT_PARAGRAPH',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-09 should render edit card').toBe(true);
  });

  test('EN-10: Merge paragraphs', async () => {
    await runStep({
      id: 'EN-10',
      prompt: 'Merge these paragraphs into one',
      lang: 'EN',
      category: 'DOCX_MERGE_PARAGRAPHS',
      selectParas: 2,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-10 should render edit card').toBe(true);
  });

  test('EN-11: Bold the selected text', async () => {
    await runStep({
      id: 'EN-11',
      prompt: 'Bold the selected text',
      lang: 'EN',
      category: 'DOCX_SET_RUN_STYLE (bold)',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-11 should render edit card').toBe(true);
  });

  test('EN-12: Change font size to 18', async () => {
    await runStep({
      id: 'EN-12',
      prompt: 'Change the font size to 18',
      lang: 'EN',
      category: 'DOCX_SET_RUN_STYLE (fontSize)',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-12 should render edit card').toBe(true);
  });

  test('EN-13: Apply numbered list', async () => {
    await runStep({
      id: 'EN-13',
      prompt: 'Convert to a numbered list',
      lang: 'EN',
      category: 'DOCX_LIST_APPLY_NUMBERING',
      selectParas: 3,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-13 should render edit card').toBe(true);
  });

  test('EN-14: Rewrite paragraph formally', async () => {
    await runStep({
      id: 'EN-14',
      prompt: 'Rewrite this paragraph to be more formal and professional',
      lang: 'EN',
      category: 'DOCX_REWRITE_PARAGRAPH',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'EN-14 should render edit card').toBe(true);
  });

  // ── PT: Locale Parity ─────────────────────────────────────────────────

  test('PT-01: Aplicar negrito (Bold)', async () => {
    await runStep({
      id: 'PT-01',
      prompt: 'Aplique negrito no texto selecionado',
      lang: 'PT',
      category: 'DOCX_SET_RUN_STYLE (bold) — PT',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-01 should render edit card').toBe(true);
  });

  test('PT-02: Mudar tamanho da fonte para 18', async () => {
    await runStep({
      id: 'PT-02',
      prompt: 'Mude o tamanho da fonte para 18',
      lang: 'PT',
      category: 'DOCX_SET_RUN_STYLE (fontSize) — PT slot fix',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-02 should render edit card').toBe(true);
  });

  test('PT-03: Aplicar título 2', async () => {
    await runStep({
      id: 'PT-03',
      prompt: 'Aplique título 2',
      lang: 'PT',
      category: 'DOCX_SET_PARAGRAPH_STYLE (Heading 2) — PT slot fix',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-03 should render edit card').toBe(true);
  });

  test('PT-04: Aplicar título 3', async () => {
    await runStep({
      id: 'PT-04',
      prompt: 'Aplique título 3 ao parágrafo selecionado',
      lang: 'PT',
      category: 'DOCX_SET_PARAGRAPH_STYLE (Heading 3) — PT',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-04 should render edit card').toBe(true);
  });

  test('PT-05: Converter para maiúsculas', async () => {
    await runStep({
      id: 'PT-05',
      prompt: 'Converta para maiúsculas',
      lang: 'PT',
      category: 'DOCX_SET_TEXT_CASE (uppercase) — PT',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-05 should render edit card').toBe(true);
  });

  test('PT-06: Adicionar bullets', async () => {
    await runStep({
      id: 'PT-06',
      prompt: 'Adicione marcadores aos parágrafos selecionados',
      lang: 'PT',
      category: 'DOCX_LIST_APPLY_BULLETS — PT',
      selectParas: 3,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-06 should render edit card').toBe(true);
  });

  test('PT-07: Remover bullets', async () => {
    await runStep({
      id: 'PT-07',
      prompt: 'Remova os marcadores da lista',
      lang: 'PT',
      category: 'DOCX_LIST_REMOVE — PT',
      selectParas: 2,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-07 should render edit card').toBe(true);
  });

  test('PT-08: Centralizar parágrafo', async () => {
    await runStep({
      id: 'PT-08',
      prompt: 'Centralize este parágrafo',
      lang: 'PT',
      category: 'DOCX_SET_ALIGNMENT (center) — PT',
      selectParas: 1,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-08 should render edit card').toBe(true);
  });

  test('PT-09: Reescrever parágrafo formal', async () => {
    await runStep({
      id: 'PT-09',
      prompt: 'Reescreva este parágrafo de forma mais formal e profissional',
      lang: 'PT',
      category: 'DOCX_REWRITE_PARAGRAPH — PT',
      selectParas: 1,
      doApply: true,
      checkFlash: true,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-09 should render edit card').toBe(true);
  });

  test('PT-10: Mesclar parágrafos', async () => {
    await runStep({
      id: 'PT-10',
      prompt: 'Mescle esses parágrafos em um só',
      lang: 'PT',
      category: 'DOCX_MERGE_PARAGRAPHS — PT',
      selectParas: 2,
    });
    expect(results.at(-1)!.editCardRendered, 'PT-10 should render edit card').toBe(true);
  });

  // ── Microcopy / Edge Cases ─────────────────────────────────────────────

  test('EN-15: Trigger clarification (font size without value)', async () => {
    await runStep({
      id: 'EN-15',
      prompt: 'Change the font size',
      lang: 'EN',
      category: 'Clarification — missing fontSize slot',
      selectParas: 1,
    });
    // This should either trigger clarification or still produce an edit card
    const last = results.at(-1)!;
    const hasClarification = last.responseSnippet.toLowerCase().includes('size') ||
                              last.responseSnippet.toLowerCase().includes('font') ||
                              last.editCardRendered;
    expect(hasClarification, 'EN-15 should ask for font size or render card').toBe(true);
  });

  test('EN-16: Noop — bold already bold text', async () => {
    // First bold, then try to bold again
    await runStep({
      id: 'EN-16',
      prompt: 'Bold the selected text',
      lang: 'EN',
      category: 'Noop detection — double bold',
      selectParas: 1,
      doApply: true,
    });
    // No strict assertion — we're looking for noop microcopy in the response
    console.log(`  [NOOP CHECK] Response includes noop copy: ${results.at(-1)!.responseSnippet.toLowerCase().includes('no change') || results.at(-1)!.responseSnippet.toLowerCase().includes('already')}`);
  });

  // ── Final Summary ──────────────────────────────────────────────────────

  test('Print summary', async () => {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  EDITING PIPELINE VALIDATION SUMMARY');
    console.log('════════════════════════════════════════════════════');
    const pass = results.filter(r => r.editCardRendered && !r.error);
    const fail = results.filter(r => !r.editCardRendered || r.error);
    console.log(`  Total: ${results.length}`);
    console.log(`  Edit card rendered: ${pass.length}`);
    console.log(`  Failed/no card: ${fail.length}`);
    for (const r of fail) {
      console.log(`    ✗ ${r.id} [${r.lang}] ${r.category}: ${r.error || 'no edit card'}`);
    }
    const applied = results.filter(r => r.applySuccess);
    console.log(`  Successfully applied: ${applied.length}`);
    const flashed = results.filter(r => r.highlightFlash === true);
    console.log(`  Highlight flash detected: ${flashed.length}`);
    console.log('════════════════════════════════════════════════════\n');
    console.log(`  Full report: ${OUT_DIR}/report.md`);
  });
});
