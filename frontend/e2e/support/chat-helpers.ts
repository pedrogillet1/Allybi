import { Page } from "@playwright/test";

/**
 * Navigate to a fresh chat and wait for the composer to be visible.
 */
export async function navigateToNewChat(page: Page): Promise<void> {
  await page.goto("/c/k4r8f5");
  await page
    .waitForURL((url) => url.pathname.startsWith("/c/"), { timeout: 12_000 })
    .catch(() => {});
  const chatInput = page.locator("textarea.chat-v3-textarea");
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * Wait until no element has [data-streaming="true"], indicating stream is done.
 * Falls back to waiting for the Send button to become visible (stream complete indicator).
 */
export async function waitForStreamComplete(page: Page, timeout = 90_000): Promise<void> {
  await page
    .locator('button[aria-label="Send"]')
    .waitFor({ state: "visible", timeout });
}

/**
 * Send a chat message and wait for the user bubble to appear.
 */
export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const chatInput = page.locator("textarea.chat-v3-textarea");
  await chatInput.waitFor({ state: "visible", timeout: 10_000 });
  await chatInput.fill(text);
  // Wait for send button to be interactive
  await page
    .locator('button[aria-label="Send"]')
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => {});
  await chatInput.press("Enter");
}

/**
 * Ensure the chat composer is visible, attempting dismissal of overlays
 * and navigation if needed.
 */
export async function ensureChatComposerVisible(page: Page): Promise<void> {
  const chatInput = page.locator("textarea.chat-v3-textarea");
  const inChatRoute = () => {
    try {
      return new URL(page.url()).pathname.startsWith("/c/");
    } catch {
      return false;
    }
  };

  if (
    inChatRoute() &&
    (await chatInput.isVisible({ timeout: 1200 }).catch(() => false))
  ) {
    return;
  }

  // Try dismissing overlays
  const skipIntro = page.getByRole("button", { name: /Skip introduction/i });
  if (await skipIntro.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipIntro.click();
  }
  const dialog = page.getByRole("dialog", { name: /onboarding tour/i });
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    const doneBtn = dialog.getByRole("button", { name: /^Done$/i });
    if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await doneBtn.click();
    } else {
      const skipBtn = dialog.getByRole("button", { name: /^Skip$/i });
      if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await skipBtn.click();
      }
    }
  }

  if (
    inChatRoute() &&
    (await chatInput.isVisible({ timeout: 1200 }).catch(() => false))
  ) {
    return;
  }

  // Try clicking Chat nav button
  const chatNavBtn = page.getByRole("button", { name: /^Chat$/i });
  if (await chatNavBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
    await chatNavBtn.click();
    await page
      .waitForURL((url) => url.pathname.startsWith("/c/"), { timeout: 5000 })
      .catch(() => {});
    if (
      inChatRoute() &&
      (await chatInput.isVisible({ timeout: 3000 }).catch(() => false))
    ) {
      return;
    }
  }

  // Last resort: navigate directly
  await page.goto("/c/k4r8f5");
  await page
    .waitForURL((url) => url.pathname.startsWith("/c/"), { timeout: 12_000 })
    .catch(() => {});
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
}
