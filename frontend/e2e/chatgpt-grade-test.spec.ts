/**
 * CHATGPT-GRADE E2E TEST HARNESS
 *
 * Runs 100 queries in a single conversation with:
 * - Full observability (timing, routing, DOM snapshots)
 * - Strict UX contract validation
 * - Failure classification by category
 * - Proof artifacts generation
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { runAssertions, AssertionResult, checkTiming, TimingThresholds } from './lib/validators';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_CONFIG = {
  account: {
    email: 'test@koda.com',
    password: 'test123',
  },
  timeouts: {
    login: 15000,
    navigation: 10000,
    messageStart: 10000,  // Wait for first token
    messageComplete: 30000, // Wait for full response
    hardFail: 60000, // Abort threshold
  },
  urls: {
    base: 'http://localhost:3000',
    login: 'http://localhost:3000/login',
    chat: 'http://localhost:3000/chat',
  },
};

const THRESHOLDS: TimingThresholds = {
  ttft: {
    metadata_queries_ms: 600,
    semantic_queries_ms: 1200,
    warn_ms: 3000,
    fail_ms: 8000,
  },
  total_response: {
    simple_ms: 5000,
    complex_ms: 15000,
    fail_ms: 30000,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Query {
  id: string;
  text: string;
  expectType: string;
  expectRoute: string;
  assertions: string[];
}

interface Phase {
  name: string;
  description: string;
  queries: Query[];
}

interface QueryResult {
  id: string;
  query: string;
  phase: string;
  passed: boolean;
  answer: string;
  answerHTML: string;
  ttftMs: number;
  totalMs: number;
  streamingChunks: number;
  assertions: AssertionResult[];
  failureReasons: string[];
  failureCategory?: string;
  screenshotPath?: string;
  domPath?: string;
}

interface TestReport {
  timestamp: string;
  runDir: string;
  baseline: any;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: string;
    fallbackCount: number;
  };
  timing: {
    ttft_p50: number;
    ttft_p95: number;
    total_p50: number;
    total_p95: number;
  };
  byPhase: Record<string, { total: number; passed: number; failed: number }>;
  failures: QueryResult[];
  allResults: QueryResult[];
  launchGate: {
    inventoryWorks: boolean;
    filtersWork: boolean;
    contextSurvives: boolean;
    buttonsRender: boolean;
    noFallbacks: boolean;
    frontendMatchesBackend: boolean;
    verdict: 'GO' | 'NO-GO';
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function loadQueries(): { phases: Record<string, Phase>; fallbackPhrases: string[] } {
  const queriesPath = path.join(__dirname, 'conversation_queries.json');
  const data = JSON.parse(fs.readFileSync(queriesPath, 'utf-8'));
  return {
    phases: data.phases,
    fallbackPhrases: data.fallback_phrases || [],
  };
}

function createRunDir(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(__dirname, 'runs', timestamp);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(runDir, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'dom'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'logs'), { recursive: true });
  return runDir;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function classifyFailure(result: QueryResult): string {
  const reasons = result.failureReasons.join(' ').toLowerCase();

  if (reasons.includes('fallback')) {
    return 'E_FALLBACK_MISUSE';
  }
  if (reasons.includes('no file button') || reasons.includes('missing')) {
    return 'D_FORMATTING_RENDER';
  }
  if (reasons.includes('list formatting') || reasons.includes('numbered')) {
    return 'D_FORMATTING_RENDER';
  }
  if (reasons.includes('context') || reasons.includes('follow-up')) {
    return 'C_CONTEXT_LOSS';
  }
  if (reasons.includes('too slow') || reasons.includes('ttft')) {
    return 'F_PERFORMANCE';
  }
  if (reasons.includes('not found') || reasons.includes('wrong')) {
    return 'B_RETRIEVAL_ERROR';
  }
  return 'A_ROUTING_ERROR';
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HARNESS - Single Sequential Mega-Conversation
// ═══════════════════════════════════════════════════════════════════════════════

// Force single worker, serial execution for true conversation continuity
test.describe.configure({ mode: 'serial' });

test.describe('ChatGPT-Grade E2E Test', () => {
  let page: Page;
  let runDir: string;
  let allResults: QueryResult[] = [];
  let conversationId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    // Create run directory
    runDir = createRunDir();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CHATGPT-GRADE E2E TEST - SINGLE CONVERSATION`);
    console.log(`Run directory: ${runDir}`);
    console.log(`${'='.repeat(60)}\n`);

    // Create new browser context
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to app
    console.log('[SETUP] Navigating to app...');
    await page.goto(TEST_CONFIG.urls.base);
    await page.waitForTimeout(2000);

    // Handle onboarding modal if present
    const skipButton = page.locator('text=Skip introduction, button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    // Close any other modals
    const closeButton = page.locator('button:has-text("×"), button[aria-label="Close"]');
    if (await closeButton.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.first().click();
    }

    // Check if need to login
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[SETUP] Logging in as test@koda.com...');
      await emailInput.fill(TEST_CONFIG.account.email);

      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill(TEST_CONFIG.account.password);
      }

      const loginButton = page.locator('button[type="submit"]');
      await loginButton.click();

      // Wait for chat to load
      await page.waitForTimeout(5000);
      console.log('[SETUP] Login successful');
    }

    // Handle onboarding modal AGAIN after login
    const skipButton2 = page.locator('text=Skip introduction');
    if (await skipButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton2.click();
      await page.waitForTimeout(1000);
    }

    // Start new chat to ensure clean conversation
    console.log('[SETUP] Creating new conversation...');
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    // Wait for chat input to be ready (using flexible selectors)
    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], textarea[placeholder*="message"], [data-testid="chat-input"]');
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[SETUP] Chat input ready');

    // Get conversation ID from URL
    const url = page.url();
    const match = url.match(/conversation[s]?\/([a-f0-9-]+)/i);
    if (match) {
      conversationId = match[1];
      console.log(`[SETUP] Conversation ID: ${conversationId}`);
    }

    // Save baseline info
    const baselineInfo = {
      timestamp: new Date().toISOString(),
      account: TEST_CONFIG.account.email,
      conversationId,
      runDir,
    };
    fs.writeFileSync(
      path.join(runDir, 'baseline.json'),
      JSON.stringify(baselineInfo, null, 2)
    );
  });

  test.afterAll(async () => {
    // Generate final report
    const report = generateReport(allResults, runDir);

    // Save report
    fs.writeFileSync(
      path.join(runDir, 'FINAL_REPORT.json'),
      JSON.stringify(report, null, 2)
    );

    // Generate markdown report
    const mdReport = generateMarkdownReport(report);
    fs.writeFileSync(path.join(runDir, 'FINAL_REPORT.md'), mdReport);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Total: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed} (${report.summary.passRate})`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Fallback Count: ${report.summary.fallbackCount}`);
    console.log(`TTFT p50/p95: ${report.timing.ttft_p50}ms / ${report.timing.ttft_p95}ms`);
    console.log(`Total p50/p95: ${report.timing.total_p50}ms / ${report.timing.total_p95}ms`);
    console.log('');
    console.log('LAUNCH GATE:', report.launchGate.verdict);
    console.log('='.repeat(60));

    if (page) await page.close();
  });

  // Single mega-test that runs ALL 100 queries sequentially
  test('100-Query Mega-Conversation', async () => {
    const { phases } = loadQueries();

    // Iterate through all phases and queries
    for (const [phaseKey, phase] of Object.entries(phases)) {
      console.log(`\n=== Phase ${phaseKey}: ${phase.name} ===`);

      for (const query of phase.queries) {
        try {
          const result = await runQuery(page, query, phaseKey, runDir);
          allResults.push(result);

          if (!result.passed) {
            console.log(`[${query.id}] FAIL - ${result.failureReasons.join('; ')}`);
          }
        } catch (err) {
          // Log error but continue to next query
          console.log(`[${query.id}] ERROR - ${err}`);
          allResults.push({
            id: query.id,
            query: query.text,
            phase: phaseKey,
            passed: false,
            answer: '',
            answerHTML: '',
            ttftMs: 0,
            totalMs: 0,
            streamingChunks: 0,
            assertions: [],
            failureReasons: [`Execution error: ${err}`],
            failureCategory: 'F_PERFORMANCE',
          });
        }
      }
    }

    // Final assertion - at least 80% must pass for test to pass
    const passRate = allResults.filter(r => r.passed).length / allResults.length;
    console.log(`\nFinal pass rate: ${(passRate * 100).toFixed(1)}%`);
    expect(passRate, `Pass rate ${(passRate * 100).toFixed(1)}% below 80% threshold`).toBeGreaterThanOrEqual(0.8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runQuery(
  page: Page,
  query: Query,
  phase: string,
  runDir: string
): Promise<QueryResult> {
  const startTime = Date.now();
  let ttftMs = 0;
  let streamingChunks = 0;

  console.log(`\n[${query.id}] Sending: "${query.text.substring(0, 50)}..."`);

  // Get current message count before sending (flexible selector)
  const assistantMsgSelector = '.assistant-message, [data-testid="msg-assistant"], [data-role="assistant"]';
  const msgsBefore = await page.locator(assistantMsgSelector).count();

  // Find and fill input using flexible selector
  const input = page.locator('textarea[placeholder*="Ask Koda"], textarea[placeholder*="message"], [data-testid="chat-input"]');
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.fill(query.text);

  // Send message - press Enter
  await input.press('Enter');

  // Wait for new response to start (TTFT measurement)
  try {
    // Wait for a new assistant message to appear
    await page.waitForFunction(
      ({ beforeCount, selector }) => {
        const msgs = document.querySelectorAll(selector);
        return msgs.length > beforeCount;
      },
      { beforeCount: msgsBefore, selector: assistantMsgSelector },
      { timeout: TEST_CONFIG.timeouts.messageStart }
    );
    ttftMs = Date.now() - startTime;
  } catch {
    ttftMs = Date.now() - startTime;
  }

  // Wait for response to complete (streaming finished)
  // Use simpler approach - wait 4 seconds then check for content
  await page.waitForTimeout(4000);

  // Additional check: wait for streaming indicators to disappear
  try {
    await page.waitForFunction(
      ({ beforeCount, selector }) => {
        const msgs = document.querySelectorAll(selector);
        if (msgs.length <= beforeCount) return false;

        // Check for streaming indicator
        const streaming = document.querySelector('[data-testid="msg-streaming"], [data-testid="chat-stop"], .streaming');
        if (streaming) return false;

        // Ensure the last message has content
        const lastMsg = msgs[msgs.length - 1];
        return lastMsg.textContent && lastMsg.textContent.length > 5;
      },
      { beforeCount: msgsBefore, selector: assistantMsgSelector },
      { timeout: TEST_CONFIG.timeouts.messageComplete }
    );
  } catch {
    // If timeout, still try to get what's there
    console.log(`[${query.id}] Warning: Response may be incomplete`);
  }

  const totalMs = Date.now() - startTime;

  // Extract answer using flexible selector
  const lastMessage = page.locator(assistantMsgSelector).last();
  const answer = await lastMessage.textContent() || '';
  const answerHTML = await lastMessage.innerHTML() || '';

  // Run assertions
  const assertionResults = runAssertions(query.assertions, answer, answerHTML);

  // Add timing checks
  const timingResults = checkTiming(ttftMs, totalMs, query.expectRoute, THRESHOLDS);
  assertionResults.push(...timingResults);

  // Check for empty/too short answer
  if (answer.trim().length < 10) {
    assertionResults.push({
      name: 'answer_not_empty',
      passed: false,
      message: 'Answer is empty or too short',
    });
  }

  // Determine pass/fail
  const failedAssertions = assertionResults.filter(a => !a.passed);
  const passed = failedAssertions.length === 0;
  const failureReasons = failedAssertions.map(a => `${a.name}: ${a.message}`);

  // Save artifacts for failures
  let screenshotPath: string | undefined;
  let domPath: string | undefined;

  if (!passed) {
    screenshotPath = path.join(runDir, 'screenshots', `${query.id}_failure.png`);
    domPath = path.join(runDir, 'dom', `${query.id}_dom.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(domPath, answerHTML);
  }

  const result: QueryResult = {
    id: query.id,
    query: query.text,
    phase,
    passed,
    answer: answer.substring(0, 500),
    answerHTML: answerHTML.substring(0, 2000),
    ttftMs,
    totalMs,
    streamingChunks,
    assertions: assertionResults,
    failureReasons,
    screenshotPath: screenshotPath ? path.relative(runDir, screenshotPath) : undefined,
    domPath: domPath ? path.relative(runDir, domPath) : undefined,
  };

  if (!passed) {
    result.failureCategory = classifyFailure(result);
  }

  console.log(`[${query.id}] ${passed ? 'PASS' : 'FAIL'} - TTFT: ${ttftMs}ms, Total: ${totalMs}ms`);
  if (!passed) {
    console.log(`[${query.id}] Failures: ${failureReasons.join('; ')}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateReport(results: QueryResult[], runDir: string): TestReport {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  // Count fallbacks
  const fallbackCount = results.filter(r =>
    r.assertions.some(a => a.name === 'no_fallback' && !a.passed)
  ).length;

  // Timing stats
  const ttfts = results.map(r => r.ttftMs);
  const totals = results.map(r => r.totalMs);

  // By phase
  const byPhase: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const r of results) {
    if (!byPhase[r.phase]) {
      byPhase[r.phase] = { total: 0, passed: 0, failed: 0 };
    }
    byPhase[r.phase].total++;
    if (r.passed) byPhase[r.phase].passed++;
    else byPhase[r.phase].failed++;
  }

  // Launch gate checks
  const phaseA = results.filter(r => r.phase === 'A');
  const inventoryWorks = phaseA.filter(r => r.passed).length >= phaseA.length * 0.8;
  const filtersWork = phaseA
    .filter(r => ['Q003', 'Q004', 'Q005'].includes(r.id))
    .every(r => r.passed);
  const contextSurvives = results
    .filter(r => r.assertions.some(a => a.name === 'context_stable'))
    .every(r => r.passed);
  const buttonsRender = results
    .filter(r => r.assertions.some(a => a.name === 'has_file_button' || a.name === 'has_file_buttons'))
    .filter(r => !r.assertions.find(a => a.name.includes('file_button'))?.passed).length < 5;
  const noFallbacks = fallbackCount === 0;
  const frontendMatchesBackend = results
    .filter(r => r.assertions.some(a => a.name === 'no_raw_tokens'))
    .every(r => r.passed);

  const launchGate = {
    inventoryWorks,
    filtersWork,
    contextSurvives,
    buttonsRender,
    noFallbacks,
    frontendMatchesBackend,
    verdict: (inventoryWorks && filtersWork && noFallbacks && buttonsRender) ? 'GO' as const : 'NO-GO' as const,
  };

  return {
    timestamp: new Date().toISOString(),
    runDir,
    baseline: {},
    summary: {
      total,
      passed,
      failed,
      passRate: `${((passed / total) * 100).toFixed(1)}%`,
      fallbackCount,
    },
    timing: {
      ttft_p50: percentile(ttfts, 50),
      ttft_p95: percentile(ttfts, 95),
      total_p50: percentile(totals, 50),
      total_p95: percentile(totals, 95),
    },
    byPhase,
    failures: results.filter(r => !r.passed),
    allResults: results,
    launchGate,
  };
}

function generateMarkdownReport(report: TestReport): string {
  const lines: string[] = [];

  lines.push('# Koda ChatGPT-Grade E2E Test Report');
  lines.push('');
  lines.push('## Summary');
  lines.push(`- **Date**: ${report.timestamp}`);
  lines.push(`- **Total Queries**: ${report.summary.total}`);
  lines.push(`- **Passed**: ${report.summary.passed} (${report.summary.passRate})`);
  lines.push(`- **Failed**: ${report.summary.failed}`);
  lines.push(`- **Fallback Count**: ${report.summary.fallbackCount} (must be 0)`);
  lines.push('');
  lines.push('## Performance');
  lines.push('| Metric | P50 | P95 |');
  lines.push('|--------|-----|-----|');
  lines.push(`| TTFT | ${report.timing.ttft_p50}ms | ${report.timing.ttft_p95}ms |`);
  lines.push(`| Total | ${report.timing.total_p50}ms | ${report.timing.total_p95}ms |`);
  lines.push('');
  lines.push('## Results by Phase');
  lines.push('');
  for (const [phase, stats] of Object.entries(report.byPhase)) {
    lines.push(`### Phase ${phase}: ${stats.passed}/${stats.total} passed`);
  }
  lines.push('');
  lines.push('## Launch Gate');
  lines.push('');
  lines.push(`| Check | Status |`);
  lines.push(`|-------|--------|`);
  lines.push(`| Inventory Works | ${report.launchGate.inventoryWorks ? '✅' : '❌'} |`);
  lines.push(`| Filters Work | ${report.launchGate.filtersWork ? '✅' : '❌'} |`);
  lines.push(`| Context Survives | ${report.launchGate.contextSurvives ? '✅' : '❌'} |`);
  lines.push(`| Buttons Render | ${report.launchGate.buttonsRender ? '✅' : '❌'} |`);
  lines.push(`| No Fallbacks | ${report.launchGate.noFallbacks ? '✅' : '❌'} |`);
  lines.push(`| Frontend Matches Backend | ${report.launchGate.frontendMatchesBackend ? '✅' : '❌'} |`);
  lines.push('');
  lines.push(`**VERDICT: ${report.launchGate.verdict}**`);
  lines.push('');

  if (report.failures.length > 0) {
    lines.push('## Failed Queries');
    lines.push('');

    // Group by category
    const byCategory: Record<string, QueryResult[]> = {};
    for (const f of report.failures) {
      const cat = f.failureCategory || 'UNKNOWN';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(f);
    }

    for (const [cat, failures] of Object.entries(byCategory).sort()) {
      lines.push(`### ${cat} (${failures.length})`);
      lines.push('');
      for (const f of failures.slice(0, 5)) {
        lines.push(`#### ${f.id}: ${f.query.substring(0, 50)}...`);
        lines.push(`- **Reasons**: ${f.failureReasons.join('; ')}`);
        lines.push(`- **TTFT**: ${f.ttftMs}ms, **Total**: ${f.totalMs}ms`);
        if (f.screenshotPath) {
          lines.push(`- **Screenshot**: ${f.screenshotPath}`);
        }
        lines.push(`- **Answer preview**: ${f.answer.substring(0, 200)}...`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
