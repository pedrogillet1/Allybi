import { Page } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@koda.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

/**
 * Dismiss any visible onboarding overlays (skip intro, done, skip buttons).
 */
export async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const selectors = [
    page.getByRole("button", { name: /Skip introduction/i }),
    page.getByRole("button", { name: /^Skip$/i }),
    page.getByRole("button", { name: /^Done$/i }),
  ];
  for (let i = 0; i < 4; i++) {
    let clicked = false;
    for (const locator of selectors) {
      if (await locator.isVisible({ timeout: 400 }).catch(() => false)) {
        await locator.click().catch(() => undefined);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

/**
 * Suppress all tour/onboarding localStorage flags so overlays don't appear.
 */
export async function suppressTours(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem("koda_onboarding_completed", "true");
      sessionStorage.removeItem("koda_sidebar_tour_active");
      const userRaw = localStorage.getItem("user");
      const user = userRaw ? JSON.parse(userRaw) : null;
      const userId = user && user.id ? String(user.id) : "";
      if (userId) {
        localStorage.setItem(`allybi:hasSeenSidebarLinkedHomeTour:${userId}`, "true");
        localStorage.setItem(`allybi:hasSeenHomeTour:${userId}`, "true");
        localStorage.setItem(`allybi:hasSeenChatTour:${userId}`, "true");
        localStorage.setItem(`allybi:hasSeenUploadTour:${userId}`, "true");
      }
    } catch {
      // best effort
    }
  });
}

/**
 * Log in as test user. Skips login if already authenticated.
 * Uses condition-based waits instead of hardcoded timeouts.
 */
export async function login(page: Page): Promise<void> {
  await page.goto("/a/r9p3q1?mode=login");

  // Wait for either chat input (already logged in) or email input (need to log in)
  const chatInput = page.locator("textarea.chat-v3-textarea");
  const emailInput = page.locator('input[type="email"]');

  const ready = await Promise.race([
    chatInput.waitFor({ state: "visible", timeout: 10_000 }).then(() => "chat" as const),
    emailInput.waitFor({ state: "visible", timeout: 10_000 }).then(() => "login" as const),
  ]).catch(() => "login" as const);

  if (ready === "chat") {
    await suppressTours(page);
    return;
  }

  await emailInput.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/a/"), { timeout: 30_000 });
  } catch {
    throw new Error(`Login did not redirect. Current URL: ${page.url()}`);
  }

  // Wait for chat input to confirm we're fully loaded
  await chatInput.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await suppressTours(page);
}

/**
 * Ensure login + dismiss onboarding (alias used by preflight tests).
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  await login(page);
  await dismissOnboardingIfPresent(page);
}
