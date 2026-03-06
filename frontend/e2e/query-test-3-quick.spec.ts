import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { login } from "./support/auth";
import { navigateToNewChat, waitForStreamComplete } from "./support/chat-helpers";
import { TARGET_DOCUMENTS } from "./support/target-documents";

const QUERIES = [
  "No documento Capítulo 8 (Framework Scrum).pdf, qual é a definição de Scrum?",
  "Em Anotações Aula 2 (1).pdf, qual o tema principal?",
  "Em Trabalho projeto .pdf, qual é o objetivo do projeto?",
];

const REPORT_DIR = path.resolve(__dirname, "reports");
const MAX_WAIT = 120_000;

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

    for (let i = 0; i < QUERIES.length; i++) {
      const q = QUERIES[i];
      console.log(`\n[QUICK] === Query ${i + 1}/3 ===`);
      console.log(`[QUICK] Q: ${q}`);

      const assistantMsgs = page.locator('[data-testid="msg-assistant"]');
      const beforeCount = await assistantMsgs.count();
      const chatInput = page.locator("textarea.chat-v3-textarea");
      await chatInput.waitFor({ state: "visible", timeout: 10_000 });
      await chatInput.fill(q);
      await chatInput.press("Enter");

      try {
        await expect(assistantMsgs).toHaveCount(beforeCount + 1, { timeout: 30_000 });
        const lastMsg = assistantMsgs.nth(beforeCount);
        await waitForStreamComplete(page, MAX_WAIT);

        const text = await lastMsg.evaluate((el) => el.innerText);
        console.log(`[QUICK] Response (${text.length} chars): ${text.substring(0, 200)}...`);

        const isWarning = text.includes("Warning:") || text.includes("EVIDENCE_INSUFFICIENT");
        if (isWarning) console.log("[QUICK] >>> GOT WARNING/INSUFFICIENT");
        else console.log("[QUICK] >>> OK - Got real response");
      } catch (err: any) {
        console.log(`[QUICK] ERROR: ${err.message}`);
      }

    }

    console.log("\n[QUICK] Done.");
  });
});
