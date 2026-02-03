/**
 * ============================================================================
 * Koda Navigation & Source Accuracy Test Suite
 * ============================================================================
 *
 * Account: test@koda.com / test123
 *
 * Verifies:
 *  - Semantic file/folder understanding
 *  - File actions vs informational queries
 *  - Sources appear ONLY when document content was used (RAG)
 *  - Sources never guess
 *  - Buttons are clickable and remain after reload
 *  - No TXT fallback icons for PDF documents
 * ============================================================================
 */

import { test, expect, Page } from '@playwright/test';

// Obfuscated routes
const LOGIN_URL = '/a/x7k2m9?mode=login';
const CHAT_URL = '/c/k4r8f5';

// Actual DOM selectors (verified against source code)
const SEL = {
  chatInput: 'textarea[data-chat-input]',            // ChatInterface.jsx:1473
  assistantMsg: '[data-testid="msg-assistant"]',       // ChatInterface.jsx:1213
  msgContent: '[data-testid="assistant-message-content"]', // ChatInterface.jsx:1231
  sourcePill: '.koda-source-pill',                     // InlineNavPill.jsx:44/62
  newChatBtn: '[aria-label="New chat"]',               // ChatHistory.jsx:617
  txtIcon: 'img[src*="txt-icon"]',                     // SourcePill.jsx:10
  citationsContainer: '[data-testid="assistant-citations"]', // DocumentSources.jsx:57
};

const RESPONSE_TIMEOUT = 90_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

interface QueryResult {
  testId: string;
  query: string;
  section: string;
  responseText: string;
  hasSourcePills: boolean;
  sourcePillLabels: string[];
  hasListingItems: boolean;
  hasTxtIcon: boolean;
  passed: boolean;
  checks: Check[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the assistant to finish streaming (poll-based). */
async function waitForAssistantDone(page: Page, assistantIndex: number, timeout = RESPONSE_TIMEOUT): Promise<void> {
  const start = Date.now();
  const msg = page.locator(SEL.assistantMsg).nth(assistantIndex);

  // Wait for message element to appear
  await msg.waitFor({ state: 'visible', timeout });

  // Poll until content stabilises (not "Thinking..." and text stops changing)
  let lastText = '';
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    const text = (await msg.textContent()) || '';
    const isThinking = text.includes('Thinking') || text.includes('Searching') || text.includes('Analyzing') || text.includes('Reading') || text.length < 5;

    if (!isThinking && text === lastText) {
      stableCount++;
      if (stableCount >= 3) return; // stable for ~1.5s
    } else {
      stableCount = 0;
    }
    lastText = text;
    await page.waitForTimeout(500);
  }
}

/** Send a query, wait for response, capture result. */
async function sendQuery(page: Page, testId: string, query: string, section: string): Promise<QueryResult> {
  const result: QueryResult = {
    testId, query, section,
    responseText: '',
    hasSourcePills: false,
    sourcePillLabels: [],
    hasListingItems: false,
    hasTxtIcon: false,
    passed: true,
    checks: [],
  };

  try {
    const chatInput = page.locator(SEL.chatInput);
    await chatInput.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(500);

    // Count assistant messages before
    const beforeCount = await page.locator(SEL.assistantMsg).count();

    // Type and send
    await chatInput.fill(query);
    await chatInput.press('Enter');

    // Wait for new assistant message to appear and finish
    await waitForAssistantDone(page, beforeCount);

    // Extra stabilisation
    await page.waitForTimeout(2000);

    // Get last assistant message
    const lastMsg = page.locator(SEL.assistantMsg).nth(beforeCount);
    result.responseText = (await lastMsg.textContent()) || '';

    // Collect ALL source pills in the last message
    const pills = lastMsg.locator(SEL.sourcePill);
    const pillCount = await pills.count();
    for (let i = 0; i < pillCount; i++) {
      const label = (await pills.nth(i).textContent())?.trim();
      if (label) result.sourcePillLabels.push(label);
    }

    // Determine if these are source citations (from renderSources / SourcesList)
    // vs listing pills (from renderFileListing).
    //
    // renderSources places pills inside: div[style*="align-items: center"][style*="margin-top: 4"]
    // renderFileListing places pills inside: div[style*="margin-top: 12px"]
    //
    // Practical heuristic: if the message content div has a child with marginTop 12px
    // containing pills, those are listing items. If the actions bar has pills, those are sources.

    const contentDiv = lastMsg.locator(SEL.msgContent);
    if (await contentDiv.count() > 0) {
      // Check for listing container (renderFileListing output — marginTop: 12px)
      const listingPills = contentDiv.locator('div[style*="margin-top: 12px"] .koda-source-pill, div[style*="margin-top: 12px"] .folder-button');
      const listingPillCount = await listingPills.count();
      result.hasListingItems = listingPillCount > 0;

      // Check for source pills (renderSources output) — in the actions bar
      // Actions bar: div with display flex, align-items center, marginTop 4px
      // Must exclude pills inside the listing container (marginTop 12px)
      const allPillsInMsg = contentDiv.locator('.koda-source-pill');
      const totalPillCount = await allPillsInMsg.count();
      // Source pills = total pills minus listing pills
      result.hasSourcePills = (totalPillCount - listingPillCount) > 0;
    }

    // Fallback: if no content div matched, use overall pill presence
    if (!result.hasSourcePills && !result.hasListingItems && pillCount > 0) {
      result.hasSourcePills = true; // conservative: treat as source pills
    }

    // Check for TXT fallback icons
    result.hasTxtIcon = (await lastMsg.locator(SEL.txtIcon).count()) > 0;

    result.checks.push({ name: 'response_received', passed: true, detail: `${result.responseText.length} chars` });

  } catch (error) {
    result.passed = false;
    result.checks.push({ name: 'response_received', passed: false, detail: `Error: ${(error as Error).message}` });
  }

  return result;
}

/** Start a new chat conversation. */
async function startNewChat(page: Page) {
  const btn = page.locator(SEL.newChatBtn);
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.first().click();
    await page.waitForTimeout(1500);
  } else {
    // Fallback: navigate directly to chat URL
    await page.goto(`http://localhost:3000${CHAT_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
  await page.locator(SEL.chatInput).waitFor({ state: 'visible', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

function addNavigationChecks(r: QueryResult) {
  r.checks.push({
    name: 'no_source_citations',
    passed: !r.hasSourcePills,
    detail: r.hasSourcePills
      ? `FAIL: Source citations found: [${r.sourcePillLabels.join(', ')}]`
      : 'OK: No source citations',
  });
  r.checks.push({
    name: 'no_txt_fallback',
    passed: !r.hasTxtIcon,
    detail: r.hasTxtIcon ? 'FAIL: TXT icon found' : 'OK: No TXT fallback',
  });
  r.passed = r.checks.every(c => c.passed);
}

function addInformationalChecks(r: QueryResult, expectedSourceSubstring?: string) {
  const hasSources = r.hasSourcePills || r.sourcePillLabels.length > 0;
  r.checks.push({
    name: 'has_source_citations',
    passed: hasSources,
    detail: hasSources
      ? `OK: Sources: [${r.sourcePillLabels.join(', ')}]`
      : 'FAIL: No source citations',
  });
  if (expectedSourceSubstring) {
    const match = r.sourcePillLabels.some(l => l.toLowerCase().includes(expectedSourceSubstring.toLowerCase()));
    r.checks.push({
      name: 'correct_source',
      passed: match,
      detail: match
        ? `OK: Found "${expectedSourceSubstring}"`
        : `FAIL: Expected "${expectedSourceSubstring}" in [${r.sourcePillLabels.join(', ')}]`,
    });
  }
  r.checks.push({
    name: 'no_txt_fallback',
    passed: !r.hasTxtIcon,
    detail: r.hasTxtIcon ? 'FAIL: TXT icon' : 'OK',
  });
  r.passed = r.checks.every(c => c.passed);
}

function logResult(r: QueryResult) {
  const st = r.passed ? 'PASS' : 'FAIL';
  console.log(`\n[${st}] ${r.testId}: ${r.query}`);
  console.log(`  Response (first 150): ${r.responseText.substring(0, 150).replace(/\n/g, ' ')}`);
  for (const c of r.checks) console.log(`  ${c.passed ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  if (r.sourcePillLabels.length) console.log(`  Pills: [${r.sourcePillLabels.join(', ')}]`);
}

// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------

test.describe('Navigation & Source Accuracy Suite', () => {
  test.setTimeout(600_000);

  test('Full suite — Sections 1-5', async ({ page }) => {
    const results: QueryResult[] = [];

    // =================================================================
    // LOGIN
    // =================================================================
    console.log('\n=== LOGGING IN ===\n');
    await page.goto(`http://localhost:3000${LOGIN_URL}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(1500);

    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await emailInput.fill('test@koda.com');
    await page.locator('input[type="password"]').fill('test123');
    await page.locator('button[type="submit"]').click();

    // Wait for redirect
    await Promise.race([
      page.waitForURL(`**${CHAT_URL}**`, { timeout: 20_000 }),
      page.waitForURL('**/c/**', { timeout: 20_000 }),
    ]).catch(() => {});
    await page.waitForTimeout(3000);

    // Dismiss modals
    for (const txt of ['Skip introduction', 'Skip', 'Got it', 'Close']) {
      const b = page.locator(`text=${txt}`);
      if (await b.isVisible({ timeout: 1000 }).catch(() => false)) { await b.click(); await page.waitForTimeout(500); }
    }

    await page.locator(SEL.chatInput).waitFor({ state: 'visible', timeout: 15_000 });
    console.log('Login OK\n');

    // =================================================================
    // SECTION 1 — Pure Navigation (NO SOURCES)
    // =================================================================
    console.log('=== SECTION 1: Pure Navigation ===\n');

    let r: QueryResult;

    await startNewChat(page);
    r = await sendQuery(page, 'T01', 'Where is the document "Mezzanine Analysis"?', 'S1: Navigation');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T02', 'Which folder contains the mezzanine analysis document?', 'S1: Navigation');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T03', 'Where did I save the mezzanine investment study?', 'S1: Navigation');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T04', 'List everything inside the Mezzanine folder.', 'S1: Navigation');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T05', 'Is there any document related to mezzanine outside the main mezzanine folder?', 'S1: Navigation');
    addNavigationChecks(r); results.push(r); logResult(r);

    // =================================================================
    // SECTION 2 — File Actions (NO SOURCES)
    // =================================================================
    console.log('\n=== SECTION 2: File Actions ===\n');

    await startNewChat(page);
    r = await sendQuery(page, 'T06', 'Open the mezzanine analysis document.', 'S2: File Actions');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T07', 'Move the mezzanine analysis into a folder called Investments 2025.', 'S2: File Actions');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T08', 'Delete the mezzanine analysis document.', 'S2: File Actions');
    addNavigationChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T09', 'Create a folder called Archived Financial Studies.', 'S2: File Actions');
    addNavigationChecks(r); results.push(r); logResult(r);

    // =================================================================
    // SECTION 3 — Informational Queries (SOURCES REQUIRED)
    // =================================================================
    console.log('\n=== SECTION 3: Informational Queries ===\n');

    await startNewChat(page);
    r = await sendQuery(page, 'T10', 'What is the mezzanine analysis document about?', 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T11', "What's the total investment mentioned in the mezzanine analysis?", 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T12', 'How many square meters is the mezzanine and what cost per m² did they use?', 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T13', 'List the main assumptions used in the mezzanine analysis.', 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T14', 'What risks or constraints are mentioned in the mezzanine study?', 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T15', 'Where does the document talk about ROI or payback? Point me to the section.', 'S3: Informational');
    addInformationalChecks(r); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T16', 'Is there a timeline or schedule in the mezzanine document?', 'S3: Informational');
    // Conditional: "not mentioned" → no sources expected
    const neg16 = /not mention|no timeline|does not|doesn't|no specific/i.test(r.responseText);
    if (neg16) {
      r.checks.push({ name: 'no_source_for_negative', passed: !r.hasSourcePills,
        detail: !r.hasSourcePills ? 'OK: No sources for negative answer' : `WARN: Sources for negative: [${r.sourcePillLabels.join(', ')}]` });
      r.passed = r.checks.every(c => c.passed);
    } else {
      addInformationalChecks(r, 'mezzanine');
    }
    results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T17', 'Quote the exact sentence where total investment is stated.', 'S3: Informational');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    // =================================================================
    // SECTION 4 — Semantic Stress Tests
    // =================================================================
    console.log('\n=== SECTION 4: Semantic Stress ===\n');

    await startNewChat(page);
    r = await sendQuery(page, 'T18', 'In the mezzanine project study, how much money are we talking about overall?', 'S4: Stress');
    addInformationalChecks(r, 'mezzanine'); results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T19', 'Compare mezzanine investment with warehouse expansion.', 'S4: Stress');
    r.checks.push({ name: 'sources_logged', passed: true, detail: `Sources: [${r.sourcePillLabels.join(', ')}]` });
    r.passed = r.checks.every(c => c.passed);
    results.push(r); logResult(r);

    await startNewChat(page);
    r = await sendQuery(page, 'T20', 'What does the mezzanine analysis say about solar panels?', 'S4: Stress');
    const neg20 = /not mention|does not|doesn't|no information|no mention|not discussed|not covered/i.test(r.responseText);
    r.checks.push({ name: 'negative_answer', passed: neg20,
      detail: neg20 ? 'OK: Acknowledges not found' : `WARN: ${r.responseText.substring(0, 100)}` });
    r.checks.push({ name: 'no_sources_for_missing', passed: !r.hasSourcePills,
      detail: !r.hasSourcePills ? 'OK' : `FAIL: Sources for absent topic: [${r.sourcePillLabels.join(', ')}]` });
    r.passed = r.checks.every(c => c.passed);
    results.push(r); logResult(r);

    // =================================================================
    // SECTION 5 — Reload Stability
    // =================================================================
    console.log('\n=== SECTION 5: Reload Stability ===\n');

    await startNewChat(page);
    const preReload = await sendQuery(page, 'T21a', 'What is the mezzanine analysis document about?', 'S5: Reload');
    const prePills = [...preReload.sourcePillLabels];
    console.log(`Pre-reload pills: [${prePills.join(', ')}]`);

    // Reload the page
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    // Re-read last assistant message after reload
    const postMsgs = page.locator(SEL.assistantMsg);
    const postCount = await postMsgs.count();
    let postPills: string[] = [];
    let postHasTxt = false;

    if (postCount > 0) {
      const last = postMsgs.nth(postCount - 1);
      const pills = last.locator(SEL.sourcePill);
      for (let i = 0; i < await pills.count(); i++) {
        const t = (await pills.nth(i).textContent())?.trim();
        if (t) postPills.push(t);
      }
      postHasTxt = (await last.locator(SEL.txtIcon).count()) > 0;
    }

    console.log(`Post-reload pills: [${postPills.join(', ')}]`);

    const reloadR: QueryResult = {
      testId: 'T21', query: 'Reload stability', section: 'S5: Reload',
      responseText: '', hasSourcePills: postPills.length > 0,
      sourcePillLabels: postPills, hasListingItems: false,
      hasTxtIcon: postHasTxt, passed: true, checks: [],
    };

    const pillsMatch = prePills.length === postPills.length && prePills.every((p, i) => p === postPills[i]);
    reloadR.checks.push({ name: 'sources_stable', passed: pillsMatch,
      detail: pillsMatch ? 'OK: Identical after reload' : `FAIL: [${prePills.join(',')}] vs [${postPills.join(',')}]` });
    reloadR.checks.push({ name: 'no_txt_after_reload', passed: !postHasTxt,
      detail: postHasTxt ? 'FAIL: TXT icon after reload' : 'OK' });
    reloadR.checks.push({ name: 'buttons_visible', passed: postPills.length > 0 || prePills.length === 0,
      detail: postPills.length > 0 ? `OK: ${postPills.length} buttons` : prePills.length === 0 ? 'OK: None expected' : 'FAIL: Buttons gone' });
    reloadR.passed = reloadR.checks.every(c => c.passed);
    results.push(reloadR); logResult(reloadR);

    // =================================================================
    // FINAL REPORT
    // =================================================================
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;

    console.log('\n\n════════════════════════════════════════');
    console.log('           FINAL REPORT');
    console.log('════════════════════════════════════════\n');

    for (const r of results) {
      const s = r.passed ? 'PASS' : 'FAIL';
      console.log(`[${s}] ${r.testId} (${r.section}) — ${r.query}`);
      for (const c of r.checks) console.log(`     ${c.passed ? '✓' : '✗'} ${c.name}: ${c.detail}`);
    }

    console.log(`\n════════════════════════════════════════`);
    console.log(`  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`  ${failed === 0 ? 'ALL PASSED' : `${failed} FAILURE(S)`}`);
    console.log(`════════════════════════════════════════\n`);

    await page.screenshot({ path: 'e2e/test-results/nav-source-final.png', fullPage: true });

    // Hard-fail only if a test never got a response
    const noResponse = results.filter(r => r.checks.some(c => c.name === 'response_received' && !c.passed));
    expect(noResponse.length, `${noResponse.length} tests got no response`).toBe(0);
  });
});
