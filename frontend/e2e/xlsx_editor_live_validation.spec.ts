import { test, expect, Page } from '@playwright/test';
import { login } from './utils/auth';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const XLSX_URL = process.env.E2E_XLSX_URL || 'http://localhost:3000/d/m4w8j2/09ed9b94-1626-4bb1-b436-6c967589c20b';
const XLSX_URL_FALLBACK = process.env.E2E_XLSX_URL_FALLBACK || 'http://localhost:3000/d/m4w8j2/0e98e9c1-28ea-436f-a4c7-7fe47a9f2d36';

async function openViewerChat(page: Page): Promise<void> {
  const ask = page.locator('button:has-text("Ask Allybi")').first();
  if (await ask.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ask.click();
  }
  await page.locator('textarea[placeholder*="Ask Allybi" i], textarea[placeholder*="Ask" i]').last().waitFor({
    state: 'visible',
    timeout: 20000,
  });
}

async function waitForApplyAndSettle(page: Page): Promise<void> {
  const apply = page
    .locator('button[title*="Apply" i], button:has-text("Apply")')
    .first();

  if (await apply.isVisible({ timeout: 15000 }).catch(() => false)) {
    await apply.click();
  }

  await page.waitForSelector('table.excel-preview-table, table', { timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function sendEditorQuery(page: Page, query: string): Promise<void> {
  const input = page
    .locator('textarea[placeholder*="Ask Allybi" i], textarea[placeholder*="Ask" i]')
    .last();
  await input.fill(query);
  await input.press('Enter');
}

async function tableText(page: Page): Promise<string> {
  const table = page.locator('table.excel-preview-table, table').first();
  await table.waitFor({ state: 'visible', timeout: 30000 });
  return String((await table.innerText()) || '');
}

async function openXlsxViewer(page: Page): Promise<void> {
  const urls = [XLSX_URL, XLSX_URL_FALLBACK];
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const hasTable = await page
      .waitForSelector('table.excel-preview-table, table', { state: 'visible', timeout: 35000 })
      .then(() => true)
      .catch(() => false);
    if (hasTable) {
      await page.waitForTimeout(1000);
      return;
    }
  }
  throw new Error('Could not locate an XLSX viewer table in provided URLs.');
}

test.describe.serial('XLSX editor live validation', () => {
  test('applies cell/range/sheet changes inside editor', async ({ page }) => {
    await login(page, {
      email: process.env.E2E_EMAIL || 'test@koda.com',
      password: process.env.E2E_PASSWORD || 'test123',
      baseUrl: BASE_URL,
    });

    await openXlsxViewer(page);
    await page.waitForSelector('table.excel-preview-table, table', { timeout: 30000 });
    await openViewerChat(page);

    const token = `E2E_${Date.now()}`;

    // 1) Single cell update
    await sendEditorQuery(page, `Set cell A1 to ${token}`);
    await waitForApplyAndSettle(page);
    await expect(page.locator('table.excel-preview-table, table').first()).toContainText(token, { timeout: 30000 });

    // 2) Range rewrite
    await sendEditorQuery(page, `Paste this into A2:A4:\nAlpha ${token}\nBeta ${token}\nGamma ${token}`);
    await waitForApplyAndSettle(page);
    const textAfterRange = await tableText(page);
    expect(textAfterRange).toContain(`Alpha ${token}`);
    expect(textAfterRange).toContain(`Beta ${token}`);
    expect(textAfterRange).toContain(`Gamma ${token}`);

    // 3) Add sheet
    const newSheet = `QA_${Date.now().toString().slice(-6)}`;
    await sendEditorQuery(page, `Add a new sheet named ${newSheet}`);
    await waitForApplyAndSettle(page);

    const sheetTabs = page.locator('button.excel-preview-sheet-tab, .excel-preview-sheet-tab');
    await expect(sheetTabs.filter({ hasText: newSheet }).first()).toBeVisible({ timeout: 30000 });
  });
});
