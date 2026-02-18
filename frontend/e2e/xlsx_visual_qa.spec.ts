import { test, Page } from '@playwright/test';
import { login } from './utils/auth';
import * as path from 'path';
import * as fs from 'fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const DOC_URL = `${BASE}/d/m4w8j2/b4b796f3-f2c4-4cc9-a77b-eff6f7874eaa`;

const SS_DIR = path.resolve(__dirname, 'screenshots');

const CHAT_IN = 'textarea[placeholder*="Ask Allybi" i], [data-chat-input="true"]';
const ASST_MSG = '[data-role="assistant"], .assistant-message, [data-testid="msg-assistant"]';
const TABLE = 'table.excel-preview-table, table';

async function openDoc(page: Page) {
  await page.goto(DOC_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector(TABLE, { state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(2000);
}

async function openChat(page: Page) {
  const inp = page.locator(CHAT_IN).last();
  if (await inp.isVisible({ timeout: 1500 }).catch(() => false)) return;
  const btn = page.locator('button:has-text("Ask Allybi")').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) await btn.click();
  await inp.waitFor({ state: 'visible', timeout: 15_000 });
}

async function countMsgs(page: Page) { return page.locator(ASST_MSG).count(); }

async function send(page: Page, text: string): Promise<string> {
  const before = await countMsgs(page);
  const inp = page.locator(CHAT_IN).last();
  await inp.fill(text);
  await inp.press('Enter');
  for (let i = 0; i < 150; i++) {
    if (await countMsgs(page) > before) break;
    await page.waitForTimeout(400);
  }
  for (let i = 0; i < 120; i++) {
    if (await page.locator('[data-testid="msg-streaming"], [data-testid="chat-stop"]').count() === 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  const msgs = page.locator(ASST_MSG);
  const c = await msgs.count();
  return c > 0 ? (await msgs.nth(c - 1).innerText() || '') : '';
}

async function tryApply(page: Page): Promise<{ clicked: boolean; detail: string }> {
  const sel = 'button:has-text("Apply"):not([title]), button:has-text("Aplicar"):not([title])';
  await page.waitForTimeout(1000);
  const btns = page.locator(sel);
  const n = await btns.count();
  if (n === 0) {
    const all = page.locator('button:has-text("Apply"), button:has-text("Aplicar")');
    const ac = await all.count();
    const info: string[] = [];
    for (let i = 0; i < ac; i++) {
      const b = all.nth(i);
      const dis = await b.isDisabled().catch(() => false);
      const tit = await b.getAttribute('title').catch(() => '') || '';
      const txt = (await b.innerText().catch(() => '')).trim();
      info.push(`"${txt}" dis=${dis} title="${tit}"`);
    }
    return { clicked: false, detail: ac > 0 ? `${ac} btns: ${info.join('; ')}` : 'NO Apply btn' };
  }
  const target = btns.nth(n - 1);
  const dis = await target.isDisabled().catch(() => false);
  if (dis) return { clicked: false, detail: 'Apply DISABLED' };
  await target.click();
  await page.waitForTimeout(4000);
  const errEl = page.locator('span:has-text("No changes were saved"), span:has-text("Apply did not return")').first();
  const hasErr = await errEl.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasErr) return { clicked: true, detail: `NOOP: ${(await errEl.innerText().catch(() => '')).slice(0, 60)}` };
  const ok = page.locator('div:has-text("Applied successfully"), div:has-text("Aplicado com sucesso")').first();
  const hasOk = await ok.isVisible({ timeout: 2000 }).catch(() => false);
  return { clicked: true, detail: hasOk ? 'SUCCESS' : 'clicked' };
}

/** Close any chart modal that's open */
async function closeChartModal(page: Page) {
  const closeBtn = page.locator('button:has-text("×"), [aria-label="Close"], button.close-btn').first();
  if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
  }
  // Also try the X button on chart modal
  const xBtn = page.locator('button:has-text("✕"), button:has-text("close")').first();
  if (await xBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await xBtn.click();
    await page.waitForTimeout(500);
  }
}

async function shot(page: Page, name: string) {
  const p = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// ── The doc has: Sheet "SUMMARY 1"
// Rows 5-9: Phase 1 items (CABINS, F&B) with col C=description, D=dollar amounts
// Rows 11-19: Phase 2 items (CABINS, SPA, BOH, AMENITY) with same structure
// Col A=category, B=phase#, C=description, D=cost

interface QA { id: string; cat: string; prompt: string; expect: string; }

const TESTS: QA[] = [
  // ── CHART: bar chart with specific small range ──
  {
    id: '01', cat: 'CHART_BAR',
    prompt: 'Create a bar chart using ONLY the range C5:D9 from SUMMARY 1. Use column C as labels (x-axis) and column D as values (y-axis). Title: "Phase 1 Costs". Do NOT include any data outside C5:D9.',
    expect: 'Bar chart with 5 bars: Bison Lodge, Ridgetop, Douglas Fir, Ranch Hall + row 9',
  },
  // ── CHART: pie chart with exact 4 rows ──
  {
    id: '02', cat: 'CHART_PIE',
    prompt: 'Create a pie chart using ONLY cells C5:D8. Labels from C5:C8, values from D5:D8. Title: "Phase 1 Top 4 Items". Only 4 slices, nothing else.',
    expect: 'Pie chart with exactly 4 slices',
  },
  // ── SORT ──
  {
    id: '03', cat: 'SORT',
    prompt: 'Sort the rows 5 through 9 in SUMMARY 1 by column D in descending order so the most expensive item is at row 5',
    expect: 'Rows 5-9 reordered by cost descending',
  },
  // ── SUM formula ──
  {
    id: '04', cat: 'SUM',
    prompt: 'In cell D10 of SUMMARY 1, enter the formula =SUM(D5:D9) to calculate the Phase 1 total',
    expect: 'D10 shows sum of D5:D9',
  },
  // ── AVERAGE formula ──
  {
    id: '05', cat: 'AVERAGE',
    prompt: 'In cell E5 of SUMMARY 1, enter the formula =AVERAGE(D5:D9) to show the average Phase 1 cost',
    expect: 'E5 shows average of Phase 1 costs',
  },
  // ── CHART: line chart ──
  {
    id: '06', cat: 'CHART_LINE',
    prompt: 'Create a line chart using ONLY range C11:D19. Labels from column C, values from column D. Title: "Phase 2 Cost by Item". Do not include data outside C11:D19.',
    expect: 'Line chart with Phase 2 items',
  },
  // ── FORMAT as currency ──
  {
    id: '07', cat: 'FORMAT',
    prompt: 'Format cells D5:D9 in SUMMARY 1 as currency with dollar sign and no decimal places',
    expect: 'D5:D9 show $ format',
  },
  // ── CHART: horizontal/stacked bar comparing phases ──
  {
    id: '08', cat: 'CHART_STACKED',
    prompt: 'Create a stacked bar chart comparing Phase 1 total (sum of D5:D9) vs Phase 2 total (sum of D11:D19). Two bars labeled "Phase 1" and "Phase 2". Title: "Phase 1 vs Phase 2 Total Cost".',
    expect: 'Stacked bar chart comparing two phases',
  },
];

// ── main ──
test('XLSX Visual QA — Charts, Sort, Formulas, Compute', async ({ page }) => {
  test.setTimeout(480_000);
  fs.mkdirSync(SS_DIR, { recursive: true });

  let lastApi: { status: number; body: any } | null = null;
  await page.route('**/api/editing/apply', async (route) => {
    const resp = await route.fetch();
    let body: any = null;
    try { body = await resp.json(); } catch {}
    lastApi = { status: resp.status(), body };
    const rid = body?.data?.result?.revisionId ?? body?.data?.result?.newRevisionId ?? 'null';
    const noop = body?.data?.result?.applied === false;
    const err = body?.data?.error || body?.error || '';
    console.log(`    [API] apply → ${resp.status()} rev=${rid} noop=${noop}${err ? ' err=' + String(err).slice(0, 80) : ''}`);
    await route.fulfill({ response: resp });
  });

  await login(page, {
    email: process.env.E2E_EMAIL || 'test@koda.com',
    password: process.env.E2E_PASSWORD || 'test123',
    baseUrl: BASE,
  });

  await openDoc(page);
  await shot(page, 'qa00_doc');
  await openChat(page);
  await shot(page, 'qa01_chat');

  console.log(`\n── XLSX Visual QA (${TESTS.length} tests) ──\n`);

  const results: any[] = [];

  for (const t of TESTS) {
    const t0 = Date.now();
    lastApi = null;

    console.log(`  [${t.id}] ${t.cat}: ${t.prompt.slice(0, 80)}...`);

    try {
      // Close any open chart modal from previous test
      await closeChartModal(page);
      await openChat(page);

      const resp = await send(page, t.prompt);
      const respShort = resp.slice(0, 150).replace(/\n/g, ' ');
      console.log(`    resp: ${respShort}`);
      await shot(page, `qa_${t.id}_resp`);

      const apply = await tryApply(page);
      console.log(`    apply: ${apply.detail}`);

      let rev = 'null', apiErr = '';
      if (lastApi) {
        rev = String(lastApi.body?.data?.result?.revisionId ?? lastApi.body?.data?.result?.newRevisionId ?? 'null');
        if (lastApi.body?.data?.result?.applied === false) apiErr = 'NOOP';
        if (lastApi.body?.error || lastApi.body?.data?.error)
          apiErr = String(lastApi.body?.error || lastApi.body?.data?.error).slice(0, 80);
      }

      await page.waitForTimeout(2000);
      await shot(page, `qa_${t.id}_after`);

      const ms = Date.now() - t0;
      const status = apply.detail.includes('SUCCESS') ? 'PASS' : (apply.clicked ? 'PARTIAL' : 'FAIL');
      console.log(`  [${status}] ${t.id} ${t.cat} | ${ms}ms | rev=${rev.slice(0, 8)} ${apiErr}\n`);

      results.push({ id: t.id, cat: t.cat, applied: apply.clicked, detail: apply.detail, rev, apiErr, resp: respShort });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  [ERR] ${t.id}: ${msg}\n`);
      results.push({ id: t.id, cat: t.cat, applied: false, detail: 'exception', rev: 'null', apiErr: msg, resp: '' });
      await shot(page, `qa_${t.id}_err`);
    }
  }

  // summary
  console.log('\n' + '═'.repeat(100));
  console.log('  ID  CATEGORY        APPLIED   REV        DETAIL');
  console.log('─'.repeat(100));
  for (const r of results) {
    console.log(`  ${r.id}  ${r.cat.padEnd(16)} ${String(r.applied).padEnd(9)} ${r.rev.slice(0, 10).padEnd(10)} ${r.detail.slice(0, 50)}`);
  }
  const saved = results.filter((r: any) => r.rev !== 'null').length;
  console.log('─'.repeat(100));
  console.log(`  ${results.length} tests | ${saved} saved | ${results.length - saved} not saved`);
  console.log('═'.repeat(100));

  fs.writeFileSync(path.join(SS_DIR, 'results.json'), JSON.stringify(results, null, 2));
});
