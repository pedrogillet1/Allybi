/**
 * XLSX Editing QA — Viewer Panel E2E Tests
 *
 * Validates the entire Excel editing pipeline inside the document viewer's
 * editing panel ("Ask Allybi"), NOT the main chat.
 *
 * Sections:
 *   A — Single-cell values
 *   B — Formulas
 *   C — Range paste
 *   D — Sheet operations
 *   E — Compute API (direct POST)
 */

import { test, expect, Page, APIRequestContext, request } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  apiUrl: 'https://localhost:5000', // backend uses mkcert TLS
  loginUrl: 'http://localhost:3000/a/x7k2m9?mode=login',
};

const THINKING_PHRASES = [
  'Getting the core of it',
  'Turning the question over',
  'Catching your vibe',
  'Okay—thinking out loud',
  'Making sure I',
  'Let me think',
  'Processing',
  'Analyzing',
  'Preview generated',
  'No document content changed yet',
];

const SCREENSHOT_DIR = 'e2e/test-results/xlsx-editing-qa';

test.describe.serial('XLSX Editing QA — Viewer Panel', () => {
  let page: Page;
  let documentId: string;
  let authToken: string;
  let apiCtx: APIRequestContext;
  let activeSheetName: string;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function isThinkingOrTransient(text: string): boolean {
    if (text.includes('@keyframes') || text.includes('.koda-stream-cursor')) return true;
    return THINKING_PHRASES.some((phrase) => text.includes(phrase));
  }

  async function extractAuthToken(): Promise<string> {
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    return token || '';
  }

  async function screenshot(name: string): Promise<void> {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png` });
  }

  async function getAssistantMessageCount(): Promise<number> {
    return page.locator('.assistant-message').count();
  }

  /**
   * Type a message into the editing panel textarea and press Enter.
   * Returns the message count *before* sending.
   */
  async function sendEditingPanelMessage(msg: string): Promise<number> {
    const countBefore = await getAssistantMessageCount();
    const textarea = page.locator('textarea[placeholder*="Ask Allybi"]');
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill(msg);
    await textarea.press('Enter');
    return countBefore;
  }

  /**
   * Wait for a NEW assistant reply after sending a message.
   */
  async function waitForEditResponse(countBefore: number, timeout = 120_000): Promise<string> {
    await page.waitForTimeout(2000);
    const startTime = Date.now();
    let lastContent = '';
    let stableCount = 0;

    while (stableCount < 4 && Date.now() - startTime < timeout) {
      await page.waitForTimeout(1500);

      const messages = page.locator('.assistant-message');
      const count = await messages.count();

      if (count <= countBefore) {
        stableCount = 0;
        continue;
      }

      const content = (await messages.last().textContent({ timeout: 3000 }).catch(() => '')) || '';

      if (isThinkingOrTransient(content)) {
        console.log(`  [transient]: ${content.slice(0, 60)}...`);
        stableCount = 0;
        continue;
      }

      if (content === lastContent && content.length > 5) {
        stableCount++;
      } else {
        stableCount = 0;
        lastContent = content;
      }
    }

    console.log(`  Response (${lastContent.length} chars): ${lastContent.slice(0, 120)}...`);
    return lastContent;
  }

  /**
   * Wait for edit to land: click Apply if it appears, or trust auto-apply.
   */
  async function waitForEditCompletion(): Promise<void> {
    const applyBtn = page.locator('button[title="Apply and save as new version"]');
    const visible = await applyBtn.isVisible({ timeout: 15_000 }).catch(() => false);

    if (visible) {
      console.log('  [apply] Clicking Apply button...');
      await applyBtn.click();
    } else {
      console.log('  [apply] Auto-applied (no manual confirm needed).');
    }

    await page.locator('table.excel-preview-table').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(2000);
  }

  /**
   * Read a cell value from the visible Excel preview table.
   */
  async function getCellValue(cellRef: string): Promise<string> {
    const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
    if (!match) throw new Error(`Invalid cell ref: ${cellRef}`);
    const colLetter = match[1].toUpperCase();
    const rowNum = match[2];

    const value: string = await page.evaluate(
      ({ colLetter, rowNum }) => {
        const table = document.querySelector('table.excel-preview-table');
        if (!table) return '[no table]';

        const ths = Array.from(table.querySelectorAll('thead tr th'));
        let colIndex = -1;
        for (let i = 0; i < ths.length; i++) {
          if ((ths[i].textContent || '').trim() === colLetter) {
            colIndex = i;
            break;
          }
        }
        if (colIndex === -1) {
          const headers = ths.map((th) => (th.textContent || '').trim());
          return `[col ${colLetter} not in headers: ${headers.join(',')}]`;
        }

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        for (const tr of rows) {
          const rowHeader = tr.querySelector('th');
          if (rowHeader && (rowHeader.textContent || '').trim() === rowNum) {
            const cells = Array.from(tr.children);
            const cell = cells[colIndex];
            return cell ? (cell.textContent || '').trim() : '';
          }
        }
        return `[row ${rowNum} not found]`;
      },
      { colLetter, rowNum }
    );

    console.log(`  getCellValue(${cellRef}) = "${value}"`);
    return value;
  }

  async function getSheetNames(): Promise<string[]> {
    const names = await page.$$eval('button.excel-preview-sheet-tab', (tabs) =>
      tabs.map((t) => (t.textContent || '').trim())
    );
    console.log(`  getSheetNames() = [${names.join(', ')}]`);
    return names;
  }

  /**
   * Read the active sheet name from the sheet selector dropdown in the editing toolbar.
   */
  async function getActiveSheetName(): Promise<string> {
    // The toolbar has a <select class="allybi-excel-sheet-select"> whose selected <option> text is the sheet name
    const name = await page.evaluate(() => {
      const sel = document.querySelector('select.allybi-excel-sheet-select') as HTMLSelectElement | null;
      if (sel && sel.selectedOptions.length > 0) return sel.selectedOptions[0].textContent?.trim() || '';
      // Fallback: active sheet tab
      const tab = document.querySelector('button.excel-preview-sheet-tab.active');
      if (tab) return tab.textContent?.trim() || '';
      return '';
    });
    return name || 'Sheet1';
  }

  /** Send → wait → apply combo */
  async function sendAndApply(msg: string): Promise<string> {
    const countBefore = await sendEditingPanelMessage(msg);
    const response = await waitForEditResponse(countBefore);
    await waitForEditCompletion();
    return response;
  }

  // ─── Setup / Teardown ─────────────────────────────────────────────────────

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();

    // 1. Login
    console.log('[SETUP] Navigating to login page...');
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(2000);

    const skipButton = page.locator('text=Skip introduction, button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[SETUP] Filling login form...');
      await emailInput.fill(CONFIG.email);
      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(CONFIG.password);
      }
      await page.getByRole('button', { name: 'Log In', exact: true }).click();
      await page.waitForTimeout(5000);
    }

    const skipButton2 = page.locator('text=Skip introduction');
    if (await skipButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton2.click();
      await page.waitForTimeout(1000);
    }

    console.log('[SETUP] Login complete.');

    // 2. Extract auth token
    authToken = await extractAuthToken();
    console.log(`[SETUP] Auth token: ${authToken ? authToken.slice(0, 20) + '...' : 'MISSING'}`);
    expect(authToken).toBeTruthy();

    // 3. Find first XLSX document via API
    console.log('[SETUP] Fetching document list...');
    apiCtx = await request.newContext({ ignoreHTTPSErrors: true });
    const res = await apiCtx.get(`${CONFIG.apiUrl}/api/documents?limit=100`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const docResult = await res.json();
    expect(docResult.ok).toBe(true);

    const xlsxDoc = docResult.data.items.find(
      (item: any) =>
        item.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(xlsxDoc).toBeTruthy();
    documentId = xlsxDoc.id;
    console.log(`[SETUP] Using XLSX document: "${xlsxDoc.filename}" (${documentId})`);

    // 4. Navigate to document viewer
    const viewerUrl = `/d/m4w8j2/${documentId}`;
    console.log(`[SETUP] Navigating to ${viewerUrl}...`);
    await page.goto(`${CONFIG.baseUrl}${viewerUrl}`);
    await page.locator('table.excel-preview-table').waitFor({ state: 'visible', timeout: 30_000 });
    console.log('[SETUP] Excel preview table visible.');

    // 5. Detect active sheet name (uses page.evaluate — no locator timeout issues)
    activeSheetName = await getActiveSheetName();
    console.log(`[SETUP] Active sheet: "${activeSheetName}"`);

    // 6. Open the "Ask Allybi" editing panel
    //    The button is in the document viewer header area (top right).
    console.log('[SETUP] Opening Ask Allybi panel...');
    await page.locator('button:has-text("Ask Allybi")').first().click({ timeout: 10_000 });
    await page.locator('textarea[placeholder*="Ask Allybi"]').waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    console.log('[SETUP] Editing panel open.');

    // 7. Wait for initial messages to settle
    await page.waitForTimeout(5000);
    console.log('[SETUP] Ready to send edit commands.');
  });

  test.afterAll(async () => {
    if (apiCtx) await apiCtx.dispose();
    if (page) await page.close();
  });

  // ─── Section A: Single-cell values ────────────────────────────────────────

  test('A01 — Set A1 to Month', async () => {
    await sendAndApply('Set cell A1 to "Month"');
    const val = await getCellValue('A1');
    expect(val.toLowerCase()).toContain('month');
    await screenshot('A01-set-A1-Month');
  });

  test('A02 — Set B1 to Revenue', async () => {
    await sendAndApply('Set cell B1 to "Revenue"');
    const val = await getCellValue('B1');
    expect(val.toLowerCase()).toContain('revenue');
    await screenshot('A02-set-B1-Revenue');
  });

  test('A03 — Set A2 to Jan', async () => {
    await sendAndApply('Set cell A2 to "Jan"');
    const val = await getCellValue('A2');
    expect(val.toLowerCase()).toContain('jan');
    await screenshot('A03-set-A2-Jan');
  });

  test('A04 — Set B2 to 120000', async () => {
    await sendAndApply('Set cell B2 to 120000');
    const val = await getCellValue('B2');
    expect(val).toContain('120000');
    await screenshot('A04-set-B2-120000');
  });

  test('A05 — Set A3 to Feb', async () => {
    await sendAndApply('Set cell A3 to "Feb"');
    const val = await getCellValue('A3');
    expect(val.toLowerCase()).toContain('feb');
    await screenshot('A05-set-A3-Feb');
  });

  test('A06 — Set B3 to 90000', async () => {
    await sendAndApply('Set cell B3 to 90000');
    const val = await getCellValue('B3');
    expect(val).toContain('90000');
    await screenshot('A06-set-B3-90000');
  });

  // ─── Section B: Formulas ──────────────────────────────────────────────────

  test('B01 — Set C1 to Total', async () => {
    await sendAndApply('Set cell C1 to "Total"');
    const val = await getCellValue('C1');
    expect(val.toLowerCase()).toContain('total');
    await screenshot('B01-set-C1-Total');
  });

  test('B02 — Set C2 to =B2*1.1', async () => {
    await sendAndApply('Set cell C2 to the formula =B2*1.1');
    const val = await getCellValue('C2');
    expect(val.length).toBeGreaterThan(0);
    console.log(`  B02 formula result: ${val}`);
    await screenshot('B02-set-C2-formula');
  });

  test('B03 — Set C3 to =B3*1.1', async () => {
    await sendAndApply('Set cell C3 to the formula =B3*1.1');
    const val = await getCellValue('C3');
    expect(val.length).toBeGreaterThan(0);
    console.log(`  B03 formula result: ${val}`);
    await screenshot('B03-set-C3-formula');
  });

  test('B04 — Set B4 to 0 and C4 to =SUM(C2:C3)', async () => {
    await sendAndApply('Set cell B4 to 0');
    const b4 = await getCellValue('B4');
    expect(b4).toContain('0');
    await screenshot('B04a-set-B4-zero');

    await sendAndApply('Set cell C4 to the formula =SUM(C2:C3)');
    const c4 = await getCellValue('C4');
    expect(c4.length).toBeGreaterThan(0);
    console.log(`  B04b SUM result: ${c4}`);
    await screenshot('B04b-set-C4-SUM');
  });

  // ─── Section C: Range Paste ───────────────────────────────────────────────

  test('C01 — Paste range A6:B9', async () => {
    await sendAndApply(`Paste this into A6:B9:\nMar\t100000\nApr\t80000\nMay\t110000\nJun\t95000`);

    const a6 = await getCellValue('A6');
    expect(a6.toLowerCase()).toContain('mar');

    const b6 = await getCellValue('B6');
    expect(b6).toContain('100000');

    const a9 = await getCellValue('A9');
    expect(a9.toLowerCase()).toContain('jun');

    const b9 = await getCellValue('B9');
    expect(b9).toContain('95000');

    await screenshot('C01-range-paste');
  });

  // ─── Section D: Sheet Operations ──────────────────────────────────────────

  test('D01 — Add new sheet named Summary', async () => {
    await sendAndApply('Add a new sheet named Summary');
    const names = await getSheetNames();
    expect(names.some((n) => n.toLowerCase().includes('summary'))).toBe(true);
    await screenshot('D01-add-sheet-Summary');
  });

  test('D02 — Rename active sheet to Data', async () => {
    await sendAndApply(`Rename sheet '${activeSheetName}' to 'Data'`);
    const names = await getSheetNames();
    expect(names.some((n) => n.toLowerCase().includes('data'))).toBe(true);
    await screenshot('D02-rename-sheet-Data');
  });

  // ─── Section E: Compute API (Direct POST) ────────────────────────────────

  test('E01 — Compute API: Pie chart', async () => {
    const sheetNames = await getSheetNames();
    const sheetName = sheetNames[0] || 'Data';

    const computeUrl = `${CONFIG.apiUrl}/api/documents/${documentId}/studio/sheets/compute`;
    const response = await apiCtx.post(computeUrl, {
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      data: {
        instruction: 'QA: create pie chart',
        ops: [
          {
            kind: 'set_values',
            rangeA1: `${sheetName}!A1:B5`,
            values: [
              ['Month', 'Revenue'],
              ['Jan', 120000],
              ['Feb', 90000],
              ['Mar', 100000],
              ['Apr', 80000],
            ],
          },
          {
            kind: 'create_chart',
            spec: { type: 'PIE', range: `${sheetName}!A1:B5`, title: 'Revenue Share' },
          },
        ],
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    console.log(`  E01 revisionId: ${body?.data?.revisionId}`);
    expect(body.ok).toBe(true);
    expect(body.data?.revisionId).toBeTruthy();
    await screenshot('E01-compute-pie-chart');
  });

  test('E02 — Compute API: Stress test (insert rows + formulas + column chart)', async () => {
    const sheetNames = await getSheetNames();
    const sheetName = sheetNames[0] || 'Data';

    const computeUrl = `${CONFIG.apiUrl}/api/documents/${documentId}/studio/sheets/compute`;
    const response = await apiCtx.post(computeUrl, {
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      data: {
        instruction: 'QA: structural + formulas + chart',
        ops: [
          { kind: 'insert_rows', sheetName, startIndex: 1, count: 2 },
          { kind: 'insert_columns', sheetName, startIndex: 2, count: 1 },
          {
            kind: 'set_values',
            rangeA1: `${sheetName}!A1:C6`,
            values: [
              ['Month', 'Revenue', 'Revenue+10%'],
              ['Jan', 120000, ''],
              ['Feb', 90000, ''],
              ['Mar', 100000, ''],
              ['Apr', 80000, ''],
              ['May', 110000, ''],
            ],
          },
          { kind: 'set_formula', a1: `${sheetName}!C2`, formula: '=B2*1.1' },
          { kind: 'set_formula', a1: `${sheetName}!C3`, formula: '=B3*1.1' },
          { kind: 'set_formula', a1: `${sheetName}!C4`, formula: '=B4*1.1' },
          { kind: 'set_formula', a1: `${sheetName}!C5`, formula: '=B5*1.1' },
          { kind: 'set_formula', a1: `${sheetName}!C6`, formula: '=B6*1.1' },
          {
            kind: 'create_chart',
            spec: { type: 'COLUMN', range: `${sheetName}!A1:C6`, title: 'Revenue vs Adjusted' },
          },
        ],
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    console.log(`  E02 revisionId: ${body?.data?.revisionId}`);
    expect(body.ok).toBe(true);
    expect(body.data?.revisionId).toBeTruthy();
    await screenshot('E02-compute-stress-test');

    // Reload the viewer and verify the preview still renders
    console.log('  [E02] Reloading viewer to verify preview...');
    await page.goto(`${CONFIG.baseUrl}/d/m4w8j2/${documentId}`);
    await page.locator('table.excel-preview-table').waitFor({ state: 'visible', timeout: 30_000 });
    console.log('  [E02] Preview still renders after compute ops.');
    await screenshot('E02-post-reload-preview');
  });
});
