import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./support/auth";
import { ALL_DOC_IDS } from "./support/target-documents";
import { waitForDocumentsIndexed } from "./support/target-documents";

/* ─────────────────────────────────────────────────────────────────────────────
 * Preflight Gate — must pass BEFORE running query-test-100.spec.ts
 *
 * Checks:
 * 1. Backend is reachable (health endpoint or login)
 * 2. Test user can log in
 * 3. All 6 target documents exist, are in ready/indexed status, and have chunks
 * 4. Chat stream endpoint is reachable (auth'd POST returns 200 with SSE)
 * ─────────────────────────────────────────────────────────────────────────── */

const TARGET_CHAT_DOCUMENT = {
  id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438",
  name: "Capítulo_8__Framework_Scrum_.pdf",
  type: "application/pdf",
};

test.describe("Preflight Gate", () => {
  test.setTimeout(60_000);

  test("backend is reachable", async ({ request }) => {
    // Try the health endpoint first, fall back to login page
    let reachable = false;
    try {
      const res = await request.get("/api/health");
      reachable = res.status() < 500;
    } catch {
      // health endpoint may not exist, try login page
    }

    if (!reachable) {
      try {
        const res = await request.get("/a/r9p3q1?mode=login");
        reachable = res.ok();
      } catch {
        // nothing
      }
    }

    expect(reachable, "Backend is not reachable at the configured baseURL").toBe(true);
  });

  test("test user can log in and reach chat", async ({ page }) => {
    await ensureLoggedIn(page);

    // Navigate to chat and verify input is available
    await page.goto("/c/k4r8f5");
    const chatInput = page.locator("textarea.chat-v3-textarea");
    await chatInput.waitFor({ state: "visible", timeout: 15_000 });
  });

  test("all 6 target documents exist and are ready with chunks", async ({
    page,
  }) => {
    await ensureLoggedIn(page);
    await waitForDocumentsIndexed(page, ALL_DOC_IDS, 60_000);
  });

  test("chat stream endpoint accepts authenticated POST", async ({ page }) => {
    await ensureLoggedIn(page);

    // Send a minimal chat request to verify the stream endpoint
    const res = await page.request.post("/api/chat/stream", {
      data: {
        message: "ping",
        attachedDocuments: [TARGET_CHAT_DOCUMENT],
        language: "en",
        client: { wantsStreaming: true },
      },
      headers: {
        Accept: "text/event-stream",
      },
    });

    // We expect 200 (SSE stream) or at least not 401/403/404/500
    console.log(`[PREFLIGHT] Chat stream endpoint responded: HTTP ${res.status()}`);
    expect(
      res.status(),
      `Chat stream endpoint returned ${res.status()} — expected 200`,
    ).toBe(200);
  });
});
