/**
 * BATCH 1: Inventory baseline + strict formatting + no emoji
 * 15 questions - Must pass 100% before moving to Batch 2
 */
import { test, expect } from '@playwright/test';

const BATCH1_QUESTIONS = [
  {
    id: 'B1Q01',
    prompt: 'List all my uploaded documents as a numbered list. One file per line. No emojis.',
    validate: (text: string, html: string) => ({
      // Check for numbered list in text OR <ol>/<li> in HTML
      hasNumberedList: /^\s*\d+[\.\)]\s+/m.test(text) || /<ol|<li/i.test(html),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
      // Check for multiple items in text OR multiple <li> in HTML
      hasMultipleItems: (text.match(/^\s*\d+[\.\)]/gm) || []).length >= 2 || (html.match(/<li/gi) || []).length >= 2,
    }),
    required: ['hasNumberedList', 'noEmojis', 'hasMultipleItems'],
  },
  {
    id: 'B1Q02',
    prompt: 'Now list them again, but grouped by file type (PDF, XLSX, PPTX, PNG/JPG). Use headings and numbered lists under each.',
    validate: (text: string, html: string) => ({
      hasHeadings: /\b(PDF|XLSX|PPTX|PNG|JPG|Images?|Spreadsheets?|Presentations?)\b/i.test(text),
      hasNumberedList: /^\s*\d+[\.\)]\s+/m.test(text) || /<ol|<li/i.test(html),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasHeadings', 'hasNumberedList', 'noEmojis'],
  },
  {
    id: 'B1Q03',
    prompt: 'Show me only PDFs, numbered, and include the folder path for each.',
    validate: (text: string, html: string) => ({
      hasNumberedList: /^\s*\d+[\.\)]\s+/m.test(text) || /<ol|<li/i.test(html),
      mentionsPDF: /\.pdf/i.test(text),
      hasFolderPath: /(folder|path|\/|test\s*\d)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasNumberedList', 'mentionsPDF', 'noEmojis'],
  },
  {
    id: 'B1Q04',
    prompt: 'Show me only spreadsheets (XLS/XLSX/CSV), numbered, include folder path.',
    validate: (text: string, html: string) => ({
      hasNumberedList: /^\s*\d+[\.\)]\s+/m.test(text) || /<ol|<li/i.test(html),
      mentionsSpreadsheet: /\.(xlsx?|csv)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasNumberedList', 'mentionsSpreadsheet', 'noEmojis'],
  },
  {
    id: 'B1Q05',
    prompt: 'Show me only images (PNG/JPG/JPEG), numbered, include folder path.',
    validate: (text: string, html: string) => ({
      hasNumberedList: /^\s*\d+[\.\)]\s+/m.test(text) || /<ol|<li/i.test(html),
      mentionsImage: /\.(png|jpe?g)/i.test(text) || /no\s*(images?|png|jpg)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasNumberedList', 'noEmojis'],
  },
  {
    id: 'B1Q06',
    prompt: 'Which file is the newest upload? Return: filename + type + folder path.',
    validate: (text: string) => ({
      hasFilename: /\.\w{2,4}\b/.test(text),
      hasType: /(pdf|xlsx?|pptx?|png|jpg|csv|type)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasFilename', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q07',
    prompt: 'Which file is the largest? Return: filename + size + folder path.',
    validate: (text: string) => ({
      hasFilename: /\.\w{2,4}\b/.test(text),
      hasSize: /(\d+\s*(kb|mb|gb|bytes?)|\d+,?\d*\s*(kb|mb))/i.test(text) || /size|largest/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasFilename', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q08',
    prompt: 'Which file is the smallest? Return: filename + size + folder path.',
    validate: (text: string) => ({
      hasFilename: /\.\w{2,4}\b/.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasFilename', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q09',
    prompt: "Give me a 1–2 sentence description of what each document is, but only if you can prove it from the document itself. If you can't, say 'Unknown' for that item.",
    validate: (text: string) => ({
      hasMultipleItems: text.split('\n').filter(l => l.trim().length > 10).length >= 2,
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasMultipleItems', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q10',
    prompt: 'Create a clean table with columns: File, Type, Folder, Size, Last Modified (if known). If unknown, leave blank.',
    validate: (text: string, html: string) => ({
      // Check for markdown table OR HTML table OR column headers in text
      hasTable: /\|.*\|/.test(text) || /<table|<tr|<th|<td/i.test(html) || /(File|Name).*Type.*Folder/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasTable', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q11',
    prompt: "Find any file name that contains the word 'Lone' or 'LMR' and list them.",
    validate: (text: string) => ({
      hasMatch: /(lone|lmr)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasMatch', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q12',
    prompt: "Find any file name that contains 'Rosewood' and list it.",
    validate: (text: string) => ({
      hasMatch: /rosewood/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasMatch', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q13',
    prompt: "Find any file name that contains 'Trabalho' and list them.",
    validate: (text: string) => ({
      hasMatch: /trabalho/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
      noEmojis: !/[\u{1F300}-\u{1F9FF}]/u.test(text),
    }),
    required: ['hasMatch', 'noFallback', 'noEmojis'],
  },
  {
    id: 'B1Q14',
    prompt: "If I ask 'open the newest PDF', which exact file would that be? Answer with only the file button.",
    validate: (text: string, html: string) => ({
      hasDocButton: /\{\{DOC::/.test(text) || /document-button|doc-button|file-button/i.test(html),
      mentionsPDF: /\.pdf/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
    }),
    required: ['mentionsPDF', 'noFallback'],
  },
  {
    id: 'B1Q15',
    prompt: 'Open the file you think is the most important for finance. Only the button.',
    validate: (text: string, html: string) => ({
      hasDocButton: /\{\{DOC::/.test(text) || /document-button|doc-button|file-button/i.test(html) || /\.\w{2,4}\b/.test(text),
      noFallback: !/(rephrase|upload documents|don't see any)/i.test(text),
    }),
    required: ['hasDocButton', 'noFallback'],
  },
];

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  credentials: { email: 'test@koda.com', password: 'test123' },
  timeouts: {
    login: 30000,
    message: 60000,
    stability: 5000,
  },
};

test.describe('Batch 1: Inventory + Formatting', () => {
  test('Run all 15 questions', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes max

    // Login
    await page.goto(CONFIG.baseUrl);
    await page.waitForTimeout(2000);

    // Check if already logged in
    const chatInput = page.locator('textarea[placeholder*="message"], input[placeholder*="message"], .chat-input');
    const isLoggedIn = await chatInput.isVisible().catch(() => false);

    if (!isLoggedIn) {
      await page.fill('input[type="email"]', CONFIG.credentials.email);
      await page.fill('input[type="password"]', CONFIG.credentials.password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    // Start new conversation
    const newChatBtn = page.locator('button:has-text("New"), [aria-label*="new chat"], .new-chat-btn').first();
    if (await newChatBtn.isVisible().catch(() => false)) {
      await newChatBtn.click();
      await page.waitForTimeout(2000);
    }

    // Results tracking
    const results: Array<{
      id: string;
      prompt: string;
      passed: boolean;
      failures: string[];
      response: string;
      ttft: number;
    }> = [];

    // Run each question
    for (const q of BATCH1_QUESTIONS) {
      console.log(`\n[${q.id}] Sending: "${q.prompt.substring(0, 50)}..."`);

      // Count messages BEFORE sending (important to detect NEW message)
      const messageCountBefore = await page.locator('.assistant-message').count();

      const startTime = Date.now();

      // Send message
      const inputField = page.locator('textarea, input[type="text"]').last();
      await inputField.fill(q.prompt);
      await page.keyboard.press('Enter');

      // Wait for response
      let ttft = 0;
      let responseText = '';
      let responseHtml = '';

      try {
        // Wait for NEW assistant message (count must increase)
        await page.waitForFunction(
          (expectedCount: number) => document.querySelectorAll('.assistant-message').length > expectedCount,
          messageCountBefore,
          { timeout: CONFIG.timeouts.message }
        );
        ttft = Date.now() - startTime;

        // Wait for streaming to complete
        await page.waitForTimeout(CONFIG.timeouts.stability);

        // Get response - use innerText to preserve line breaks (textContent collapses them)
        const lastMessage = page.locator('.assistant-message').last();
        responseText = await lastMessage.innerText() || '';
        responseHtml = await lastMessage.innerHTML() || '';

        // Clean up response text (remove UI elements)
        responseText = responseText.replace(/RegenerateCopy/g, '').trim();

      } catch (e) {
        console.error(`[${q.id}] Timeout or error:`, e);
        responseText = 'ERROR: Timeout';
      }

      // Validate
      const validationResult = q.validate(responseText, responseHtml);
      const failures: string[] = [];

      for (const req of q.required) {
        if (!validationResult[req]) {
          failures.push(req);
        }
      }

      const passed = failures.length === 0;

      results.push({
        id: q.id,
        prompt: q.prompt,
        passed,
        failures,
        response: responseText.substring(0, 500),
        ttft,
      });

      console.log(`[${q.id}] ${passed ? '✓ PASS' : '✗ FAIL'} (TTFT: ${ttft}ms)`);
      if (!passed) {
        console.log(`  Failures: ${failures.join(', ')}`);
        console.log(`  Response: ${responseText.substring(0, 200)}...`);
      }

      // Small delay between questions
      await page.waitForTimeout(1000);
    }

    // Summary
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;

    console.log('\n' + '='.repeat(60));
    console.log('BATCH 1 RESULTS');
    console.log('='.repeat(60));
    console.log(`Passed: ${passCount}/15`);
    console.log(`Failed: ${failCount}/15`);
    console.log(`Pass Rate: ${((passCount / 15) * 100).toFixed(1)}%`);

    if (failCount > 0) {
      console.log('\nFailed Questions:');
      for (const r of results.filter(r => !r.passed)) {
        console.log(`  ${r.id}: ${r.failures.join(', ')}`);
      }
    }

    // Write report
    const report = {
      batch: 1,
      timestamp: new Date().toISOString(),
      summary: { passed: passCount, failed: failCount, total: 15 },
      results,
    };

    const fs = require('fs');
    const reportPath = `/Users/pg/Desktop/koda-webapp/frontend/e2e/batch_tests/BATCH1_REPORT.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Assert 100% pass for batch completion
    expect(failCount, `Batch 1 has ${failCount} failures. Must be 0 to proceed.`).toBe(0);
  });
});
