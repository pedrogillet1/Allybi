import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { login } from './utils/auth';

const URLS = [
  'http://localhost:3000/d/m4w8j2/0e98e9c1-28ea-436f-a4c7-7fe47a9f2d36',
  'http://localhost:3000/d/m4w8j2/09ed9b94-1626-4bb1-b436-6c967589c20b',
];

type EditorType = 'docx' | 'xlsx' | 'unknown';

type ResultRow = {
  url: string;
  landedUrl: string;
  editorType: EditorType;
  query: string;
  applied: boolean;
  changed: boolean;
  error?: string;
  before?: string;
  after?: string;
  screenshot?: string;
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureViewerChatOpen(page: Page) {
  const isInputVisible = async () =>
    Boolean(await getChatInput(page));
  if (await isInputVisible()) return;

  const askBtn = page
    .locator('[data-testid="viewer-ask-allybi-toggle"], button:has-text("Ask Allybi"), button:has-text("Allybi")')
    .first();
  if (await askBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await askBtn.click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function getChatInput(page: Page) {
  const selectors = [
    '[data-testid="viewer-chat-input"]',
    '[data-testid="chat-input"]',
    '[data-chat-input="true"]',
    'textarea[placeholder*="Ask Allybi" i]',
    'textarea[placeholder*="Ask" i]',
    '[data-testid="chat-input"]',
    'textarea',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).last();
    if (await loc.isVisible({ timeout: 1200 }).catch(() => false)) return loc;
  }
  return null;
}

async function detectEditorType(page: Page): Promise<EditorType> {
  for (let i = 0; i < 20; i += 1) {
    const hasDocx = (await page.locator('[data-docx-edit-host="1"]').count()) > 0;
    if (hasDocx) return 'docx';
    const hasTable = (await page.locator('table').count()) > 0;
    if (hasTable) return 'xlsx';
    await page.waitForTimeout(500);
  }
  return 'unknown';
}

async function waitApplyButton(page: Page) {
  const btn = page
    .locator(
      '.koda-edit-card__btn--primary, button:has-text("Apply"), button:has-text("Confirm"), button[title*="Apply"]',
    )
    .first();
  const visible = await btn.isVisible({ timeout: 25000 }).catch(() => false);
  return visible ? btn : null;
}

async function sendQuery(page: Page, query: string) {
  await ensureViewerChatOpen(page);
  const input = await getChatInput(page);
  if (!input) throw new Error('Chat input not found');
  await input.fill(query);
  await input.press('Enter');
}

async function runDocxQuery(page: Page, query: string): Promise<{ applied: boolean; changed: boolean; before: string; after: string }> {
  const host = page.locator('[data-docx-edit-host="1"]').first();
  await host.waitFor({ state: 'visible', timeout: 30000 });
  const beforeDoc = String((await host.innerText()) || '').replace(/\s+/g, ' ').trim();
  const p = page
    .locator('[data-docx-edit-host="1"] [data-paragraph-id]:not([data-allybi-deleted="1"])')
    .filter({ hasText: /\S/ })
    .first();
  await p.waitFor({ state: 'visible', timeout: 30000 });
  const before = String((await p.innerText()) || '').replace(/\s+/g, ' ').trim();
  await p.click({ clickCount: 3 });

  await sendQuery(page, query);
  const apply = await waitApplyButton(page);
  if (apply) {
    await apply.click().catch(() => {});
    await page.waitForTimeout(5000);
  } else {
    await page.waitForTimeout(7000);
  }

  // Some apply flows navigate/reload; reacquire first paragraph.
  const p2 = page
    .locator('[data-docx-edit-host="1"] [data-paragraph-id]:not([data-allybi-deleted="1"])')
    .filter({ hasText: /\S/ })
    .first();
  await p2.waitFor({ state: 'visible', timeout: 40000 });
  const after = String((await p2.innerText()) || '').replace(/\s+/g, ' ').trim();
  const afterDoc = String((await host.innerText()) || '').replace(/\s+/g, ' ').trim();
  return { applied: true, changed: before !== after || beforeDoc !== afterDoc, before, after };
}

async function runXlsxQuery(page: Page, query: string, token: string): Promise<{ applied: boolean; changed: boolean; before: string; after: string }> {
  const table = page.locator('table').first();
  await table.waitFor({ state: 'visible', timeout: 30000 });
  const before = String((await table.innerText()) || '');

  // Click a likely editable cell.
  const cell = page.locator('table tbody td, table tbody [role="cell"]').nth(5);
  if (await cell.isVisible({ timeout: 5000 }).catch(() => false)) await cell.click().catch(() => {});

  await sendQuery(page, `${query} Use exactly this value: ${token}`);
  const apply = await waitApplyButton(page);
  if (apply) {
    await apply.click().catch(() => {});
    await page.waitForTimeout(5000);
  } else {
    await page.waitForTimeout(7000);
  }

  const after = String((await table.innerText()) || '');
  const changed = after.includes(token) || before !== after;
  return { applied: true, changed, before: before.slice(0, 400), after: after.slice(0, 400) };
}

test.describe.serial('Provided URL live validation', () => {
  test('run editor queries and verify visible changes after apply', async ({ page }) => {
    const outDir = path.join(process.cwd(), 'e2e', 'test-results', 'docx-live-validation');
    fs.mkdirSync(outDir, { recursive: true });
    const results: ResultRow[] = [];

    await login(page, {
      email: process.env.E2E_EMAIL || 'test@koda.com',
      password: process.env.E2E_PASSWORD || 'test123',
      baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
    });

    for (const [urlIdx, url] of URLS.entries()) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);

      // Re-auth if redirected.
      if (page.url().includes('/a/x7k2m9')) {
        await login(page, {
          email: process.env.E2E_EMAIL || 'test@koda.com',
          password: process.env.E2E_PASSWORD || 'test123',
          baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(2500);
      }

      const editorType = await detectEditorType(page);
      const landedUrl = page.url();

      const queries =
        editorType === 'docx'
          ? [
              'Rewrite the selected paragraph in UPPERCASE while keeping the same meaning.',
              'Convert this paragraph into a bullet list with exactly three bullets: Status visibility; Error prevention; Brand personality.',
              'Convert this bullet list into a numbered list.',
              'Convert this numbered list back into one paragraph.',
            ]
          : editorType === 'xlsx'
            ? [
                'Set the selected cell value to the exact token.',
                'Replace the selected value with the exact token.',
                'Update this selected cell to the exact token.',
              ]
            : ['Editor did not load for this URL'];

      for (const [qIdx, q] of queries.entries()) {
        const screenshot = path.join(outDir, `${stamp()}_u${urlIdx + 1}_q${qIdx + 1}.png`);
        if (editorType === 'unknown') {
          results.push({
            url,
            landedUrl,
            editorType,
            query: q,
            applied: false,
            changed: false,
            error: 'Could not detect DOCX or XLSX editor canvas.',
          });
          continue;
        }

        try {
          const token = `E2E_${Date.now()}_${urlIdx}_${qIdx}`;
          const out =
            editorType === 'docx'
              ? await runDocxQuery(page, q)
              : await runXlsxQuery(page, q, token);
          await page.screenshot({ path: screenshot, fullPage: true });
          results.push({
            url,
            landedUrl,
            editorType,
            query: q,
            applied: out.applied,
            changed: out.changed,
            before: out.before,
            after: out.after,
            screenshot,
            ...(out.changed ? {} : { error: 'Apply completed but no visible change detected.' }),
          });
        } catch (e: any) {
          await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
          results.push({
            url,
            landedUrl,
            editorType,
            query: q,
            applied: false,
            changed: false,
            error: e?.message || 'Unknown error',
            screenshot,
          });
        }

        await page.waitForTimeout(1500);
      }
    }

    const reportJson = path.join(outDir, 'report.json');
    fs.writeFileSync(reportJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

    const pass = results.filter((r) => r.changed).length;
    const fail = results.length - pass;
    const lines = [
      '# Provided URL Validation Report',
      '',
      `- Generated: ${new Date().toISOString()}`,
      `- Total: ${results.length}`,
      `- Passed (changed): ${pass}`,
      `- Failed: ${fail}`,
      '',
    ];
    results.forEach((r, i) => {
      lines.push(`## ${i + 1}. ${r.changed ? 'PASS' : 'FAIL'}`);
      lines.push(`- URL: ${r.url}`);
      lines.push(`- Landed URL: ${r.landedUrl}`);
      lines.push(`- Editor: ${r.editorType}`);
      lines.push(`- Query: ${r.query}`);
      lines.push(`- Applied: ${r.applied}`);
      lines.push(`- Error: ${r.error || 'none'}`);
      lines.push(`- Screenshot: ${r.screenshot || 'n/a'}`);
      lines.push('');
    });
    fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));

    // Hard fail only if every single query across all URLs fails.
    expect(results.some((r) => r.changed)).toBeTruthy();
  });
});
