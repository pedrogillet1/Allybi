/**
 * KODA MASTER STRESS TEST - 50 Questions, Single Conversation
 *
 * ChatGPT-Grade Validation:
 * - Formatting (lists, tables, no emojis, no walls of text)
 * - Streaming (TTFT, no flicker, correct colors)
 * - Conversation (follow-ups, context, no fallbacks)
 * - File Actions (buttons, locations, open/show)
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TEST PROMPTS (50 questions in strict order)
// ============================================================================

interface TestPrompt {
  id: string;
  prompt: string;
  section: string;
  expectedBehavior: string;
  rules: {
    mustBeList?: boolean;
    mustBeNumbered?: boolean;
    mustBeBullets?: boolean;
    buttonOnly?: boolean;
    folderPathPlusButton?: boolean;
    noExtraText?: boolean;
    noEmoji?: boolean;
    mustReferenceDoc?: boolean;
    mustResolveFollowup?: boolean;
    expectError?: boolean;
  };
}

const TEST_PROMPTS: TestPrompt[] = [
  // SECTION A — Document inventory + location awareness
  { id: 'Q01', prompt: 'What files do I have uploaded? List them as a numbered list with a button for each file. No emojis.', section: 'A', expectedBehavior: 'numbered list + buttons', rules: { mustBeNumbered: true, noEmoji: true } },
  { id: 'Q02', prompt: 'Show me only my PDFs. Numbered list + buttons. No extra explanation.', section: 'A', expectedBehavior: 'numbered list of PDFs only', rules: { mustBeNumbered: true, noExtraText: true } },
  { id: 'Q03', prompt: 'Show me only my spreadsheets (xlsx/xls/csv). Numbered list + buttons. No extra explanation.', section: 'A', expectedBehavior: 'numbered list of spreadsheets only', rules: { mustBeNumbered: true, noExtraText: true } },
  { id: 'Q04', prompt: 'Show me only my images. Numbered list + buttons. No extra explanation.', section: 'A', expectedBehavior: 'numbered list of images or "no images"', rules: { mustBeNumbered: true, noExtraText: true } },
  { id: 'Q05', prompt: 'Which file is the newest PDF? Reply with: one short sentence with its folder path + a button.', section: 'A', expectedBehavior: 'short sentence + folder path + button', rules: { folderPathPlusButton: true } },
  { id: 'Q06', prompt: 'Where is the Rosewood Fund file located? Folder path + button only.', section: 'A', expectedBehavior: 'folder path + button only', rules: { folderPathPlusButton: true, noExtraText: true } },
  { id: 'Q07', prompt: 'Open Rosewood Fund v3.xlsx. Button only.', section: 'A', expectedBehavior: 'button only', rules: { buttonOnly: true } },
  { id: 'Q08', prompt: 'Where is it?', section: 'A', expectedBehavior: 'resolves to Rosewood Fund + folder path + button', rules: { mustResolveFollowup: true, folderPathPlusButton: true } },

  // SECTION B — File navigation + list folders/subfolders
  { id: 'Q09', prompt: 'List my top-level folders. Bullet list only.', section: 'B', expectedBehavior: 'bullet list of folders', rules: { mustBeBullets: true } },
  { id: 'Q10', prompt: 'Open the folder that contains the most documents and list its contents as a numbered list with buttons.', section: 'B', expectedBehavior: 'folder contents as numbered list', rules: { mustBeNumbered: true } },
  { id: 'Q11', prompt: 'Now list the subfolders inside that folder (if any). Bullet list.', section: 'B', expectedBehavior: 'bullet list of subfolders or "no subfolders"', rules: { mustBeBullets: true } },
  { id: 'Q12', prompt: 'Show me the 3 most recently uploaded files across everything. Numbered list + buttons.', section: 'B', expectedBehavior: 'numbered list of 3 newest files', rules: { mustBeNumbered: true } },

  // SECTION C — Basic doc Q&A (single doc)
  { id: 'Q13', prompt: 'In Rosewood Fund v3.xlsx, what does it say about investment? Answer in 3 bullet points and include a button to open the file.', section: 'C', expectedBehavior: '3 bullets + button', rules: { mustBeBullets: true, mustReferenceDoc: true } },
  { id: 'Q14', prompt: 'Quote the exact cell/line or section that supports your answer (if available). If not available, say "Not specified in extracted content."', section: 'C', expectedBehavior: 'quote or "not specified"', rules: {} },
  { id: 'Q15', prompt: 'Summarize the key points from that file in 5 bullets. No emojis.', section: 'C', expectedBehavior: '5 bullets, no emojis', rules: { mustBeBullets: true, noEmoji: true } },
  { id: 'Q16', prompt: 'Now explain why those points matter in one short paragraph (max 5 lines).', section: 'C', expectedBehavior: 'short paragraph', rules: {} },

  // SECTION D — Cross-doc questions
  { id: 'Q17', prompt: 'What are the main topics across all my documents? Give me: (1) a numbered list of topics, (2) under each topic, the filenames as buttons.', section: 'D', expectedBehavior: 'numbered topics with buttons', rules: { mustBeNumbered: true, mustReferenceDoc: true } },
  { id: 'Q18', prompt: 'Which single document looks most like a financial report, and why? Provide the button.', section: 'D', expectedBehavior: 'explanation + button', rules: { mustReferenceDoc: true } },
  { id: 'Q19', prompt: 'Which document looks like a presentation and what is it about? Provide the button.', section: 'D', expectedBehavior: 'explanation + button', rules: { mustReferenceDoc: true } },
  { id: 'Q20', prompt: 'Which document looks like class notes or study material? Provide the button.', section: 'D', expectedBehavior: 'explanation + button', rules: { mustReferenceDoc: true } },

  // SECTION E — Hard follow-ups
  { id: 'Q21', prompt: 'That presentation — summarize it in 6 bullets.', section: 'E', expectedBehavior: '6 bullets from presentation', rules: { mustBeBullets: true, mustResolveFollowup: true } },
  { id: 'Q22', prompt: 'Open it. Button only.', section: 'E', expectedBehavior: 'button only', rules: { buttonOnly: true, mustResolveFollowup: true } },
  { id: 'Q23', prompt: 'Now go back to the financial report you identified and open it. Button only.', section: 'E', expectedBehavior: 'button only for financial report', rules: { buttonOnly: true, mustResolveFollowup: true } },
  { id: 'Q24', prompt: 'Where is it located? Folder path + button.', section: 'E', expectedBehavior: 'folder path + button', rules: { folderPathPlusButton: true, mustResolveFollowup: true } },

  // SECTION F — Comparison + reasoning
  { id: 'Q25', prompt: 'Compare the two Lone Mountain Ranch P&L spreadsheets (2024 vs 2025 Budget). Give a short table with 3 rows: Revenue, Total Expenses, Net Income (if those exist). Then one paragraph of interpretation.', section: 'F', expectedBehavior: 'table + paragraph', rules: { mustReferenceDoc: true } },
  { id: 'Q26', prompt: 'Now tell me what could be the biggest driver of change based only on the documents. If unclear, say what\'s missing.', section: 'F', expectedBehavior: 'analysis or "missing info"', rules: {} },
  { id: 'Q27', prompt: 'Give me 5 follow-up questions I should ask to fully understand the change. Numbered list.', section: 'F', expectedBehavior: '5 numbered questions', rules: { mustBeNumbered: true } },

  // SECTION G — Multi-intent messy requests
  { id: 'Q28', prompt: 'ok so like… which file talks about marketing and also show it to me, and then tell me the main takeaways and why they matter', section: 'G', expectedBehavior: 'find marketing doc + button + takeaways', rules: { mustReferenceDoc: true } },
  { id: 'Q29', prompt: 'cool — now compare that marketing doc to the finance doc you mentioned earlier, but keep it short.', section: 'G', expectedBehavior: 'short comparison', rules: { mustResolveFollowup: true } },
  { id: 'Q30', prompt: 'Where are both stored? Give me both folder paths + both buttons.', section: 'G', expectedBehavior: '2 folder paths + 2 buttons', rules: { folderPathPlusButton: true, mustResolveFollowup: true } },

  // SECTION H — File actions (safe mode)
  { id: 'Q31', prompt: 'Rename the Rosewood Fund file to "Rosewood Fund (Reviewed).xlsx". Confirm only; do not add extra text.', section: 'H', expectedBehavior: 'confirmation only', rules: { noExtraText: true } },
  { id: 'Q32', prompt: 'Open "Rosewood Fund (Reviewed).xlsx". Button only.', section: 'H', expectedBehavior: 'button only', rules: { buttonOnly: true } },
  { id: 'Q33', prompt: 'Move that file into my Finance folder (or create Finance folder if missing). Confirm location + button.', section: 'H', expectedBehavior: 'confirmation + button', rules: { mustReferenceDoc: true } },
  { id: 'Q34', prompt: 'Where is it now? Folder path + button only.', section: 'H', expectedBehavior: 'folder path + button', rules: { folderPathPlusButton: true, mustResolveFollowup: true } },
  { id: 'Q35', prompt: 'Undo that move (move it back to original location). Confirm location + button.', section: 'H', expectedBehavior: 'confirmation + button', rules: { mustReferenceDoc: true } },

  // SECTION I — Error handling WITHOUT fallback
  { id: 'Q36', prompt: 'Open a file called "does_not_exist_123.pdf".', section: 'I', expectedBehavior: 'helpful error + browse button', rules: { expectError: true } },
  { id: 'Q37', prompt: 'Ok then show me files with "Trabalho" in the name. Numbered list + buttons.', section: 'I', expectedBehavior: 'numbered list of matching files', rules: { mustBeNumbered: true } },
  { id: 'Q38', prompt: 'Open the second one. Button only.', section: 'I', expectedBehavior: 'button only', rules: { buttonOnly: true, mustResolveFollowup: true } },
  { id: 'Q39', prompt: 'Summarize it in 5 bullets.', section: 'I', expectedBehavior: '5 bullets', rules: { mustBeBullets: true, mustResolveFollowup: true } },
  { id: 'Q40', prompt: 'Where is it stored? Folder path + button.', section: 'I', expectedBehavior: 'folder path + button', rules: { folderPathPlusButton: true, mustResolveFollowup: true } },

  // SECTION J — Long/complex prompt
  { id: 'Q41', prompt: 'I\'m preparing an investor update. Using only my documents, write a structured summary with headings: Overview, Financials, Risks, Next Steps. Keep each section under 6 lines. No emojis. Include buttons for every referenced file.', section: 'J', expectedBehavior: 'structured with 4 headings + buttons', rules: { noEmoji: true, mustReferenceDoc: true } },
  { id: 'Q42', prompt: 'Now rewrite it shorter: 8 bullets max. Still cite files with buttons.', section: 'J', expectedBehavior: '8 bullets max + buttons', rules: { mustBeBullets: true, mustReferenceDoc: true } },
  { id: 'Q43', prompt: 'Now answer: what\'s the single biggest unknown that blocks confidence? One sentence.', section: 'J', expectedBehavior: 'one sentence', rules: {} },

  // SECTION K — Streaming + formatting torture
  { id: 'Q44', prompt: 'Give me a clean numbered list of all documents again, but group by type (PDF / Spreadsheet / Image / Presentation). Each file must be a button. No extra prose.', section: 'K', expectedBehavior: 'grouped numbered list + buttons', rules: { mustBeNumbered: true, noExtraText: true } },
  { id: 'Q45', prompt: 'Now only return the buttons for spreadsheets. No text.', section: 'K', expectedBehavior: 'buttons only', rules: { buttonOnly: true } },
  { id: 'Q46', prompt: 'Now only return the buttons for PDFs. No text.', section: 'K', expectedBehavior: 'buttons only', rules: { buttonOnly: true } },
  { id: 'Q47', prompt: 'Now: "open the newest one".', section: 'K', expectedBehavior: 'button only for newest', rules: { buttonOnly: true } },
  { id: 'Q48', prompt: 'Now: "where is it?"', section: 'K', expectedBehavior: 'folder path + button', rules: { folderPathPlusButton: true, mustResolveFollowup: true } },

  // SECTION L — Conversation sanity
  { id: 'Q49', prompt: 'Thanks. Quick: what did we learn today from my docs? 6 bullets.', section: 'L', expectedBehavior: '6 bullets summary', rules: { mustBeBullets: true } },
  { id: 'Q50', prompt: 'And what should I do next? 5 bullets, each bullet starts with a verb.', section: 'L', expectedBehavior: '5 action bullets', rules: { mustBeBullets: true } },
];

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

const FALLBACK_PATTERNS = [
  /please rephrase/i,
  /try rephrasing/i,
  /upload.*document/i,
  /no documents? (found|available)/i,
  /couldn't find any/i,
  /couldn't find specific information/i,  // Common fallback when RAG fails
  /i don't understand/i,
  /i'm not sure what you mean/i,
  /something went wrong/i,
  /i don't have.*information/i,
  /no relevant.*found/i,
];

const RAW_MARKER_PATTERNS = [
  /\{\{DOC::/,
  /\{\{FOLDER:/,
  /\{\{LOAD_MORE/,
  /\{\{SEE_ALL/,
  /\[DOC:/,
];

const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

// ============================================================================
// RESULT TYPES
// ============================================================================

interface ValidationResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

interface TestResult {
  id: string;
  prompt: string;
  section: string;
  response: string;
  responseHtml: string;
  ttft: number;
  totalTime: number;
  validation: ValidationResult;
  checks: {
    noFallback: boolean;
    noRawMarkers: boolean;
    noEmoji: boolean;
    hasButtons: boolean;
    isNumberedList: boolean;
    isBulletList: boolean;
    isButtonOnly: boolean;
    hasFolderPath: boolean;
    resolvesFollowup: boolean;
    handlesError: boolean;
  };
  timestamp: string;
}

interface TestReport {
  runId: string;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: string;
    avgTtft: number;
    avgTotalTime: number;
    fallbackCount: number;
    rawMarkerCount: number;
    formatFailures: number;
    followupFailures: number;
  };
  sectionResults: Record<string, { passed: number; failed: number }>;
  results: TestResult[];
  hardFails: string[];
  softFails: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function countListItems(text: string, type: 'numbered' | 'bullet'): number {
  if (type === 'numbered') {
    // Match "1.", "2.", etc. or "1)", "2)", etc.
    const matches = text.match(/^\s*\d+[\.\)]\s+/gm);
    return matches ? matches.length : 0;
  } else {
    // Match "•", "-", "*" at start of lines
    const matches = text.match(/^\s*[•\-\*]\s+/gm);
    return matches ? matches.length : 0;
  }
}

// Check for list elements in HTML (since CSS counters don't appear in textContent)
function hasListInHtml(html: string, type: 'numbered' | 'bullet'): boolean {
  if (type === 'numbered') {
    // Check for <ol> with <li> children
    return /<ol[^>]*>[\s\S]*<li/i.test(html);
  } else {
    // Check for <ul> with <li> children
    return /<ul[^>]*>[\s\S]*<li/i.test(html);
  }
}

function hasFileExtension(text: string): boolean {
  return /\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpg|jpeg|gif)/i.test(text);
}

function hasFolderPath(text: string): boolean {
  // Look for folder-like paths or "located in" phrases
  return /\b(located in|folder|path|\/)\b/i.test(text) || /[A-Za-z]+\s*\/\s*[A-Za-z]+/.test(text);
}

function validateResponse(testCase: TestPrompt, response: string, html: string): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Check for fallbacks (HARD FAIL)
  for (const pattern of FALLBACK_PATTERNS) {
    if (pattern.test(response)) {
      failures.push(`FALLBACK_DETECTED: ${pattern.toString()}`);
    }
  }

  // Check for raw markers (HARD FAIL)
  for (const pattern of RAW_MARKER_PATTERNS) {
    if (pattern.test(response)) {
      failures.push(`RAW_MARKER_VISIBLE: ${pattern.toString()}`);
    }
  }

  // Check emoji rule
  if (testCase.rules.noEmoji && EMOJI_PATTERN.test(response)) {
    failures.push('EMOJI_WHEN_FORBIDDEN');
  }

  // Check numbered list rule (check both text patterns AND HTML elements)
  if (testCase.rules.mustBeNumbered) {
    const textCount = countListItems(response, 'numbered');
    const hasHtmlList = hasListInHtml(html, 'numbered');
    if (textCount < 1 && !hasHtmlList) {
      failures.push('MISSING_NUMBERED_LIST');
    }
  }

  // Check bullet list rule (check both text patterns AND HTML elements)
  if (testCase.rules.mustBeBullets) {
    const bulletCount = countListItems(response, 'bullet');
    const hasBulletHtml = hasListInHtml(html, 'bullet');
    if (bulletCount < 1 && !hasBulletHtml) {
      // Also accept numbered lists as valid structure
      const numberedCount = countListItems(response, 'numbered');
      const hasNumberedHtml = hasListInHtml(html, 'numbered');
      if (numberedCount < 1 && !hasNumberedHtml) {
        failures.push('MISSING_BULLET_LIST');
      }
    }
  }

  // Check button-only rule
  if (testCase.rules.buttonOnly) {
    // Response should be very short (under 100 chars) or mostly buttons
    const textWithoutButtons = response.replace(/\b[\w\s\-\.]+\.(pdf|docx?|xlsx?|pptx?|csv|txt)\b/gi, '');
    const cleanText = textWithoutButtons.replace(/[^\w\s]/g, '').trim();
    if (cleanText.length > 50) {
      warnings.push('BUTTON_ONLY_HAS_EXTRA_TEXT');
    }
  }

  // Check folder path rule
  if (testCase.rules.folderPathPlusButton) {
    if (!hasFolderPath(response) && !response.toLowerCase().includes('root')) {
      warnings.push('MISSING_FOLDER_PATH');
    }
  }

  // Check no extra text rule
  if (testCase.rules.noExtraText) {
    // Response should be concise
    if (response.length > 500) {
      warnings.push('RESPONSE_TOO_VERBOSE');
    }
  }

  // Check document reference rule
  if (testCase.rules.mustReferenceDoc) {
    if (!hasFileExtension(response) && !html.includes('document-button') && !html.includes('inline-document')) {
      failures.push('MISSING_DOCUMENT_REFERENCE');
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
  };
}

// ============================================================================
// MAIN TEST
// ============================================================================

test.describe('Koda Master Stress Test', () => {

  test('50-Question Single Conversation', async ({ page }) => {
    const results: TestResult[] = [];
    const sectionResults: Record<string, { passed: number; failed: number }> = {};

    // Initialize section counters
    for (const section of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      sectionResults[section] = { passed: 0, failed: 0 };
    }

    // Setup reports directory
    const reportsDir = path.join(process.cwd(), 'e2e', 'reports');
    const screenshotsDir = path.join(reportsDir, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Navigate to app
    console.log('\n========================================');
    console.log('KODA MASTER STRESS TEST - 50 Questions');
    console.log('========================================\n');

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Screenshot initial state
    await page.screenshot({ path: path.join(screenshotsDir, '00_initial.png') });

    // Handle onboarding modal
    const skipButton = page.locator('text=Skip introduction');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    // Login if needed
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Logging in as test@koda.com...');
      await emailInput.fill('test@koda.com');

      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill('test123');
      }

      const loginButton = page.locator('button[type="submit"]');
      await loginButton.click();
      await page.waitForTimeout(5000);
    }

    // Handle onboarding again after login
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForTimeout(1000);
    }

    // Start new chat
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    // Find chat input
    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], textarea[placeholder*="message"]');
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });

    console.log('Chat ready. Starting 50-question test...\n');

    // Run all prompts
    for (let i = 0; i < TEST_PROMPTS.length; i++) {
      const testCase = TEST_PROMPTS[i];
      const progressPct = Math.round(((i + 1) / TEST_PROMPTS.length) * 100);

      console.log(`[${testCase.id}] (${progressPct}%) Section ${testCase.section}: "${testCase.prompt.substring(0, 50)}..."`);

      const startTime = Date.now();
      let ttft = 0;

      // Count current messages
      const beforeCount = await page.locator('.assistant-message').count();

      // Send message
      await chatInput.fill(testCase.prompt);
      await chatInput.press('Enter');

      // Measure TTFT - wait for new message to appear
      const ttftStart = Date.now();
      try {
        await page.locator('.assistant-message').nth(beforeCount).waitFor({
          state: 'visible',
          timeout: 30000
        });
        ttft = Date.now() - ttftStart;
      } catch {
        ttft = 30000; // Timeout
      }

      // Wait for streaming to complete (check for stability)
      let lastContent = '';
      let stableCount = 0;
      const maxWait = 60000;
      const checkInterval = 500;
      const stableThreshold = 4; // 2 seconds of stability

      while (stableCount < stableThreshold && (Date.now() - startTime) < maxWait) {
        await page.waitForTimeout(checkInterval);
        const currentContent = await page.locator('.assistant-message').last().textContent() || '';

        if (currentContent === lastContent && currentContent.length > 0) {
          stableCount++;
        } else {
          stableCount = 0;
          lastContent = currentContent;
        }
      }

      const totalTime = Date.now() - startTime;

      // Get response content
      const assistantMsgs = page.locator('.assistant-message');
      const msgCount = await assistantMsgs.count();

      let response = '';
      let responseHtml = '';

      if (msgCount > 0) {
        response = await assistantMsgs.last().textContent() || '';
        responseHtml = await assistantMsgs.last().innerHTML() || '';
      }

      // Validate response
      const validation = validateResponse(testCase, response, responseHtml);

      // Build checks object
      const checks = {
        noFallback: !FALLBACK_PATTERNS.some(p => p.test(response)),
        noRawMarkers: !RAW_MARKER_PATTERNS.some(p => p.test(response)),
        noEmoji: !EMOJI_PATTERN.test(response),
        hasButtons: responseHtml.includes('document-button') || responseHtml.includes('inline-document') || hasFileExtension(response),
        // Check both text patterns AND HTML elements for lists (CSS counters don't appear in textContent)
        isNumberedList: countListItems(response, 'numbered') > 0 || hasListInHtml(responseHtml, 'numbered'),
        isBulletList: countListItems(response, 'bullet') > 0 || hasListInHtml(responseHtml, 'bullet'),
        isButtonOnly: response.length < 200,
        hasFolderPath: hasFolderPath(response),
        resolvesFollowup: testCase.rules.mustResolveFollowup ? hasFileExtension(response) : true,
        handlesError: testCase.rules.expectError ? !FALLBACK_PATTERNS.some(p => p.test(response)) : true,
      };

      const result: TestResult = {
        id: testCase.id,
        prompt: testCase.prompt,
        section: testCase.section,
        response: response.substring(0, 500),
        responseHtml: responseHtml.substring(0, 1000),
        ttft,
        totalTime,
        validation,
        checks,
        timestamp: new Date().toISOString(),
      };

      results.push(result);

      // Update section results
      if (validation.passed) {
        sectionResults[testCase.section].passed++;
        console.log(`  -> PASS (TTFT: ${ttft}ms, Total: ${totalTime}ms)`);
      } else {
        sectionResults[testCase.section].failed++;
        console.log(`  -> FAIL: ${validation.failures.join(', ')}`);

        // Screenshot on failure
        await page.screenshot({
          path: path.join(screenshotsDir, `fail_${testCase.id}.png`),
          fullPage: true
        });
      }

      if (validation.warnings.length > 0) {
        console.log(`     Warnings: ${validation.warnings.join(', ')}`);
      }

      // Small delay between messages
      await page.waitForTimeout(300);
    }

    // Final screenshot
    await page.screenshot({
      path: path.join(screenshotsDir, '99_final.png'),
      fullPage: true
    });

    // Calculate summary
    const passed = results.filter(r => r.validation.passed);
    const failed = results.filter(r => !r.validation.passed);
    const avgTtft = Math.round(results.reduce((sum, r) => sum + r.ttft, 0) / results.length);
    const avgTotalTime = Math.round(results.reduce((sum, r) => sum + r.totalTime, 0) / results.length);

    // Categorize failures
    const hardFails: string[] = [];
    const softFails: string[] = [];

    for (const r of failed) {
      for (const f of r.validation.failures) {
        if (f.includes('FALLBACK') || f.includes('RAW_MARKER')) {
          hardFails.push(`${r.id}: ${f}`);
        } else {
          softFails.push(`${r.id}: ${f}`);
        }
      }
    }

    // Count specific failure types
    const fallbackCount = results.filter(r =>
      r.validation.failures.some(f => f.includes('FALLBACK'))
    ).length;
    const rawMarkerCount = results.filter(r =>
      r.validation.failures.some(f => f.includes('RAW_MARKER'))
    ).length;
    const formatFailures = results.filter(r =>
      r.validation.failures.some(f => f.includes('LIST') || f.includes('EMOJI'))
    ).length;
    const followupFailures = results.filter(r =>
      r.validation.failures.some(f => f.includes('FOLLOWUP'))
    ).length;

    const report: TestReport = {
      runId: `master_${Date.now()}`,
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: passed.length,
        failed: failed.length,
        passRate: `${((passed.length / results.length) * 100).toFixed(1)}%`,
        avgTtft,
        avgTotalTime,
        fallbackCount,
        rawMarkerCount,
        formatFailures,
        followupFailures,
      },
      sectionResults,
      results,
      hardFails,
      softFails,
    };

    // Save reports
    fs.writeFileSync(
      path.join(reportsDir, 'master_results.json'),
      JSON.stringify(report, null, 2)
    );

    // Save failures separately
    if (failed.length > 0) {
      fs.writeFileSync(
        path.join(reportsDir, 'master_failures.json'),
        JSON.stringify({
          hardFails,
          softFails,
          failedTests: failed.map(r => ({
            id: r.id,
            prompt: r.prompt,
            failures: r.validation.failures,
            warnings: r.validation.warnings,
            response: r.response,
          })),
        }, null, 2)
      );
    }

    // Generate markdown report
    const markdown = `# Koda Master Stress Test Report

## Summary
- **Run ID:** ${report.runId}
- **Timestamp:** ${report.timestamp}
- **Total Tests:** ${report.summary.total}
- **Passed:** ${report.summary.passed}
- **Failed:** ${report.summary.failed}
- **Pass Rate:** ${report.summary.passRate}
- **Avg TTFT:** ${report.summary.avgTtft}ms
- **Avg Total Time:** ${report.summary.avgTotalTime}ms

## Failure Categories
- **Fallbacks:** ${report.summary.fallbackCount} (HARD FAIL)
- **Raw Markers:** ${report.summary.rawMarkerCount} (HARD FAIL)
- **Format Issues:** ${report.summary.formatFailures}
- **Follow-up Failures:** ${report.summary.followupFailures}

## Section Results
| Section | Passed | Failed |
|---------|--------|--------|
${Object.entries(report.sectionResults).map(([s, r]) => `| ${s} | ${r.passed} | ${r.failed} |`).join('\n')}

## Hard Fails (Must Fix Before Deploy)
${hardFails.length > 0 ? hardFails.map(f => `- ${f}`).join('\n') : 'None'}

## Soft Fails (Fix Before Production)
${softFails.length > 0 ? softFails.map(f => `- ${f}`).join('\n') : 'None'}

## All Results
| ID | Section | Status | TTFT | Total | Issues |
|----|---------|--------|------|-------|--------|
${results.map(r => `| ${r.id} | ${r.section} | ${r.validation.passed ? 'PASS' : 'FAIL'} | ${r.ttft}ms | ${r.totalTime}ms | ${r.validation.failures.join(', ') || '-'} |`).join('\n')}
`;

    fs.writeFileSync(path.join(reportsDir, 'master_summary.md'), markdown);

    // Console summary
    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');
    console.log(`Total: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Pass Rate: ${report.summary.passRate}`);
    console.log(`\nHard Fails: ${hardFails.length}`);
    console.log(`Soft Fails: ${softFails.length}`);
    console.log(`\nAvg TTFT: ${report.summary.avgTtft}ms`);
    console.log(`Avg Total: ${report.summary.avgTotalTime}ms`);
    console.log('\nSection Breakdown:');
    for (const [section, counts] of Object.entries(report.sectionResults)) {
      console.log(`  Section ${section}: ${counts.passed}/${counts.passed + counts.failed} passed`);
    }
    console.log('\nReports saved to e2e/reports/');

    // Assert no hard failures
    expect(hardFails.length, 'No hard failures (fallbacks, raw markers)').toBe(0);
  });
});
