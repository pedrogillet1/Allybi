import { test, expect, Page, BrowserContext } from '@playwright/test';
import { login } from './utils/auth';
import * as path from 'path';
import * as fs from 'fs';

/* ───────────────────────────────────────────────────────────────
   XLSX Visual QA — Chat-Driven Editing Test Suite
   Sends ~30 natural-language prompts through the "Ask Allybi" chat
   while viewing an XLSX document, screenshots after each, and logs
   a pass/fail summary.
   ─────────────────────────────────────────────────────────────── */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const XLSX_URL =
  process.env.E2E_XLSX_URL ||
  'http://localhost:3000/d/m4w8j2/09ed9b94-1626-4bb1-b436-6c967589c20b';
const XLSX_URL_FALLBACK =
  process.env.E2E_XLSX_URL_FALLBACK ||
  'http://localhost:3000/d/m4w8j2/0e98e9c1-28ea-436f-a4c7-7fe47a9f2d36';

const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots');

// ── Tracking ────────────────────────────────────────────────────
interface TestResult {
  id: string;
  prompt: string;
  expected: string;
  passed: boolean;
  actual: string;
  screenshotPath: string;
  durationMs: number;
}
const results: TestResult[] = [];

// ── Helpers ─────────────────────────────────────────────────────

async function openXlsxViewer(page: Page): Promise<void> {
  for (const url of [XLSX_URL, XLSX_URL_FALLBACK]) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const ok = await page
      .waitForSelector('table.excel-preview-table, table', {
        state: 'visible',
        timeout: 35_000,
      })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      await page.waitForTimeout(1000);
      return;
    }
  }
  throw new Error('Could not locate an XLSX viewer table.');
}

async function openViewerChat(page: Page): Promise<void> {
  const ask = page.locator('button:has-text("Ask Allybi")').first();
  if (await ask.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ask.click();
  }
  await page
    .locator('textarea[placeholder*="Ask Allybi" i], textarea[placeholder*="Ask" i]')
    .last()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

async function sendPrompt(page: Page, text: string): Promise<void> {
  const input = page
    .locator('textarea[placeholder*="Ask Allybi" i], textarea[placeholder*="Ask" i]')
    .last();
  await input.fill(text);
  await input.press('Enter');
}

async function waitForResponse(page: Page): Promise<string> {
  // Wait for streaming to finish (no more streaming indicator or stop button)
  const streamingSel = '[data-testid="msg-streaming"], [data-testid="chat-stop"]';
  // First wait for *any* new assistant content (streaming started)
  await page
    .locator('[data-testid="msg-assistant"], [data-role="assistant"], .assistant-message')
    .last()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {});

  // Then wait until streaming is done
  for (let i = 0; i < 120; i++) {
    const streaming = await page.locator(streamingSel).count();
    if (streaming === 0) break;
    await page.waitForTimeout(500);
  }

  // Grab the last assistant message text
  const msgs = page.locator(
    '[data-testid="msg-assistant"], [data-role="assistant"], .assistant-message',
  );
  const count = await msgs.count();
  if (count === 0) return '';
  return (await msgs.nth(count - 1).innerText()) || '';
}

async function clickApplyIfPresent(page: Page): Promise<boolean> {
  const apply = page
    .locator(
      'button[title*="Apply" i], button:has-text("Apply"), .koda-edit-card__btn--primary',
    )
    .first();
  const visible = await apply.isVisible({ timeout: 15_000 }).catch(() => false);
  if (visible) {
    await apply.click();
    return true;
  }
  return false;
}

async function waitForTableSettle(page: Page): Promise<void> {
  await page.waitForSelector('table.excel-preview-table, table', { timeout: 30_000 });
  await page.waitForTimeout(2500);
}

async function tableText(page: Page): Promise<string> {
  const table = page.locator('table.excel-preview-table, table').first();
  await table.waitFor({ state: 'visible', timeout: 30_000 });
  return String((await table.innerText()) || '');
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

// ── Test Definitions ────────────────────────────────────────────
interface QATest {
  id: string;
  prompt: string;
  verify: string; // substring to look for in the table (case-insensitive)
  verifyMode?: 'table' | 'response'; // where to check — default "table"
}

const SECTION_A: QATest[] = [
  { id: 'A01', prompt: 'Set cell A1 to Month', verify: 'Month' },
  { id: 'A02', prompt: 'Set cell B1 to Revenue', verify: 'Revenue' },
  { id: 'A03', prompt: 'Set cell C1 to Expenses', verify: 'Expenses' },
  { id: 'A04', prompt: 'Set cell A2 to January', verify: 'January' },
  { id: 'A05', prompt: 'Set cell B2 to 150000', verify: '150' },
  { id: 'A06', prompt: 'Set cell C2 to 95000', verify: '95' },
  { id: 'A07', prompt: 'Set cell A3 to February', verify: 'February' },
  { id: 'A08', prompt: 'Set cell B3 to 180000', verify: '180' },
  { id: 'A09', prompt: 'Set cell C3 to 110000', verify: '110' },
];

const SECTION_B: QATest[] = [
  { id: 'B01', prompt: 'Set cell D1 to Profit', verify: 'Profit' },
  { id: 'B02', prompt: 'Set cell D2 to the formula =B2-C2', verify: '55' },
  { id: 'B03', prompt: 'Set cell D3 to the formula =B3-C3', verify: '70' },
  { id: 'B04', prompt: 'Set cell A4 to Total', verify: 'Total' },
  { id: 'B05', prompt: 'Set cell B4 to the formula =SUM(B2:B3)', verify: '330' },
  { id: 'B06', prompt: 'Set cell C4 to the formula =SUM(C2:C3)', verify: '205' },
  { id: 'B07', prompt: 'Set cell D4 to the formula =SUM(D2:D3)', verify: '125' },
];

const SECTION_C: QATest[] = [
  { id: 'C01', prompt: 'Set cell E1 to Margin %', verify: 'Margin' },
  { id: 'C02', prompt: 'Set cell E2 to the formula =D2/B2', verify: '0.3' },
  { id: 'C03', prompt: 'Set cell E3 to the formula =D3/B3', verify: '0.3' },
  { id: 'C04', prompt: 'Format E2:E3 as percentage', verify: '%' },
  { id: 'C05', prompt: 'Format B2:B4 as currency', verify: '$' },
];

const SECTION_D: QATest[] = [
  {
    id: 'D01',
    prompt: 'Paste this into A5:B7:\nMarch\t200000\nApril\t175000\nMay\t160000',
    verify: 'March',
  },
  { id: 'D02', prompt: 'Set cell C5 to 120000', verify: '120' },
  { id: 'D03', prompt: 'Set cell C6 to 130000', verify: '130' },
  { id: 'D04', prompt: 'Set cell C7 to 100000', verify: '100' },
];

const SECTION_E: QATest[] = [
  {
    id: 'E01',
    prompt: 'Sort the range A2:D7 by column B descending',
    verify: 'sort',
    verifyMode: 'response',
  },
  {
    id: 'E02',
    prompt: 'Insert 2 rows above row 1',
    verify: 'insert',
    verifyMode: 'response',
  },
];

const SECTION_F: QATest[] = [
  {
    id: 'F01',
    prompt: 'Add a new sheet named Summary',
    verify: 'Summary',
    verifyMode: 'response',
  },
  {
    id: 'F02',
    prompt: 'Rename this sheet to Revenue Data',
    verify: 'rename',
    verifyMode: 'response',
  },
];

const SECTION_G: QATest[] = [
  {
    id: 'G01',
    prompt: 'Create a bar chart from A1:B4 with title Revenue by Month',
    verify: 'chart',
    verifyMode: 'response',
  },
];

const ALL_TESTS: QATest[] = [
  ...SECTION_A,
  ...SECTION_B,
  ...SECTION_C,
  ...SECTION_D,
  ...SECTION_E,
  ...SECTION_F,
  ...SECTION_G,
];

// ── Suite ───────────────────────────────────────────────────────
test.describe.serial('XLSX Visual QA — Chat Editing', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();

    // Login
    await login(page, {
      email: process.env.E2E_EMAIL || 'test@koda.com',
      password: process.env.E2E_PASSWORD || 'test123',
      baseUrl: BASE_URL,
    });

    // Open XLSX viewer
    await openXlsxViewer(page);
    await page.waitForSelector('table.excel-preview-table, table', { timeout: 30_000 });

    // Open chat panel
    await openViewerChat(page);

    // Baseline screenshot
    await screenshot(page, 'qa_00_baseline');
  });

  test.afterAll(async () => {
    // Print summary table
    const pad = (s: string, n: number) => s.padEnd(n);
    const divider = '-'.repeat(100);
    const lines: string[] = [
      '',
      divider,
      `  XLSX Visual QA — Results Summary`,
      divider,
      `  ${pad('ID', 5)} ${pad('Status', 8)} ${pad('Duration', 10)} ${pad('Prompt', 50)} Verify`,
      divider,
    ];

    let passed = 0;
    let failed = 0;
    for (const r of results) {
      const status = r.passed ? 'PASS' : 'FAIL';
      const dur = `${r.durationMs}ms`;
      const prompt = r.prompt.length > 48 ? r.prompt.slice(0, 48) + '..' : r.prompt;
      lines.push(
        `  ${pad(r.id, 5)} ${pad(status, 8)} ${pad(dur, 10)} ${pad(prompt, 50)} ${r.expected}`,
      );
      if (r.passed) passed++;
      else failed++;
    }

    lines.push(divider);
    lines.push(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
    lines.push(divider);
    lines.push('');

    console.log(lines.join('\n'));

    // Write JSON results file
    const jsonPath = path.join(SCREENSHOT_DIR, 'qa_results.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

    await context.close();
  });

  for (const t of ALL_TESTS) {
    test(`${t.id}: ${t.prompt.slice(0, 60)}`, async () => {
      const start = Date.now();
      let passed = false;
      let actual = '';

      try {
        // Send prompt
        await sendPrompt(page, t.prompt);

        // Wait for assistant response
        const response = await waitForResponse(page);

        // Click Apply if present
        await clickApplyIfPresent(page);

        // Wait for table to settle
        await waitForTableSettle(page);

        // Verify
        if (t.verifyMode === 'response') {
          actual = response.toLowerCase();
          passed = actual.includes(t.verify.toLowerCase());
          if (!passed) {
            // Also check table as fallback
            const tbl = await tableText(page);
            actual = tbl.toLowerCase();
            passed = actual.includes(t.verify.toLowerCase());
          }
        } else {
          const tbl = await tableText(page);
          actual = tbl;
          passed = tbl.toLowerCase().includes(t.verify.toLowerCase());
        }

        // For sheet tab tests, also check sheet tab bar
        if (t.id === 'F01') {
          const tabs = page.locator(
            'button.excel-preview-sheet-tab, .excel-preview-sheet-tab',
          );
          const tabsVisible = await tabs
            .filter({ hasText: 'Summary' })
            .first()
            .isVisible({ timeout: 10_000 })
            .catch(() => false);
          if (tabsVisible) passed = true;
        }
      } catch (err: unknown) {
        actual = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
        passed = false;
      }

      const duration = Date.now() - start;
      const ssName = `qa_${t.id}_${t.prompt.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`;
      const ssPath = await screenshot(page, ssName);

      results.push({
        id: t.id,
        prompt: t.prompt,
        expected: t.verify,
        passed,
        actual: actual.slice(0, 300),
        screenshotPath: ssPath,
        durationMs: duration,
      });

      // Soft-assert so we continue running all tests even if one fails
      expect.soft(passed, `${t.id}: expected table/response to contain "${t.verify}"`).toBe(
        true,
      );
    });
  }
});
