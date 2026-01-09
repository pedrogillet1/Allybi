/**
 * Send and Assert Utility - Sends messages and validates responses
 */

import { Page } from '@playwright/test';
import { TestQuestion } from './shard';
import { isStreaming, waitForStreamingComplete, getLastAssistantMessage, getLastAssistantMessageHTML, getMessageCount } from './conversation';

export interface SendResult {
  questionId: string;
  question: string;
  answer: string;
  answerHTML: string;
  ttftMs: number;
  totalMs: number;
  streamingDetected: boolean;
  messageCountBefore: { user: number; assistant: number };
  messageCountAfter: { user: number; assistant: number };
  passed: boolean;
  failureReason: string | null;
  screenshotPath: string | null;
  domSnapshotPath: string | null;
}

export interface SendOptions {
  timeout?: number;
  screenshotOnFail?: boolean;
  saveDOM?: boolean;
  resultsDir?: string;
}

const DEFAULT_OPTIONS: SendOptions = {
  timeout: 60000,
  screenshotOnFail: true,
  saveDOM: true,
  resultsDir: 'e2e/results'
};

/**
 * Send a message and measure response
 */
export async function sendMessage(
  page: Page,
  question: TestQuestion,
  options: SendOptions = {}
): Promise<SendResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let ttftMs = 0;
  let streamingDetected = false;

  const result: SendResult = {
    questionId: question.id,
    question: question.text,
    answer: '',
    answerHTML: '',
    ttftMs: 0,
    totalMs: 0,
    streamingDetected: false,
    messageCountBefore: { user: 0, assistant: 0 },
    messageCountAfter: { user: 0, assistant: 0 },
    passed: false,
    failureReason: null,
    screenshotPath: null,
    domSnapshotPath: null
  };

  try {
    // Small delay to ensure previous message fully rendered
    await page.waitForTimeout(500);

    // Get message count before
    result.messageCountBefore = await getMessageCount(page);

    // Type the message
    const chatInput = page.locator('[data-testid="chat-input"]');
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatInput.fill(question.text);

    // Press Enter to send (more reliable than clicking button which can be blocked by overlays)
    await chatInput.press('Enter');

    const sendTime = Date.now();

    // Wait for first token (TTFT measurement)
    // Look for either streaming indicator or new assistant message
    await Promise.race([
      page.locator('[data-testid="msg-streaming"]').waitFor({ state: 'visible', timeout: opts.timeout }),
      page.locator('[data-testid="msg-assistant"]').nth(result.messageCountBefore.assistant).waitFor({ state: 'visible', timeout: opts.timeout })
    ]);

    ttftMs = Date.now() - sendTime;
    result.ttftMs = ttftMs;

    // Check if streaming was detected
    streamingDetected = await isStreaming(page);
    result.streamingDetected = streamingDetected;

    // Wait for response to complete
    if (streamingDetected) {
      await waitForStreamingComplete(page, opts.timeout);
    } else {
      // Wait for assistant message to appear and stabilize
      await page.waitForTimeout(500);
    }

    // Get the final answer
    const answer = await getLastAssistantMessage(page);
    const answerHTML = await getLastAssistantMessageHTML(page);

    result.answer = answer || '';
    result.answerHTML = answerHTML || '';
    result.totalMs = Date.now() - startTime;

    // Post-stability check: wait 2 seconds for DOM to stabilize
    await page.waitForTimeout(2000);

    // Get message count AFTER stability wait
    result.messageCountAfter = await getMessageCount(page);

    // Verify content didn't change after another wait
    await page.waitForTimeout(1000);
    const answerAfterWait = await getLastAssistantMessage(page);

    if (answer !== answerAfterWait) {
      result.failureReason = 'Message content changed after completion (DOM instability)';
      result.passed = false;
    } else {
      result.passed = true;
    }

    // Verify messages are visible by looking for content (more reliable than counting)
    // Check that the user message we sent is visible somewhere
    const userMessageVisible = await page.locator(`[data-testid="msg-user"]:has-text("${question.text.substring(0, 30)}")`).isVisible({ timeout: 1000 }).catch(() => false);
    if (!userMessageVisible) {
      result.failureReason = `User message not found in DOM`;
      result.passed = false;
    }

    // Check that there's an assistant response
    if (!result.answer || result.answer.length < 10) {
      result.failureReason = `Assistant message empty or too short`;
      result.passed = false;
    }

  } catch (error) {
    result.failureReason = `Send failed: ${(error as Error).message}`;
    result.passed = false;
    result.totalMs = Date.now() - startTime;
  }

  // Take screenshot on failure
  if (!result.passed && opts.screenshotOnFail) {
    try {
      const screenshotPath = `${opts.resultsDir}/screenshots/${question.id}_failure.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      result.screenshotPath = screenshotPath;
    } catch (e) {
      console.warn(`[SendAssert] Failed to save screenshot: ${(e as Error).message}`);
    }
  }

  return result;
}

/**
 * Send multiple messages in sequence (for follow-up testing)
 */
export async function sendMessageSequence(
  page: Page,
  questions: TestQuestion[],
  options: SendOptions = {}
): Promise<SendResult[]> {
  const results: SendResult[] = [];

  for (const question of questions) {
    const result = await sendMessage(page, question, options);
    results.push(result);

    // If a question fails, still continue but log it
    if (!result.passed) {
      console.warn(`[SendAssert] Question ${question.id} failed: ${result.failureReason}`);
    }

    // Small delay between messages
    await page.waitForTimeout(500);
  }

  return results;
}
