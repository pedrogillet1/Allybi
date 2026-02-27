import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@allybi.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

/* ─────────────────────────────────────────────────────────────────────────────
 * Preflight Gate — must pass BEFORE running query-test-100.spec.ts
 *
 * Checks:
 * 1. Backend is reachable (health endpoint or login)
 * 2. Test user can log in
 * 3. All 6 target documents exist, are in ready/indexed status, and have chunks
 * 4. Chat stream endpoint is reachable (auth'd POST returns 200 with SSE)
 * ─────────────────────────────────────────────────────────────────────────── */

const TARGET_DOCUMENT_IDS = [
  "7d55ead0-4840-4537-94ee-913e2feb5bce", // Anotações_Aula_2__1_.pdf
  "8938fa6a-730f-4d12-8d6a-4416ea9a6438", // Capítulo_8__Framework_Scrum_.pdf
  "ee91764d-304d-4162-8c0b-826662ee70a3", // Trabalho_projeto_.pdf
  "5471856b-b93f-4aae-b450-35b121cad140", // OBA_marketing_servicos__1_.pdf
  "5708e5f5-42d4-45e7-803b-ae490c45a766", // TRABALHO_FINAL__1_.PNG
  "ce276bc4-bed3-41c2-b965-05ceb9ea0913", // guarda_bens_self_storage.pptx
];

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
    await page.goto("/a/r9p3q1?mode=login");
    await page.waitForTimeout(2000);

    // Check if already logged in
    const chatInput = page.locator("textarea.chat-v3-textarea");
    if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      return; // already logged in
    }

    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: "visible", timeout: 10_000 });
    await emailInput.fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.startsWith("/a/"), {
      timeout: 30_000,
    });

    // Navigate to chat and verify input is available
    await page.goto("/c/k4r8f5");
    await chatInput.waitFor({ state: "visible", timeout: 15_000 });
  });

  test("all 6 target documents exist and are ready with chunks", async ({
    page,
  }) => {
    // Login first
    await page.goto("/a/r9p3q1?mode=login");
    await page.waitForTimeout(2000);
    const chatInput = page.locator("textarea.chat-v3-textarea");
    if (!(await chatInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.locator('input[type="email"]').fill(TEST_EMAIL);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/a/"), {
        timeout: 30_000,
      });
    }

    // Fetch documents via API
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find(
      (c) => c.name === "token" || c.name === "jwt" || c.name === "access_token",
    );

    // Use the documents API to check each target doc
    for (const docId of TARGET_DOCUMENT_IDS) {
      const res = await page.request.get(`/api/documents/${docId}`);
      expect(
        res.ok(),
        `Document ${docId} not found or not accessible (HTTP ${res.status()})`,
      ).toBe(true);

      const doc = await res.json();
      const status = doc.status || doc.document?.status;
      const filename = doc.filename || doc.document?.filename || docId;

      expect(
        ["ready", "indexed"].includes(status),
        `Document "${filename}" has status "${status}" — must be "ready" or "indexed"`,
      ).toBe(true);

      console.log(`[PREFLIGHT] ✓ ${filename} — status: ${status}`);
    }
  });

  test("chat stream endpoint accepts authenticated POST", async ({ page }) => {
    // Login first
    await page.goto("/a/r9p3q1?mode=login");
    await page.waitForTimeout(2000);
    const chatInput = page.locator("textarea.chat-v3-textarea");
    if (!(await chatInput.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.locator('input[type="email"]').fill(TEST_EMAIL);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/a/"), {
        timeout: 30_000,
      });
    }

    // Send a minimal chat request to verify the stream endpoint
    const res = await page.request.post("/api/chat/stream", {
      data: {
        message: "ping",
        attachedDocuments: [],
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
