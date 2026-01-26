/**
 * Debug test - sends one message and captures what happens
 */
import { test, expect } from '@playwright/test';

test('Debug chat response', async ({ page }) => {
  // Go to app
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);

  // Dismiss modals
  const skipBtn = page.locator('text=Skip introduction');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }

  // Login if needed
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailInput.fill('test@koda.com');
    await page.locator('input[type="password"]').fill('test123');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
  }

  // Dismiss modals again
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }

  // Wait for chat input
  const chatInput = page.locator('[data-testid="chat-input"]');
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Chat input found');

  // Take screenshot before
  await page.screenshot({ path: 'e2e/test-results/debug-1-before.png', fullPage: true });

  // Send document-focused message (not "Hello" which routes to conversation)
  await chatInput.fill('Summarize the document in 5 bullets.');
  await chatInput.press('Enter');
  console.log('Message sent: document query');

  // Wait for response - check every 2 seconds for 30 seconds
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const msgs = await page.locator('[data-testid="msg-assistant"], .assistant-message').count();
    const streaming = await page.locator('[data-testid="msg-streaming"], .streaming-message').count();
    console.log(`Check ${i+1}: ${msgs} assistant msgs, ${streaming} streaming msgs`);
    if (msgs > 0) break;
  }

  // Take screenshot after
  await page.screenshot({ path: 'e2e/test-results/debug-2-after.png', fullPage: true });

  // Log what we find
  const assistantMsgs = await page.locator('[data-testid="msg-assistant"]').count();
  console.log(`Found ${assistantMsgs} assistant messages`);

  const streamingMsgs = await page.locator('[data-testid="msg-streaming"]').count();
  console.log(`Found ${streamingMsgs} streaming messages`);

  const markdownContainers = await page.locator('.markdown-preview-container').count();
  console.log(`Found ${markdownContainers} markdown containers`);

  // Try to get text from last assistant message
  if (assistantMsgs > 0) {
    const lastMsg = page.locator('[data-testid="msg-assistant"]').last();
    const text = await lastMsg.innerText().catch(() => 'ERROR getting text');
    console.log(`Last assistant message text: ${text.substring(0, 200)}`);
  }

  // Check for any buttons
  const buttons = await page.locator('[data-testid="msg-assistant"] button').count();
  console.log(`Found ${buttons} buttons in assistant messages`);

  expect(assistantMsgs).toBeGreaterThan(0);
});
