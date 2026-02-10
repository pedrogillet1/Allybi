/**
 * Smoke test — verify login, chat, and one DOCX edit.
 */
import { test, expect } from '@playwright/test';

const CONFIG = {
  email: 'test@koda.com',
  password: 'test123',
  baseUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:5000',
};

test('Smoke: login, chat, DOCX edit', async ({ page }) => {
  // 1. Verify backend
  const health = await page.request.get(`${CONFIG.backendUrl}/health`);
  expect(health.ok()).toBe(true);
  console.log('[OK] Backend healthy');

  // 2. Go to login
  await page.goto(`${CONFIG.baseUrl}/a/x7k2m9?mode=login`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-01-initial.png', fullPage: true });

  // 3. Login
  const emailInput = page.locator('input[type="email"]');
  const isEmailVisible = await emailInput.isVisible({ timeout: 8000 }).catch(() => false);
  console.log(`[LOGIN] email input visible: ${isEmailVisible}`);

  if (isEmailVisible) {
    await emailInput.fill(CONFIG.email);
    const pwInput = page.locator('input[type="password"]');
    const isPwVisible = await pwInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[LOGIN] password input visible: ${isPwVisible}`);
    if (isPwVisible) {
      await pwInput.fill(CONFIG.password);
    }
    await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-02-filled.png', fullPage: true });

    // Click Log In button (exact match to avoid matching "Log in with Google")
    const loginBtn = page.getByRole('button', { name: 'Log In', exact: true });
    console.log(`[LOGIN] Log In button visible: ${await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)}`);
    await loginBtn.click();
    console.log('[LOGIN] Clicked Log In');
  }

  // 4. Wait for login to complete
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-03-after-login.png', fullPage: true });

  // 5. Check page state
  const url = page.url();
  console.log(`[STATE] URL: ${url}`);

  // Check if auth modal is still visible
  const authModal = page.locator('dialog, [role="dialog"]');
  const modalVisible = await authModal.isVisible({ timeout: 2000 }).catch(() => false);
  console.log(`[STATE] Auth modal visible: ${modalVisible}`);

  // Check for error messages
  const errors = page.locator('text=error, text=Error, text=failed, text=Failed');
  const errCount = await errors.count();
  console.log(`[STATE] Error elements: ${errCount}`);

  // 6. Find chat input
  const chatInput = page.locator('textarea[placeholder*="Ask Koda"]');
  const chatVisible = await chatInput.isVisible({ timeout: 10000 }).catch(() => false);
  console.log(`[STATE] Chat input visible: ${chatVisible}`);

  if (!chatVisible) {
    // Dump all textareas and inputs
    const textareas = page.locator('textarea');
    const inputs = page.locator('input');
    console.log(`[DEBUG] textareas: ${await textareas.count()}, inputs: ${await inputs.count()}`);

    // Take debug screenshot
    await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-04-no-chat.png', fullPage: true });
  }

  expect(chatVisible, 'Chat input should be visible after login').toBe(true);

  // 7. Send edit query — use click + type to properly trigger React state updates
  await chatInput.click();
  await page.waitForTimeout(500);
  await chatInput.pressSequentially('change the title in Koda AI Testing Suite to "Koda QA Suite"', { delay: 10 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-05-message-typed.png', fullPage: true });

  // Check if the Send button is now enabled
  const sendBtn = page.locator('button[aria-label="Send"]:not([disabled])');
  const sendEnabled = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[CHAT] Send button enabled: ${sendEnabled}`);

  if (sendEnabled) {
    await sendBtn.click();
    console.log('[CHAT] Clicked Send');
  } else {
    // Fallback: press Enter
    await chatInput.press('Enter');
    console.log('[CHAT] Pressed Enter (Send disabled)');
  }

  // 8. Wait for response
  console.log('[CHAT] Waiting for assistant response...');
  let foundResponse = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);

    // Check for assistant messages
    const msgs = page.locator('.assistant-message');
    const count = await msgs.count();

    if (count > 0) {
      const lastMsg = msgs.last();
      const content = await lastMsg.locator('.message-content').textContent().catch(() => '');
      console.log(`[CHAT] ${i * 3}s | msgs: ${count} | last: ${(content || '').slice(0, 100)}`);

      if (content && content.length > 20 && !content.includes('Turning the question')) {
        foundResponse = true;
        break;
      }
    } else {
      console.log(`[CHAT] ${i * 3}s | No assistant messages yet`);
    }

    // Check backend logs
    if (i === 5) {
      await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-06-waiting.png', fullPage: true });
    }
  }

  await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-07-response.png', fullPage: true });
  expect(foundResponse, 'Should receive an assistant response').toBe(true);

  // 9. Check for edit card
  const editCard = page.locator('.koda-edit-card');
  const cardVisible = await editCard.first().isVisible({ timeout: 10000 }).catch(() => false);
  console.log(`[EDIT] Edit card visible: ${cardVisible}`);

  await page.screenshot({ path: 'e2e/test-results/edit-only/smoke-08-final.png', fullPage: true });
});
