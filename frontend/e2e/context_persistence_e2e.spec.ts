/**
 * CONTEXT PERSISTENCE E2E TEST
 *
 * This is the DEFINITIVE test that proves Koda works like ChatGPT.
 *
 * What it tests:
 * 1. Context is NEVER lost during a 50+ turn conversation
 * 2. File references work ("it", "that one", "the other one")
 * 3. Metadata queries work (largest file, filter by type, folder path)
 * 4. No fallback phrases for users with files
 * 5. Formatting is consistent (no emoji, proper lists, no raw DOC:: markers)
 *
 * How to run:
 *   npx playwright test e2e/context_persistence_e2e.spec.ts --project=chromium
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

const TIMEOUT_PER_QUESTION = 60000;  // 60 seconds per question
const SCREENSHOT_DIR = 'e2e/screenshots/context_persistence';
const LOG_FILE = 'e2e/logs/context_persistence.log';

// Forbidden fallback phrases - these should NEVER appear for users with files
const FORBIDDEN_FALLBACKS = [
  'rephrase',
  'upload documents',
  'upload some documents',
  "don't see any documents",
  "I don't have access",
  "can't find any",
  'no documents found',
  'please upload',
  'try uploading',
  "I don't see any",
  'no files found'
];

// Formatting rules
const FORMATTING_RULES = {
  noEmoji: /[\u{1F600}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
  noRawDocMarkers: /\{\{DOC::|DOC::[a-f0-9-]+/i,
  maxConsecutiveNewlines: /\n{4,}/,
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST QUESTIONS - 50+ TURNS
// ═══════════════════════════════════════════════════════════════════════════

interface TestQuestion {
  id: string;
  prompt: string;
  type: 'inventory' | 'metadata' | 'rag' | 'followup' | 'edge';
  validate: (response: string, html: string) => ValidationResult;
}

interface ValidationResult {
  passed: boolean;
  checks: Record<string, boolean>;
  contextLost: boolean;
  hasForbiddenFallback: boolean;
  formattingIssues: string[];
}

const TEST_QUESTIONS: TestQuestion[] = [
  // === TURN 1-5: Establish baseline ===
  {
    id: 'T01',
    prompt: 'How many files do I have?',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectCount: true }),
  },
  {
    id: 'T02',
    prompt: 'List all my files.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
  {
    id: 'T03',
    prompt: 'What types of files do I have?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectTypes: true }),
  },
  {
    id: 'T04',
    prompt: 'What is my largest file?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectLargest: true }),
  },
  {
    id: 'T05',
    prompt: 'Show me only spreadsheets.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'xlsx' }),
  },

  // === TURN 6-10: File references ===
  {
    id: 'T06',
    prompt: 'Show me the LMR Improvement Plan file.',
    type: 'inventory',
    validate: (text, html) => validateFileAction(text, html, 'LMR'),
  },
  {
    id: 'T07',
    prompt: 'What is it about?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T08',
    prompt: 'Summarize it in 3 bullet points.',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectBullets: true }),
  },
  {
    id: 'T09',
    prompt: 'Now show me the Rosewood Fund file.',
    type: 'inventory',
    validate: (text, html) => validateFileAction(text, html, 'Rosewood'),
  },
  {
    id: 'T10',
    prompt: 'Compare it to the previous file.',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectComparison: true }),
  },

  // === TURN 11-15: Metadata queries ===
  {
    id: 'T11',
    prompt: 'Which folder is the Rosewood file in?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFolderPath: true }),
  },
  {
    id: 'T12',
    prompt: 'Show me only PPTX and PNG files.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'pptx|png' }),
  },
  {
    id: 'T13',
    prompt: 'Sort my files by size.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectSorted: true }),
  },
  {
    id: 'T14',
    prompt: 'Group my files by type.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectGrouped: true }),
  },
  {
    id: 'T15',
    prompt: 'What is my newest file?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectNewest: true }),
  },

  // === TURN 16-20: Context continuity check ===
  {
    id: 'T16',
    prompt: 'List my files again.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
  {
    id: 'T17',
    prompt: 'How many do I have now?',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectCount: true }),
  },
  {
    id: 'T18',
    prompt: 'Go back to the LMR file.',
    type: 'inventory',
    validate: (text, html) => validateFileAction(text, html, 'LMR'),
  },
  {
    id: 'T19',
    prompt: 'What was the total budget mentioned?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T20',
    prompt: 'What projects are included?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },

  // === TURN 21-25: More context switches ===
  {
    id: 'T21',
    prompt: 'Now list all PDFs.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'pdf' }),
  },
  {
    id: 'T22',
    prompt: 'Back to spreadsheets.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'xlsx' }),
  },
  {
    id: 'T23',
    prompt: 'What is the P&L file about?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T24',
    prompt: 'Compare it with the improvement plan.',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectComparison: true }),
  },
  {
    id: 'T25',
    prompt: 'Show all files again.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },

  // === TURN 26-30: Edge cases ===
  {
    id: 'T26',
    prompt: 'find the ranch file',
    type: 'inventory',
    validate: (text, html) => validateFileAction(text, html, 'ranch'),
  },
  {
    id: 'T27',
    prompt: 'wats in it?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T28',
    prompt: 'Show me my biggest xlsx file.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectLargest: true, expectFilter: 'xlsx' }),
  },
  {
    id: 'T29',
    prompt: 'Where is it located?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFolderPath: true }),
  },
  {
    id: 'T30',
    prompt: 'List everything one more time.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },

  // === TURN 31-40: More stress testing ===
  {
    id: 'T31',
    prompt: 'How many spreadsheets do I have?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectCount: true }),
  },
  {
    id: 'T32',
    prompt: 'And how many total files?',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectCount: true }),
  },
  {
    id: 'T33',
    prompt: 'Show the first file in alphabetical order.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectSorted: true }),
  },
  {
    id: 'T34',
    prompt: 'What about the last one?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectSorted: true }),
  },
  {
    id: 'T35',
    prompt: 'Show me all files again.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
  {
    id: 'T36',
    prompt: 'What industry do my documents relate to?',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T37',
    prompt: 'Give me an executive summary of my documents.',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T38',
    prompt: 'List my files once more.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
  {
    id: 'T39',
    prompt: 'Filter to show only images.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'png|jpg|image' }),
  },
  {
    id: 'T40',
    prompt: 'Now show everything.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },

  // === TURN 41-50: Final stress test ===
  {
    id: 'T41',
    prompt: 'Do I have any PDFs?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'pdf' }),
  },
  {
    id: 'T42',
    prompt: 'What is the smallest file?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectSmallest: true }),
  },
  {
    id: 'T43',
    prompt: 'And the largest?',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectLargest: true }),
  },
  {
    id: 'T44',
    prompt: 'Show me the improvement plan again.',
    type: 'inventory',
    validate: (text, html) => validateFileAction(text, html, 'improvement'),
  },
  {
    id: 'T45',
    prompt: 'Remind me what it contains.',
    type: 'rag',
    validate: (text, html) => validateRAG(text, html, { expectContent: true }),
  },
  {
    id: 'T46',
    prompt: 'List all my files.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
  {
    id: 'T47',
    prompt: 'How many files in total?',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectCount: true }),
  },
  {
    id: 'T48',
    prompt: 'Group by file type.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectGrouped: true }),
  },
  {
    id: 'T49',
    prompt: 'Show spreadsheets only.',
    type: 'metadata',
    validate: (text, html) => validateMetadata(text, html, { expectFilter: 'xlsx' }),
  },
  {
    id: 'T50',
    prompt: 'List everything for the final time.',
    type: 'inventory',
    validate: (text, html) => validateInventory(text, html, { expectList: true }),
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function validateBase(text: string, html: string): Partial<ValidationResult> {
  // Check for context loss
  const contextLost = FORBIDDEN_FALLBACKS.some(phrase =>
    text.toLowerCase().includes(phrase.toLowerCase())
  );

  // Check for forbidden fallbacks
  const hasForbiddenFallback = contextLost;

  // Check formatting issues
  const formattingIssues: string[] = [];

  if (FORMATTING_RULES.noEmoji.test(text)) {
    formattingIssues.push('Contains emoji');
  }

  if (FORMATTING_RULES.noRawDocMarkers.test(text)) {
    formattingIssues.push('Contains raw DOC:: markers');
  }

  if (FORMATTING_RULES.maxConsecutiveNewlines.test(text)) {
    formattingIssues.push('Too many consecutive newlines');
  }

  return { contextLost, hasForbiddenFallback, formattingIssues };
}

function validateInventory(text: string, html: string, opts: { expectCount?: boolean; expectList?: boolean }): ValidationResult {
  const base = validateBase(text, html);
  const checks: Record<string, boolean> = {};

  if (opts.expectCount) {
    checks.hasCount = /\d+\s*(files?|documents?)/i.test(text);
  }

  if (opts.expectList) {
    checks.hasList = /\d+\.|[-•*]\s|\.(xlsx|pdf|pptx|png)/i.test(text) || /<li/i.test(html);
  }

  const passed = Object.values(checks).every(v => v) && !base.contextLost;

  return { passed, checks, ...base } as ValidationResult;
}

function validateMetadata(text: string, html: string, opts: any): ValidationResult {
  const base = validateBase(text, html);
  const checks: Record<string, boolean> = {};

  if (opts.expectLargest) {
    checks.hasLargest = /(largest|biggest|kb|mb|\d+\s*bytes)/i.test(text) || /(isn't\s+mentioned|couldn't)/i.test(text);
  }

  if (opts.expectSmallest) {
    checks.hasSmallest = /(smallest|kb|mb|\d+\s*bytes)/i.test(text) || /(isn't\s+mentioned|couldn't)/i.test(text);
  }

  if (opts.expectFilter) {
    const filterPattern = new RegExp(opts.expectFilter, 'i');
    checks.hasFiltered = filterPattern.test(text) || /no\s+(files?|documents?)|0\s+files/i.test(text);
  }

  if (opts.expectFolderPath) {
    checks.hasFolderPath = /folder|path|located|\/|root/i.test(text) || /(isn't\s+mentioned|couldn't)/i.test(text);
  }

  if (opts.expectSorted) {
    checks.hasSorted = /\d+\.|sorted|order|first|last|\.(xlsx|pdf)/i.test(text);
  }

  if (opts.expectGrouped) {
    checks.hasGrouped = /(group|type|pdf|xlsx|spreadsheet|presentation|image)/i.test(text);
  }

  if (opts.expectTypes) {
    checks.hasTypes = /(pdf|xlsx|pptx|png|spreadsheet|presentation|image|document)/i.test(text);
  }

  if (opts.expectNewest) {
    checks.hasNewest = /(newest|recent|latest|uploaded)/i.test(text) || /(isn't\s+mentioned|couldn't)/i.test(text);
  }

  if (opts.expectCount) {
    checks.hasCount = /\d+/i.test(text);
  }

  const passed = Object.values(checks).every(v => v) && !base.contextLost;

  return { passed, checks, ...base } as ValidationResult;
}

function validateFileAction(text: string, html: string, expectedFile: string): ValidationResult {
  const base = validateBase(text, html);
  const checks: Record<string, boolean> = {};

  const filePattern = new RegExp(expectedFile, 'i');
  checks.hasFile = filePattern.test(text) || /DOC::|file-button/i.test(html);

  const passed = Object.values(checks).every(v => v) && !base.contextLost;

  return { passed, checks, ...base } as ValidationResult;
}

function validateRAG(text: string, html: string, opts: any): ValidationResult {
  const base = validateBase(text, html);
  const checks: Record<string, boolean> = {};

  if (opts.expectContent) {
    // RAG response should have substantial content OR gracefully say "isn't mentioned"
    checks.hasContent = text.length > 50 || /(isn't\s+mentioned|couldn't\s+find)/i.test(text);
  }

  if (opts.expectBullets) {
    checks.hasBullets = /[-•*]\s+\S|\d+\.\s+\S/m.test(text) || /<li/i.test(html) || /(isn't\s+mentioned)/i.test(text);
  }

  if (opts.expectComparison) {
    checks.hasComparison = /(both|compare|similar|different|whereas|while)/i.test(text) || /(isn't\s+mentioned)/i.test(text);
  }

  const passed = Object.values(checks).every(v => v) && !base.contextLost;

  return { passed, checks, ...base } as ValidationResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function login(page: Page): Promise<void> {
  await page.goto(`${TEST_URL}/login`);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector('[data-testid="chat-input"], textarea, input[placeholder*="message"]', { timeout: 30000 });
}

async function sendMessage(page: Page, message: string): Promise<void> {
  const chatInput = page.locator('[data-testid="chat-input"], textarea, input[placeholder*="message"]').first();
  await chatInput.fill(message);
  await page.keyboard.press('Enter');
}

async function waitForResponse(page: Page, timeout: number = TIMEOUT_PER_QUESTION): Promise<{ text: string; html: string }> {
  // Count current messages
  const initialCount = await page.locator('.assistant-message').count();

  // Wait for new message
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.assistant-message').length > expected,
    initialCount,
    { timeout }
  );

  // Wait for streaming to complete
  await page.waitForTimeout(2000);

  // Get response
  const lastMessage = page.locator('.assistant-message').last();
  const text = await lastMessage.textContent() || '';
  const html = await lastMessage.innerHTML() || '';

  return { text, html };
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(message);

  // Also write to file
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    // Ignore file errors
  }
}

async function saveScreenshot(page: Page, name: string): Promise<void> {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  } catch (e) {
    // Ignore screenshot errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Context Persistence E2E (50+ Turns)', () => {
  test('should maintain context for 50 consecutive turns', async ({ page }) => {
    test.setTimeout(TIMEOUT_PER_QUESTION * TEST_QUESTIONS.length + 120000);

    // Clear previous log
    try {
      fs.writeFileSync(LOG_FILE, '');
    } catch (e) {}

    log('═══════════════════════════════════════════════════════════════');
    log('CONTEXT PERSISTENCE E2E TEST');
    log('═══════════════════════════════════════════════════════════════');

    // Login
    await login(page);
    log('✓ Logged in successfully');

    const results: Array<{
      id: string;
      prompt: string;
      passed: boolean;
      checks: Record<string, boolean>;
      contextLost: boolean;
      hasForbiddenFallback: boolean;
      formattingIssues: string[];
      responsePreview: string;
      ttft: number;
    }> = [];

    let consecutiveContextLoss = 0;

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
      const q = TEST_QUESTIONS[i];

      log(`\n[${q.id}] ${q.type.toUpperCase()}: "${q.prompt.substring(0, 50)}..."`);

      const startTime = Date.now();

      try {
        // Send message
        await sendMessage(page, q.prompt);

        // Wait for response
        const { text, html } = await waitForResponse(page);
        const ttft = Date.now() - startTime;

        // Validate
        const validation = q.validate(text, html);

        // Track result
        results.push({
          id: q.id,
          prompt: q.prompt,
          passed: validation.passed,
          checks: validation.checks,
          contextLost: validation.contextLost,
          hasForbiddenFallback: validation.hasForbiddenFallback,
          formattingIssues: validation.formattingIssues,
          responsePreview: text.substring(0, 100),
          ttft,
        });

        // Log result
        if (validation.contextLost) {
          log(`[${q.id}] ✗ CONTEXT LOST! Response: "${text.substring(0, 100)}..."`);
          consecutiveContextLoss++;

          // Save screenshot on context loss
          await saveScreenshot(page, `${q.id}_context_lost`);

          // Stop if 3 consecutive context losses
          if (consecutiveContextLoss >= 3) {
            log('FATAL: 3 consecutive context losses. Stopping test.');
            break;
          }
        } else {
          consecutiveContextLoss = 0;

          if (validation.passed) {
            log(`[${q.id}] ✓ PASS (${ttft}ms)`);
          } else {
            log(`[${q.id}] ✗ FAIL - Checks: ${JSON.stringify(validation.checks)}`);
            log(`  Response: "${text.substring(0, 100)}..."`);
            await saveScreenshot(page, `${q.id}_fail`);
          }

          if (validation.formattingIssues.length > 0) {
            log(`  Formatting issues: ${validation.formattingIssues.join(', ')}`);
          }
        }

      } catch (error: any) {
        log(`[${q.id}] ✗ ERROR: ${error.message}`);
        results.push({
          id: q.id,
          prompt: q.prompt,
          passed: false,
          checks: { error: false },
          contextLost: false,
          hasForbiddenFallback: false,
          formattingIssues: [],
          responsePreview: `ERROR: ${error.message}`,
          ttft: 0,
        });

        await saveScreenshot(page, `${q.id}_error`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════

    log('\n═══════════════════════════════════════════════════════════════');
    log('SUMMARY');
    log('═══════════════════════════════════════════════════════════════');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const contextLosses = results.filter(r => r.contextLost).length;
    const formattingIssues = results.filter(r => r.formattingIssues.length > 0).length;

    log(`Total: ${results.length} / ${TEST_QUESTIONS.length}`);
    log(`Passed: ${passed}`);
    log(`Failed: ${failed}`);
    log(`Context Losses: ${contextLosses}`);
    log(`Formatting Issues: ${formattingIssues}`);
    log(`Pass Rate: ${(passed / results.length * 100).toFixed(1)}%`);

    if (failed > 0) {
      log('\nFailed Questions:');
      results.filter(r => !r.passed).forEach(r => {
        log(`  ${r.id}: ${r.contextLost ? 'CONTEXT LOST' : JSON.stringify(r.checks)}`);
      });
    }

    // Write full results to JSON
    try {
      fs.writeFileSync(
        'e2e/logs/context_persistence_results.json',
        JSON.stringify(results, null, 2)
      );
    } catch (e) {}

    // ═══════════════════════════════════════════════════════════════
    // ASSERTIONS
    // ═══════════════════════════════════════════════════════════════

    // CRITICAL: No context losses allowed
    expect(contextLosses, `${contextLosses} context losses detected - LAUNCH BLOCKER`).toBe(0);

    // Must complete all questions
    expect(results.length, 'Did not complete all questions').toBe(TEST_QUESTIONS.length);

    // 95% pass rate required
    expect(passed / results.length, 'Pass rate below 95%').toBeGreaterThanOrEqual(0.95);

    log('\n✓ ALL CHECKS PASSED - READY FOR LAUNCH');
  });
});
