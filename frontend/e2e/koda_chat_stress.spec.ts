/**
 * Koda Chat Stress Test - Single Conversation Flow
 *
 * Runs ALL prompts in ONE conversation to test context continuity,
 * follow-ups, and real conversation flow.
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Test prompts - ALL run in ONE conversation
const TEST_PROMPTS = [
  // File Listing
  { id: 'FL1', prompt: 'What files do I have uploaded?', expectedIntent: 'file_actions', category: 'file_listing' },
  { id: 'FL2', prompt: 'List all my documents', expectedIntent: 'file_actions', category: 'file_listing' },

  // Navigation/Location
  { id: 'NAV1', prompt: 'Where is my newest PDF?', expectedIntent: 'file_actions', category: 'navigation' },

  // Document Q&A (needs context from listed files)
  { id: 'QA1', prompt: 'Summarize the first document', expectedIntent: 'documents', category: 'qa' },

  // Follow-ups (MUST work in same conversation)
  { id: 'FU1', prompt: 'Open it', expectedIntent: 'file_actions', category: 'followup', isFollowup: true },
  { id: 'FU2', prompt: 'Where is it?', expectedIntent: 'file_actions', category: 'followup', isFollowup: true },

  // More file actions
  { id: 'OPEN1', prompt: 'Show me my spreadsheets', expectedIntent: 'file_actions', category: 'open_show' },

  // Edge case
  { id: 'EDGE1', prompt: 'Hello, how are you?', expectedIntent: 'chitchat', category: 'edge_case' },

  // Hard question
  { id: 'HARD1', prompt: 'What are the main topics across all my documents?', expectedIntent: 'documents', category: 'hard_question' },
];

interface TestResult {
  id: string;
  prompt: string;
  expectedIntent: string;
  category: string;
  passed: boolean;
  failureReasons: string[];
  response: string;
  latency: number;
  hasMarkers: boolean;
  hasFallback: boolean;
  hasEmoji: boolean;
  timestamp: string;
}

interface TestReport {
  runId: string;
  timestamp: string;
  conversationId: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: string;
    avgLatency: number;
    fallbackCount: number;
  };
  results: TestResult[];
}

// Fallback patterns - these should NEVER appear
const FALLBACK_PATTERNS = [
  /couldn't find|could not find|unable to find/i,
  /please rephrase|try rephrasing/i,
  /i don't understand|i'm not sure what you mean/i,
  /no relevant|no matching/i,
  /something went wrong|error occurred/i,
  /not found in the provided documents/i,
];

// Emoji detection
const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

// Document marker pattern (raw markers in text - for debugging)
const DOC_MARKER_PATTERN = /\{\{DOC::/;

// Document file extension pattern (for checking file listings in rendered output)
const FILE_EXTENSION_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|txt|csv)/i;

test.describe('Koda Single Conversation Test', () => {

  test('Run full conversation in one chat', async ({ page }) => {
    const results: TestResult[] = [];

    // Navigate to app
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Screenshot initial state
    await page.screenshot({ path: 'e2e/reports/screenshots/01_initial.png' });

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
      console.log('Logging in...');
      await emailInput.fill('test@koda.com');

      const passwordInput = page.locator('input[type="password"]');
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill('test123');
      }

      const loginButton = page.locator('button[type="submit"]:has-text("Log In")');
      await loginButton.click();

      // Wait for chat to load
      await page.waitForTimeout(5000);
    }

    // Handle onboarding modal AGAIN after login
    const skipButton2 = page.locator('text=Skip introduction');
    if (await skipButton2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton2.click();
      await page.waitForTimeout(1000);
    }

    // Screenshot after login
    await page.screenshot({ path: 'e2e/reports/screenshots/02_logged_in.png' });

    // Start new chat to ensure clean conversation
    const newChatButton = page.locator('button:has-text("New Chat"), [data-testid="new-chat"]');
    if (await newChatButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newChatButton.click();
      await page.waitForTimeout(1000);
    }

    // Find chat input
    const chatInput = page.locator('textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], textarea[placeholder*="message"]');
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });

    console.log('\n=== Starting Conversation Test ===\n');

    // Run ALL prompts in ONE conversation
    for (const testCase of TEST_PROMPTS) {
      console.log(`[${testCase.id}] Sending: "${testCase.prompt}"`);

      const startTime = Date.now();

      // Type and send message
      await chatInput.fill(testCase.prompt);
      await chatInput.press('Enter');

      // Simple fixed wait for response to complete
      // 4 seconds is typically enough for most responses
      await page.waitForTimeout(4000);

      const latency = Date.now() - startTime;

      // Get the last assistant message
      const assistantMsgs = page.locator('.assistant-message');
      const count = await assistantMsgs.count();
      const response = count > 0
        ? await assistantMsgs.last().textContent() || ''
        : '';

      // Analyze response
      const failureReasons: string[] = [];

      const hasFallback = FALLBACK_PATTERNS.some(p => p.test(response));
      if (hasFallback) failureReasons.push('FALLBACK_DETECTED');

      const hasEmoji = EMOJI_PATTERN.test(response);
      if (hasEmoji) failureReasons.push('EMOJI_DETECTED');

      const hasMarkers = DOC_MARKER_PATTERN.test(response);

      // For file_actions, check that either:
      // 1. File names with extensions appear in response (rendered buttons show as text)
      // 2. Or clickable document buttons exist in the message
      if (testCase.expectedIntent === 'file_actions' && testCase.category === 'file_listing') {
        const hasFileNames = FILE_EXTENSION_PATTERN.test(response);
        const docButtons = await page.locator('.inline-document-button, [class*="document-button"]').count();
        if (!hasFileNames && docButtons === 0 && response.length > 50) {
          failureReasons.push('NO_FILE_LISTING');
        }
      }

      const result: TestResult = {
        id: testCase.id,
        prompt: testCase.prompt,
        expectedIntent: testCase.expectedIntent,
        category: testCase.category,
        passed: failureReasons.length === 0,
        failureReasons,
        response: response.substring(0, 300),
        latency,
        hasMarkers,
        hasFallback,
        hasEmoji,
        timestamp: new Date().toISOString(),
      };

      results.push(result);

      console.log(`  → ${result.passed ? 'PASS' : 'FAIL'} (${latency}ms)${failureReasons.length ? ' - ' + failureReasons.join(', ') : ''}`);

      // Small delay between messages
      await page.waitForTimeout(500);
    }

    // Final screenshot
    await page.screenshot({ path: 'e2e/reports/screenshots/99_final.png', fullPage: true });

    // Generate report
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);
    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    const report: TestReport = {
      runId: `run_${Date.now()}`,
      timestamp: new Date().toISOString(),
      conversationId: 'single-conversation',
      summary: {
        total: results.length,
        passed: passed.length,
        failed: failed.length,
        passRate: `${((passed.length / results.length) * 100).toFixed(1)}%`,
        avgLatency: Math.round(avgLatency),
        fallbackCount: results.filter(r => r.hasFallback).length,
      },
      results,
    };

    // Save reports
    const reportsDir = path.join(process.cwd(), 'e2e', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(path.join(reportsDir, 'screenshots'), { recursive: true });

    fs.writeFileSync(
      path.join(reportsDir, 'results.json'),
      JSON.stringify(report, null, 2)
    );

    // Markdown summary
    const markdown = `# Koda Chat Test Report

## Summary
- **Run ID:** ${report.runId}
- **Timestamp:** ${report.timestamp}
- **Total Tests:** ${report.summary.total}
- **Passed:** ${report.summary.passed}
- **Failed:** ${report.summary.failed}
- **Pass Rate:** ${report.summary.passRate}
- **Avg Latency:** ${report.summary.avgLatency}ms
- **Fallbacks:** ${report.summary.fallbackCount}

## Results

| ID | Prompt | Status | Latency | Issues |
|----|--------|--------|---------|--------|
${results.map(r => `| ${r.id} | ${r.prompt.substring(0, 30)}... | ${r.passed ? '✓' : '✗'} | ${r.latency}ms | ${r.failureReasons.join(', ') || '-'} |`).join('\n')}

## Failed Tests
${failed.map(r => `
### ${r.id}: ${r.prompt}
- **Issues:** ${r.failureReasons.join(', ')}
- **Response:** ${r.response.substring(0, 200)}...
`).join('\n') || 'None - All tests passed!'}
`;

    fs.writeFileSync(path.join(reportsDir, 'summary.md'), markdown);

    // Console summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Total: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Pass Rate: ${report.summary.passRate}`);
    console.log(`Fallbacks: ${report.summary.fallbackCount}`);
    console.log(`Avg Latency: ${report.summary.avgLatency}ms`);

    // Assert no fallbacks (hard fail)
    expect(report.summary.fallbackCount, 'No fallback responses should occur').toBe(0);
  });
});
