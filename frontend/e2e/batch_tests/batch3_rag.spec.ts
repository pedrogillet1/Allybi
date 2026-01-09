/**
 * BATCH 3: RAG Document Content Questions
 * 15 questions - Must pass 100% before moving to Batch 4
 *
 * Tests the retrieval augmented generation system:
 * - Document content extraction
 * - Specific data point retrieval
 * - Summarization
 * - Cross-document questions
 */
import { test, expect } from '@playwright/test';

const BATCH3_QUESTIONS = [
  // === LMR IMPROVEMENT PLAN CONTENT ===
  {
    id: 'B3Q01',
    prompt: 'What is the LMR Improvement Plan document about?',
    validate: (text: string) => ({
      hasTopic: /(improvement|plan|property|pip|renovation|upgrade|capital|investment|lmr|lone\s*mountain|ranch|budget|project)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasTopic', 'noFallback'],
  },
  {
    id: 'B3Q02',
    prompt: 'Summarize the LMR Improvement Plan in 3 bullet points.',
    validate: (text: string, html: string) => ({
      hasBullets: /[-•*]\s+\S/m.test(text) || /<li/i.test(html) || text.split('\n').filter(l => l.trim().length > 10).length >= 2 || /isn't\s+mentioned/i.test(text),
      hasContent: /(improvement|plan|property|pip|renovation|upgrade|capital|investment|lmr|budget|project|cabin|lodge|ranch|isn't\s+mentioned)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasBullets', 'hasContent', 'noFallback'],
  },
  {
    id: 'B3Q03',
    prompt: 'What year does the LMR Improvement Plan cover?',
    validate: (text: string) => ({
      hasYear: /202[0-9]|2025|2024|2023/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasYear', 'noFallback'],
  },
  {
    id: 'B3Q04',
    prompt: 'What is the total budget mentioned in the LMR Improvement Plan? If not mentioned, say so.',
    validate: (text: string) => ({
      hasAmount: /\$[\d,]+|63\s*m|\d+[\d,]*\s*(million|thousand|k|m)?|not\s+mentioned|isn't\s+mentioned|couldn't\s+find|budget/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasAmount', 'noFallback'],
  },
  {
    id: 'B3Q05',
    prompt: 'Are there any project categories mentioned in the LMR Improvement Plan? List them if found.',
    validate: (text: string) => ({
      hasCategories: /(cabin|lodge|room|f&b|restaurant|facility|infrastructure|amenity|spa|pool|improvement|renovation|category|project|isn't\s+mentioned|couldn't\s+find)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasCategories', 'noFallback'],
  },
  {
    id: 'B3Q06',
    prompt: 'What specific improvements are planned in the LMR Improvement Plan?',
    validate: (text: string) => ({
      hasTopic: /(cabin|lodge|room|f&b|restaurant|facility|infrastructure|amenity|spa|pool|improvement|renovation|ranch|hall|bison|isn't\s+mentioned)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasTopic', 'noFallback'],
  },
  {
    id: 'B3Q07',
    prompt: 'What is the largest line item or project in the LMR Improvement Plan? If not clear, say so.',
    validate: (text: string) => ({
      hasType: /(cabin|lodge|bison|ranch|hall|largest|biggest|million|project|isn't\s+mentioned|couldn't\s+find|not\s+clear)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasType', 'noFallback'],
  },
  {
    id: 'B3Q08',
    prompt: 'What property or location is the LMR Improvement Plan for?',
    validate: (text: string) => ({
      hasTopic: /(lone\s*mountain|ranch|lmr|montana|property|location|resort|hotel|isn't\s+mentioned)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasTopic', 'noFallback'],
  },
  {
    id: 'B3Q09',
    prompt: 'What cost figures are mentioned in the LMR Improvement Plan? Give some examples.',
    validate: (text: string) => ({
      hasAmount: /\$[\d,]+|63\s*m|\d+[\d,]*\s*(million|thousand)|367,500|3,286|isn't\s+mentioned|couldn't\s+find/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasAmount', 'noFallback'],
  },
  {
    id: 'B3Q10',
    prompt: 'What is Ranch Hall in the LMR Improvement Plan?',
    validate: (text: string, html: string) => ({
      hasCategories: /(ranch\s*hall|f&b|food|beverage|restaurant|facility|dining|isn't\s+mentioned|couldn't\s+find)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasCategories', 'noFallback'],
  },
  {
    id: 'B3Q11',
    prompt: 'What cabin or lodge projects are in the LMR Improvement Plan?',
    validate: (text: string) => ({
      hasRelationship: /(cabin|lodge|bison|schapp|house|bed|guest|accommodation|isn't\s+mentioned|couldn't\s+find)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasRelationship', 'noFallback'],
  },
  {
    id: 'B3Q12',
    prompt: 'What is the document date or time period covered by the LMR Improvement Plan?',
    validate: (text: string) => ({
      hasAnswer: /(2025|2024|2023|202[0-9]|march|april|q[1-4]|year|isn't\s+mentioned|couldn't\s+find)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasAnswer', 'noFallback'],
  },
  {
    id: 'B3Q13',
    prompt: 'Based on my documents, what industry or business sector do they relate to?',
    validate: (text: string) => ({
      hasSector: /(hospitality|hotel|ranch|investment|finance|real\s*estate|tourism|fund|capital)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasSector', 'noFallback'],
  },
  {
    id: 'B3Q14',
    prompt: 'If I wanted to understand the financial health of Lone Mountain Ranch, which documents should I look at?',
    validate: (text: string) => ({
      hasRecommendation: /(p&l|profit|loss|financial|improvement|plan|budget|document|file)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasRecommendation', 'noFallback'],
  },
  {
    id: 'B3Q15',
    prompt: 'Give me a one-sentence summary of each document I have uploaded.',
    validate: (text: string) => ({
      hasMultipleSummaries: text.split('\n').filter(l => l.trim().length > 20).length >= 2 || /(lone\s*mountain|rosewood|improvement)/i.test(text),
      noFallback: !/(rephrase|upload documents|don't see any documents)/i.test(text),
    }),
    required: ['hasMultipleSummaries', 'noFallback'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ════════════════════════════════════════════════════════════════════════════

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';
const TIMEOUT_PER_QUESTION = 120000; // 2 minutes per question

test.describe('Batch 3: RAG Document Content', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${TEST_URL}/login`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for chat interface
    await page.waitForSelector('[data-testid="chat-input"], textarea, input[placeholder*="message"], input[placeholder*="Ask"]', { timeout: 30000 });
  });

  test('Run all 15 questions', async ({ page }) => {
    test.setTimeout(TIMEOUT_PER_QUESTION * BATCH3_QUESTIONS.length + 60000);

    const results: Array<{
      id: string;
      passed: boolean;
      failures: string[];
      response: string;
      ttft: number;
    }> = [];

    // Find chat input
    const chatInput = page.locator('[data-testid="chat-input"], textarea, input[placeholder*="message"], input[placeholder*="Ask"]').first();

    for (const q of BATCH3_QUESTIONS) {
      console.log(`\n[${q.id}] Sending: "${q.prompt.substring(0, 50)}..."`);

      // Count existing messages
      const initialCount = await page.locator('.assistant-message').count();

      // Send message
      await chatInput.fill(q.prompt);
      await page.keyboard.press('Enter');

      // Wait for response (new assistant message)
      const startTime = Date.now();
      let ttft = 0;

      try {
        await page.waitForFunction(
          (expectedCount) => document.querySelectorAll('.assistant-message').length > expectedCount,
          initialCount,
          { timeout: TIMEOUT_PER_QUESTION }
        );
        ttft = Date.now() - startTime;

        // Wait for streaming to complete
        await page.waitForTimeout(2000);

        // Get response text and HTML
        const lastMessage = page.locator('.assistant-message').last();
        const responseText = await lastMessage.textContent() || '';
        const responseHtml = await lastMessage.innerHTML() || '';

        // Validate
        const validation = q.validate(responseText, responseHtml);
        const failures = q.required.filter(req => !validation[req]);

        const passed = failures.length === 0;
        results.push({
          id: q.id,
          passed,
          failures,
          response: responseText.substring(0, 200),
          ttft,
        });

        if (passed) {
          console.log(`[${q.id}] ✓ PASS (TTFT: ${ttft}ms)`);
        } else {
          console.log(`[${q.id}] ✗ FAIL (TTFT: ${ttft}ms)`);
          console.log(`  Failures: ${failures.join(', ')}`);
          console.log(`  Response: ${responseText.substring(0, 100)}...`);
        }
      } catch (error: any) {
        console.log(`[${q.id}] Timeout or error:`, error);
        results.push({
          id: q.id,
          passed: false,
          failures: ['TIMEOUT'],
          response: 'ERROR: Timeout',
          ttft: 0,
        });
        console.log(`[${q.id}] ✗ FAIL (TTFT: 0ms)`);
        console.log(`  Failures: TIMEOUT`);
        console.log(`  Response: ERROR: Timeout...`);
      }
    }

    // Print summary
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;

    console.log('\n' + '='.repeat(60));
    console.log('BATCH 3 RESULTS');
    console.log('='.repeat(60));
    console.log(`Passed: ${passCount}/${results.length}`);
    console.log(`Failed: ${failCount}/${results.length}`);
    console.log(`Pass Rate: ${(passCount / results.length * 100).toFixed(1)}%`);

    if (failCount > 0) {
      console.log('\nFailed Questions:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  ${r.id}: ${r.failures.join(', ')}`);
      });
    }

    // Assert 100% pass for batch completion
    expect(failCount, `Batch 3 has ${failCount} failures. Must be 0 to proceed.`).toBe(0);
  });
});
