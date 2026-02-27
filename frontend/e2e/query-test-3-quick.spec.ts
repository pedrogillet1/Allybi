import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@koda.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

const TARGET_DOCUMENTS = [
  { id: "7d55ead0-4840-4537-94ee-913e2feb5bce", name: "Anotações_Aula_2__1_.pdf", type: "application/pdf" },
  { id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438", name: "Capítulo_8__Framework_Scrum_.pdf", type: "application/pdf" },
  { id: "ee91764d-304d-4162-8c0b-826662ee70a3", name: "Trabalho_projeto_.pdf", type: "application/pdf" },
  { id: "5471856b-b93f-4aae-b450-35b121cad140", name: "OBA_marketing_servicos__1_.pdf", type: "application/pdf" },
  { id: "5708e5f5-42d4-45e7-803b-ae490c45a766", name: "TRABALHO_FINAL__1_.PNG", type: "image/png" },
  { id: "ce276bc4-bed3-41c2-b965-05ceb9ea0913", name: "guarda_bens_self_storage.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
];

const QUERIES = [
  "No documento Capítulo 8 (Framework Scrum).pdf, qual é a definição de Scrum?",
  "Em Anotações Aula 2 (1).pdf, qual o tema principal?",
  "Em Trabalho projeto .pdf, qual é o objetivo do projeto?",
];

const REPORT_DIR = path.resolve(__dirname, "reports");
const MAX_WAIT = 120_000;

async function login(page: Page) {
  await page.goto("/a/r9p3q1?mode=login");
  await page.waitForTimeout(2000);
  const chatInput = page.locator("textarea.chat-v3-textarea");
  if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) return;
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/a/"), { timeout: 30_000 });
  } catch {
    throw new Error(`Login failed. URL: ${page.url()}`);
  }
  await page.waitForTimeout(3000);
}

async function navigateToNewChat(page: Page) {
  await page.goto("/c/k4r8f5");
  const chatInput = page.locator("textarea.chat-v3-textarea");
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(1000);
}

async function setupDocInjector(page: Page) {
  await page.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    try {
      const raw = request.postData();
      if (!raw) { await route.continue(); return; }
      const postData = JSON.parse(raw);
      if (!postData.attachedDocuments?.length) {
        postData.attachedDocuments = TARGET_DOCUMENTS;
      }
      await route.continue({ postData: JSON.stringify(postData) });
    } catch {
      await route.continue();
    }
  });
}

test.describe("Quick 3-Query Test", () => {
  test.setTimeout(0);

  test("3 explicit queries — basic retrieval check", async ({ page }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    await setupDocInjector(page);

    // Monitor stream responses
    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/api/chat/stream")) return;
      console.log(`[QUICK] Stream response: HTTP ${response.status()}`);
      if (!response.ok()) {
        try { console.log(`[QUICK] Error body: ${await response.text()}`); } catch {}
      }
    });

    console.log("[QUICK] Logging in...");
    await login(page);

    console.log("[QUICK] Opening chat...");
    await navigateToNewChat(page);
    await page.waitForTimeout(2000);

    for (let i = 0; i < QUERIES.length; i++) {
      const q = QUERIES[i];
      console.log(`\n[QUICK] === Query ${i + 1}/3 ===`);
      console.log(`[QUICK] Q: ${q}`);

      const assistantMsgs = page.locator('[data-testid="msg-assistant"]');
      const beforeCount = await assistantMsgs.count();
      const chatInput = page.locator("textarea.chat-v3-textarea");
      await chatInput.waitFor({ state: "visible", timeout: 10_000 });
      await chatInput.fill(q);
      await page.waitForTimeout(300);
      await chatInput.press("Enter");

      try {
        await expect(assistantMsgs).toHaveCount(beforeCount + 1, { timeout: 30_000 });
        const lastMsg = assistantMsgs.nth(beforeCount);
        await page.locator('button[aria-label="Send"]').waitFor({ state: "visible", timeout: MAX_WAIT });
        await page.waitForTimeout(2000);

        const text = await lastMsg.evaluate((el) => el.innerText);
        console.log(`[QUICK] Response (${text.length} chars): ${text.substring(0, 200)}...`);

        const isWarning = text.includes("Warning:") || text.includes("EVIDENCE_INSUFFICIENT");
        if (isWarning) console.log("[QUICK] >>> GOT WARNING/INSUFFICIENT");
        else console.log("[QUICK] >>> OK - Got real response");
      } catch (err: any) {
        console.log(`[QUICK] ERROR: ${err.message}`);
      }

      await page.waitForTimeout(1000);
    }

    console.log("\n[QUICK] Done.");
  });
});
