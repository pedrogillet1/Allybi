/**
 * Debug Test - Single question to diagnose issues
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.e2e' });

const EMAIL = process.env.E2E_EMAIL || 'test@koda.com';
const PASSWORD = process.env.E2E_PASSWORD || 'test123';

test('debug: single message flow', async ({ page }) => {
  // Set longer timeout for debugging
  test.setTimeout(120000);

  // Capture browser console logs - capture ALL for debugging
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    // Only filter out noisy messages
    if (!text.includes('React') && !text.includes('DevTools') && !text.includes('strict mode')) {
      console.log(`[BROWSER ${type.toUpperCase()}]`, text);
    }
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  console.log('=== DEBUG TEST START ===');

  // Step 1: Navigate to app
  console.log('[1] Navigating to app...');
  await page.goto('/');
  await page.screenshot({ path: 'e2e/debug/01_initial_page.png' });
  console.log('[1] Current URL:', page.url());

  // Step 2: Check if we need to login
  const loginButton = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), input[type="email"]');
  const isLoginPage = await loginButton.first().isVisible({ timeout: 3000 }).catch(() => false);
  console.log('[2] Is login page:', isLoginPage);

  if (isLoginPage) {
    console.log('[2] Logging in...');

    // Find and fill email
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.fill(EMAIL);
    console.log('[2] Filled email');

    // Find and fill password
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.fill(PASSWORD);
    console.log('[2] Filled password');
    await page.screenshot({ path: 'e2e/debug/02_login_filled.png' });

    // Click login button
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first();
    await submitButton.click();
    console.log('[2] Clicked login button');

    // Wait for navigation/redirect
    await page.waitForURL(/.*\//, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/debug/03_after_login.png' });
    console.log('[2] After login URL:', page.url());
  }

  // Step 3: Check for chat interface
  console.log('[3] Looking for chat interface...');
  const chatInput = page.locator('[data-testid="chat-input"]');
  const inputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('[3] Chat input visible:', inputVisible);

  if (!inputVisible) {
    // Maybe we need to click "new chat" first
    console.log('[3] Chat input not visible, looking for new chat button...');
    const newChatBtn = page.locator('[data-testid="new-chat"]');
    const newChatVisible = await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('[3] New chat button visible:', newChatVisible);

    if (newChatVisible) {
      await newChatBtn.click();
      console.log('[3] Clicked new chat button');
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'e2e/debug/04_looking_for_chat.png' });
  }

  // Step 4: Get initial message counts
  const userMsgCount = await page.locator('[data-testid="msg-user"]').count();
  const assistantMsgCount = await page.locator('[data-testid="msg-assistant"]').count();
  console.log('[4] Initial counts - User:', userMsgCount, 'Assistant:', assistantMsgCount);

  // Step 5: Type a message
  console.log('[5] Typing message...');
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  await chatInput.fill('What files do I have?');
  await page.screenshot({ path: 'e2e/debug/05_message_typed.png' });
  console.log('[5] Message typed');

  // Check send button state
  const sendButton = page.locator('[data-testid="chat-send"]');
  const sendVisible = await sendButton.isVisible();
  const sendDisabled = await sendButton.isDisabled();
  console.log('[5] Send button - visible:', sendVisible, 'disabled:', sendDisabled);

  // Set up network listeners BEFORE sending
  const requests: string[] = [];
  page.on('request', req => {
    if (req.url().includes('rag') || req.url().includes('chat') || req.url().includes('api')) {
      console.log('[NETWORK REQUEST]', req.method(), req.url());
      requests.push(req.url());
    }
  });
  page.on('response', res => {
    if (res.url().includes('rag') || res.url().includes('chat') || res.url().includes('api')) {
      console.log('[NETWORK RESPONSE]', res.status(), res.url());
    }
  });

  // Step 6: Press Enter to send (click is blocked by overlay div)
  console.log('[6] Pressing Enter to send...');
  const sendTime = Date.now();
  await chatInput.press('Enter');
  console.log('[6] Enter pressed at:', sendTime);
  await page.screenshot({ path: 'e2e/debug/06_after_send.png' });

  // Step 7: Wait for response
  console.log('[7] Waiting for response...');

  // Check for streaming indicator
  const streamingVisible = await page.locator('[data-testid="msg-streaming"]').isVisible({ timeout: 1000 }).catch(() => false);
  console.log('[7] Streaming indicator visible:', streamingVisible);

  // Check for stop button (indicates loading)
  const stopVisible = await page.locator('[data-testid="chat-stop"]').isVisible({ timeout: 1000 }).catch(() => false);
  console.log('[7] Stop button visible:', stopVisible);

  // Wait a moment for request to start
  await page.waitForTimeout(1000);

  // Check loading state again
  const stopVisibleAfterDelay = await page.locator('[data-testid="chat-stop"]').isVisible({ timeout: 1000 }).catch(() => false);
  console.log('[7] Stop button visible after delay:', stopVisibleAfterDelay);

  // Wait for new assistant message (up to 60s)
  console.log('[7] Waiting for assistant message...');
  try {
    await page.locator('[data-testid="msg-assistant"]').nth(assistantMsgCount).waitFor({
      state: 'visible',
      timeout: 60000
    });
    const ttft = Date.now() - sendTime;
    console.log('[7] First response visible after:', ttft, 'ms');
  } catch (e) {
    console.log('[7] Timeout waiting for response');
    console.log('[7] Network requests made:', requests);
    await page.screenshot({ path: 'e2e/debug/07_timeout.png' });
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/debug/08_final.png' });

  // Step 8: Final counts
  const finalUserCount = await page.locator('[data-testid="msg-user"]').count();
  const finalAssistantCount = await page.locator('[data-testid="msg-assistant"]').count();
  console.log('[8] Final counts - User:', finalUserCount, 'Assistant:', finalAssistantCount);

  // Get response content if any
  if (finalAssistantCount > assistantMsgCount) {
    const lastMsg = await page.locator('[data-testid="msg-assistant"]').last().textContent();
    console.log('[8] Last assistant message (first 200 chars):', lastMsg?.substring(0, 200));
  }

  console.log('=== DEBUG TEST END ===');
});
