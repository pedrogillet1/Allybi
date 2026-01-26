/**
 * ============================================================================
 * CONVERSATION MARATHON TEST — Single-Document Coherent 50-Turn
 * ============================================================================
 *
 * Tests ChatGPT-like behavior by:
 * 1. Anchoring on ONE document in turn 1
 * 2. Using "this file" phrasing to maintain scope
 * 3. Running followups that depend on previous answers
 * 4. Testing typo tolerance
 * 5. Validating rendering (bullets, tables, bold, no raw markers)
 *
 * IMPORTANT: Run with --workers=1 to ensure single conversation continuity
 *
 * Run: npx playwright test conversation-marathon.spec.ts --workers=1 --headed
 * ============================================================================
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  account: {
    email: process.env.E2E_TEST_EMAIL || 'test@koda.com',
    password: process.env.E2E_TEST_PASSWORD || 'test123',
  },
  urls: {
    base: process.env.E2E_BASE_URL || 'http://localhost:3000',
  },
  timeouts: {
    login: 15000,
    navigation: 10000,
    messageStart: 15000,
    messageComplete: 60000,
    betweenQueries: 1500,
  },
  minPassRate: 0.70,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SELECTORS
// ═══════════════════════════════════════════════════════════════════════════════

const SEL = {
  // Auth
  emailInput: 'input[type="email"], input[name="email"]',
  passwordInput: 'input[type="password"]',
  loginButton: 'button[type="submit"]',

  // Chat
  chatInput: 'textarea[placeholder*="Ask Koda"], textarea[placeholder*="message"], [data-testid="chat-input"]',
  sendButton: 'button[type="submit"]:has-text("Send")',
  newChatButton: 'button:has-text("New Chat"), [data-testid="new-chat"]',

  // Messages
  assistantMessage: '[data-testid="msg-assistant"], .assistant-message',
  streamingMessage: '[data-testid="msg-streaming"], .streaming-message',
  markdownContainer: '[data-testid="msg-assistant"] .markdown-preview-container, [data-testid="msg-assistant"] .koda-markdown, .assistant-message .markdown-preview-container',
  streamingCursor: '.streaming-cursor',

  // UI elements
  sourceButtons: '.source-buttons-container button, .citation-button-listing, [data-testid="assistant-citations"] button',
  fileActionButtons: '.file-action-container button, .attachments-container button',

  // Modals
  skipButton: 'text=Skip introduction',
  closeModalX: 'button:has([class*="close"]), button[aria-label="Close"], .modal-close, [data-testid="close-modal"]',
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Query {
  id: string;
  text: string;
}

interface Phase {
  name: string;
  queries: Query[];
}

interface RenderingCheck {
  hasBullets: boolean;
  hasTable: boolean;
  hasBold: boolean;
  hasSourceButtons: boolean;
  rawMarkersFound: string[];
}

interface QueryResult {
  id: string;
  query: string;
  phase: string;
  passed: boolean;
  answer: string;
  answerLength: number;
  ttftMs: number;
  totalMs: number;
  rendering: RenderingCheck;
  assertions: { name: string; passed: boolean; message: string }[];
  failureReasons: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSERTION VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_PHRASES = [
  'rephrase',
  'could you rephrase',
  "i don't see any documents",
  'no documents',
  "haven't uploaded any",
  'upload some documents',
  "couldn't find relevant",
  "i don't have access",
];

const RAW_MARKERS = [
  '{{DOC::',
  '[[DOC_',
  '{{CITE::',
  '[[CITE_',
  '{{SOURCE::',
];

function checkNoFallback(answer: string): { passed: boolean; message: string } {
  const lower = answer.toLowerCase();
  for (const phrase of FALLBACK_PHRASES) {
    if (lower.includes(phrase)) {
      return { passed: false, message: `Fallback detected: "${phrase}"` };
    }
  }
  return { passed: true, message: 'No fallback phrases' };
}

function checkNoRawMarkers(answer: string): { passed: boolean; message: string; markers: string[] } {
  const found: string[] = [];
  for (const marker of RAW_MARKERS) {
    if (answer.includes(marker)) {
      found.push(marker);
    }
  }
  if (found.length > 0) {
    return { passed: false, message: `Raw markers visible: ${found.join(', ')}`, markers: found };
  }
  return { passed: true, message: 'No raw markers', markers: [] };
}

function checkNoTruncation(answer: string): { passed: boolean; message: string } {
  const trimmed = answer.trim();
  if (!trimmed) return { passed: true, message: 'Empty response (may be button-only)' };

  // Check for dangling list markers (clear truncation signal)
  if (/^[-*]\s*$/m.test(trimmed) || /^\d+\.\s*$/m.test(trimmed)) {
    return { passed: false, message: 'Dangling list marker detected' };
  }

  // Check for obvious mid-word truncation (word cut off)
  const lastWord = trimmed.split(/\s+/).pop() || '';
  if (lastWord.length === 1 && /[a-z]/i.test(lastWord)) {
    // Single letter at end is suspicious unless it's "a" or "I"
    if (!/^[aAiI]$/.test(lastWord)) {
      return { passed: false, message: 'Response appears cut mid-word' };
    }
  }

  // Check for incomplete sentences ending with conjunctions/prepositions
  const truncationEndings = /\s+(and|or|but|the|a|an|to|of|in|for|with|on|at|by|from|as|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|this|that|these|those|which|who|whom|whose|where|when|why|how)\s*$/i;
  if (truncationEndings.test(trimmed)) {
    return { passed: false, message: 'Response ends with incomplete clause' };
  }

  // Check for trailing ellipsis in short response (under 100 chars is suspicious)
  if (/\.\.\.\s*$/.test(trimmed) && trimmed.length < 100) {
    return { passed: false, message: 'Suspicious trailing ellipsis' };
  }

  // Response looks complete enough
  return { passed: true, message: 'No truncation detected' };
}

function checkNotEmpty(answer: string, hasButtons: boolean): { passed: boolean; message: string } {
  if (hasButtons) {
    return { passed: true, message: 'Response has buttons (button-only mode OK)' };
  }
  if (!answer || answer.trim().length < 10) {
    return { passed: false, message: 'Response is empty or too short' };
  }
  return { passed: true, message: 'Response has content' };
}

function checkNoSourcesTextBlock(answer: string): { passed: boolean; message: string } {
  // Sources should be buttons, not a "Sources:" text block
  if (/^Sources?:\s*$/im.test(answer) || /\nSources?:\s*\n/i.test(answer)) {
    return { passed: false, message: 'Found "Sources:" text block (should be buttons)' };
  }
  return { passed: true, message: 'No "Sources:" text block' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERING CHECKS (HTML-level)
// ═══════════════════════════════════════════════════════════════════════════════

async function checkRendering(page: Page): Promise<RenderingCheck> {
  const lastMsg = page.locator(SEL.assistantMessage).last();

  // Check for proper bullet rendering (real <li> items)
  const bulletCount = await lastMsg.locator('li').count().catch(() => 0);

  // Check for proper table rendering
  const tableCount = await lastMsg.locator('table').count().catch(() => 0);
  const hasProperTable = tableCount > 0 &&
    await lastMsg.locator('table thead, table th').count().catch(() => 0) > 0;

  // Check for proper bold rendering (<strong> or <b>)
  const boldCount = await lastMsg.locator('strong, b').count().catch(() => 0);

  // Check for source buttons
  const sourceButtonCount = await lastMsg.locator(SEL.sourceButtons).count().catch(() => 0);

  // Get text to check for raw markers
  const text = await lastMsg.innerText().catch(() => '');
  const markerCheck = checkNoRawMarkers(text);

  return {
    hasBullets: bulletCount > 0,
    hasTable: hasProperTable,
    hasBold: boldCount > 0,
    hasSourceButtons: sourceButtonCount > 0,
    rawMarkersFound: markerCheck.markers,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function loadMarathonQueries(): { phases: Record<string, Phase>; targetDocument: string } {
  // Default to LMR plan fixture (most comprehensive test)
  let fixture = 'marathon-lmr-plan.json';
  if (process.env.MARATHON_ROSEWOOD) {
    fixture = 'marathon-single-doc.json';
  } else if (process.env.MARATHON_QUICK) {
    fixture = 'marathon-quick.json';
  } else if (process.env.MARATHON_LEGACY) {
    fixture = 'marathon-docs.json';
  }
  const fixturePath = path.join(__dirname, 'fixtures', fixture);
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  return {
    phases: data.phases,
    targetDocument: data.targetDocument || 'unknown',
  };
}

function createRunDir(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(__dirname, 'runs/marathon', timestamp);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.configure({ mode: 'serial' });

test.describe('Conversation Marathon (Single Document)', () => {
  let page: Page;
  let runDir: string;
  let allResults: QueryResult[] = [];

  test.beforeAll(async ({ browser }) => {
    runDir = createRunDir();
    console.log('\n' + '═'.repeat(60));
    console.log('CONVERSATION MARATHON - SINGLE DOCUMENT TEST');
    console.log(`Run directory: ${runDir}`);
    console.log('═'.repeat(60) + '\n');

    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate
    console.log('[SETUP] Navigating to app...');
    await page.goto(CONFIG.urls.base);
    await page.waitForTimeout(2000);

    // Dismiss modals
    for (let i = 0; i < 5; i++) {
      const skipButton = page.locator(SEL.skipButton);
      if (await skipButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[SETUP] Dismissing modal (attempt ${i + 1})...`);
        await skipButton.click();
        await page.waitForTimeout(500);
        continue;
      }
      const closeX = page.locator(SEL.closeModalX);
      if (await closeX.first().isVisible({ timeout: 500 }).catch(() => false)) {
        await closeX.first().click();
        await page.waitForTimeout(500);
        continue;
      }
      break;
    }

    // Login if needed
    const emailInput = page.locator(SEL.emailInput);
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[SETUP] Logging in...');
      await emailInput.fill(CONFIG.account.email);
      const passwordInput = page.locator(SEL.passwordInput);
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(CONFIG.account.password);
      }
      await page.locator(SEL.loginButton).click();
      await page.waitForTimeout(5000);
      console.log('[SETUP] Login complete');
    }

    // Dismiss post-login modals
    for (let i = 0; i < 5; i++) {
      const skipButton = page.locator(SEL.skipButton);
      if (await skipButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[SETUP] Post-login modal (attempt ${i + 1})...`);
        await skipButton.click();
        await page.waitForTimeout(500);
        continue;
      }
      break;
    }

    // Start new chat
    console.log('[SETUP] Creating new conversation...');
    const newChatButton = page.locator(SEL.newChatButton);
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    await page.locator(SEL.chatInput).waitFor({ state: 'visible', timeout: 10000 });
    console.log('[SETUP] Chat ready\n');
  });

  test.afterAll(async () => {
    const report = generateReport(allResults);
    fs.writeFileSync(
      path.join(runDir, 'MARATHON_REPORT.json'),
      JSON.stringify(report, null, 2)
    );

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('MARATHON RESULTS');
    console.log('═'.repeat(60));
    console.log(`Total Queries: ${report.totalQueries}`);
    console.log(`Passed: ${report.passed} (${report.passRate})`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Avg TTFT: ${report.timing.avgTtft}ms`);
    console.log(`Avg Total: ${report.timing.avgTotal}ms`);
    console.log('');
    console.log('By Phase:');
    for (const [phase, stats] of Object.entries(report.byPhase)) {
      const rate = ((stats.passed / stats.total) * 100).toFixed(0);
      console.log(`  ${phase}: ${stats.passed}/${stats.total} (${rate}%)`);
    }

    // Rendering stats
    console.log('');
    console.log('Rendering:');
    console.log(`  Bullets rendered: ${report.rendering.withBullets}`);
    console.log(`  Tables rendered: ${report.rendering.withTables}`);
    console.log(`  Raw markers leaked: ${report.rendering.rawMarkersLeaked}`);
    console.log('═'.repeat(60));

    if (page) await page.close();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN TEST
  // ═══════════════════════════════════════════════════════════════════════════════

  test('50-Turn Single Document Marathon', async () => {
    const { phases, targetDocument } = loadMarathonQueries();

    console.log(`Target document: ${targetDocument}\n`);

    for (const [phaseKey, phase] of Object.entries(phases)) {
      console.log(`\n━━━ Phase ${phaseKey}: ${phase.name} ━━━`);

      for (const query of phase.queries) {
        try {
          const result = await runQuery(page, query, phaseKey);
          allResults.push(result);

          const status = result.passed ? '✓' : '✗';
          const renderInfo = [];
          if (result.rendering.hasBullets) renderInfo.push('bullets');
          if (result.rendering.hasTable) renderInfo.push('table');
          if (result.rendering.hasSourceButtons) renderInfo.push('sources');

          console.log(`  ${status} [${query.id}] ${query.text.substring(0, 40)}...`);
          if (renderInfo.length > 0) {
            console.log(`     └─ Rendered: ${renderInfo.join(', ')}`);
          }
          if (!result.passed) {
            console.log(`     └─ FAIL: ${result.failureReasons.join('; ')}`);
          }

          await page.waitForTimeout(CONFIG.timeouts.betweenQueries);
        } catch (err) {
          console.log(`  ✗ [${query.id}] ERROR: ${err}`);
          allResults.push({
            id: query.id,
            query: query.text,
            phase: phaseKey,
            passed: false,
            answer: '',
            answerLength: 0,
            ttftMs: 0,
            totalMs: 0,
            rendering: { hasBullets: false, hasTable: false, hasBold: false, hasSourceButtons: false, rawMarkersFound: [] },
            assertions: [],
            failureReasons: [`Execution error: ${err}`],
          });
        }
      }
    }

    const passRate = allResults.filter(r => r.passed).length / allResults.length;
    console.log(`\nFinal pass rate: ${(passRate * 100).toFixed(1)}%`);
    expect(passRate, `Pass rate ${(passRate * 100).toFixed(1)}% below ${CONFIG.minPassRate * 100}% threshold`)
      .toBeGreaterThanOrEqual(CONFIG.minPassRate);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runQuery(page: Page, query: Query, phase: string): Promise<QueryResult> {
  const startTime = Date.now();
  let ttftMs = 0;

  const msgsBefore = await page.locator(SEL.assistantMessage).count();

  // Send message
  const input = page.locator(SEL.chatInput);
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.fill(query.text);
  await input.press('Enter');

  // Wait for TTFT
  try {
    await Promise.race([
      page.locator(SEL.streamingMessage).waitFor({ state: 'visible', timeout: CONFIG.timeouts.messageStart }),
      page.waitForFunction(
        ({ beforeCount, selector }) => document.querySelectorAll(selector).length > beforeCount,
        { beforeCount: msgsBefore, selector: SEL.assistantMessage },
        { timeout: CONFIG.timeouts.messageStart }
      ),
    ]);
    ttftMs = Date.now() - startTime;
  } catch {
    ttftMs = Date.now() - startTime;
  }

  // Wait for streaming complete
  try {
    await Promise.race([
      page.locator(SEL.streamingCursor).waitFor({ state: 'hidden', timeout: CONFIG.timeouts.messageComplete }),
      page.locator(SEL.streamingMessage).waitFor({ state: 'hidden', timeout: CONFIG.timeouts.messageComplete }),
    ]);
  } catch {
    await page.waitForTimeout(5000);
  }

  await page.waitForTimeout(500);
  const totalMs = Date.now() - startTime;

  // Get answer text
  const messages = page.locator(SEL.markdownContainer);
  const count = await messages.count();

  let answer = '';
  if (count > 0) {
    try {
      answer = await messages.nth(count - 1).innerText({ timeout: 2000 });
    } catch {
      const lastAssistant = page.locator(SEL.assistantMessage).last();
      answer = await lastAssistant.innerText({ timeout: 2000 }).catch(() => '');
    }
  } else {
    const lastAssistant = page.locator(SEL.assistantMessage).last();
    answer = await lastAssistant.innerText({ timeout: 2000 }).catch(() => '');
  }

  // Check for buttons
  const lastMsg = page.locator(SEL.assistantMessage).last();
  const hasButtons = await lastMsg.locator('button, .file-action-container, .attachments-container').count().catch(() => 0) > 0;

  // Rendering checks
  const rendering = await checkRendering(page);

  // Run assertions
  const assertions = [
    { name: 'not_empty', ...checkNotEmpty(answer, hasButtons) },
    { name: 'no_fallback', ...checkNoFallback(answer) },
    { name: 'no_raw_markers', ...checkNoRawMarkers(answer) },
    { name: 'no_truncation', ...checkNoTruncation(answer) },
    { name: 'no_sources_text', ...checkNoSourcesTextBlock(answer) },
  ];

  const failedAssertions = assertions.filter(a => !a.passed);
  const passed = failedAssertions.length === 0;

  return {
    id: query.id,
    query: query.text,
    phase,
    passed,
    answer: hasButtons && !answer.trim() ? '[BUTTONS_ONLY]' : answer.substring(0, 500),
    answerLength: answer.length,
    ttftMs,
    totalMs,
    rendering,
    assertions,
    failureReasons: failedAssertions.map(a => a.message),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════════

interface MarathonReport {
  timestamp: string;
  totalQueries: number;
  passed: number;
  failed: number;
  passRate: string;
  byPhase: Record<string, { total: number; passed: number; failed: number }>;
  rendering: {
    withBullets: number;
    withTables: number;
    withSourceButtons: number;
    rawMarkersLeaked: number;
  };
  failures: QueryResult[];
  timing: { avgTtft: number; avgTotal: number };
}

function generateReport(results: QueryResult[]): MarathonReport {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  const byPhase: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const r of results) {
    if (!byPhase[r.phase]) byPhase[r.phase] = { total: 0, passed: 0, failed: 0 };
    byPhase[r.phase].total++;
    if (r.passed) byPhase[r.phase].passed++;
    else byPhase[r.phase].failed++;
  }

  const ttfts = results.map(r => r.ttftMs).filter(t => t > 0);
  const totals = results.map(r => r.totalMs).filter(t => t > 0);

  return {
    timestamp: new Date().toISOString(),
    totalQueries: results.length,
    passed,
    failed,
    passRate: `${((passed / results.length) * 100).toFixed(1)}%`,
    byPhase,
    rendering: {
      withBullets: results.filter(r => r.rendering.hasBullets).length,
      withTables: results.filter(r => r.rendering.hasTable).length,
      withSourceButtons: results.filter(r => r.rendering.hasSourceButtons).length,
      rawMarkersLeaked: results.filter(r => r.rendering.rawMarkersFound.length > 0).length,
    },
    failures: results.filter(r => !r.passed),
    timing: {
      avgTtft: Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) || 0,
      avgTotal: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) || 0,
    },
  };
}
