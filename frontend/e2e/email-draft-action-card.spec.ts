/**
 * Email Draft Action Card E2E
 *
 * Validates the interactive EMAIL_SEND confirmation UI:
 * - Draft renders as a collapsed email-style card (not raw markdown)
 * - Open to edit To/Subject/Body (in a modal)
 * - Add attachments via picker
 * - Send mints a new confirmation token and executes confirmation flow
 *
 * Uses the shared test credentials by default:
 *   E2E_EMAIL=test@koda.com
 *   E2E_PASSWORD=test123
 */

import { test, expect } from "@playwright/test";
import { login } from "./utils/auth";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

function sse(events: any[]) {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

test.describe("Email Draft Action Card", () => {
  test.describe.configure({ mode: "serial" });

  test("draft -> expand -> add files -> send", async ({ page }) => {
    const mockDoc = {
      id: "doc_1",
      filename: "Capítulo_8__Framework__Scrum_.pdf",
      mimeType: "application/pdf",
      fileSize: 123456,
      createdAt: new Date().toISOString(),
      folderId: null,
    };

    // Mock the batch initial-data endpoint (primary fetch used by DocumentsContext).
    await page.route("**/api/batch/initial-data**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            documents: [mockDoc],
            folders: [],
            recentDocuments: [mockDoc],
          },
        }),
      });
    });

    // Fallback: individual documents endpoint.
    await page.route("**/api/documents?limit=10000**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documents: [mockDoc] }),
      });
    });

    // Fallback: recent documents endpoint.
    await page.route("**/api/documents?limit=5**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ documents: [mockDoc] }),
      });
    });

    // Folders fetch can happen on boot; keep it light.
    await page.route("**/api/folders**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ folders: [] }),
      });
    });

    // Mock token mint endpoint for edited drafts.
    await page.route("**/api/integrations/email/send-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { operator: "EMAIL_SEND", confirmationId: "newtok.test.sig" },
        }),
      });
    });

    // Mock chat stream:
    //  - first call returns action_confirmation (EMAIL_SEND) with a draft email markdown
    //  - second call (with confirmationToken) returns a receipt (Sent.)
    await page.route("**/api/chat/stream", async (route) => {
      const req = route.request();
      const payload = (() => {
        try { return JSON.parse(req.postData() || "{}"); } catch { return {}; }
      })();

      const isConfirm = Boolean(payload?.confirmationToken);

      if (!isConfirm) {
        const draftMarkdown = [
          `**Draft Email** (via Gmail)`,
          ``,
          `**To:** pedrogillet@icloud.com`,
          `**Subject:** Koda File Test`,
          ``,
          `**Attachments:**`,
          `- Capítulo_8__Framework__Scrum_.pdf`,
          ``,
          `> Here is the Scrum chapter document`,
          ``,
          `_Click **Send** below or reply **"send it"** to deliver this email._`,
        ].join("\n");

        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([
            { type: "meta", answerMode: "action_confirmation", answerClass: "NAVIGATION" },
            { type: "delta", text: draftMarkdown },
            {
              type: "final",
              message: {
                messageId: "assist_1",
                answerMode: "action_confirmation",
                answerClass: "NAVIGATION",
                sources: [],
                attachments: [
                  {
                    type: "action_confirmation",
                    operator: "EMAIL_SEND",
                    confirmationId: "orig.tok.sig",
                    confirmLabel: "Send",
                    cancelLabel: "Cancel",
                    confirmStyle: "primary",
                    summary: "Send email via Gmail",
                  },
                ],
              },
            },
          ]),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          { type: "delta", text: "Sent." },
          { type: "final", content: "Sent.", sources: [] },
        ]),
      });
    });

    await page.goto(`${BASE_URL}/a/x7k2m9?mode=login`, { waitUntil: "networkidle" });
    // Skip onboarding popup before login so it doesn't block verification.
    await page.evaluate(() => localStorage.setItem("koda_onboarding_completed", "true"));
    await login(page, { baseUrl: BASE_URL });

    await page.goto(`${BASE_URL}/c/k4r8f5`, { waitUntil: "networkidle" }).catch(() => {});

    // Send message to trigger mocked draft response.
    const input = page.locator('[data-chat-input], textarea[placeholder*="Ask Allybi"], textarea[placeholder*="Ask Koda"], [data-testid="chat-input"]').first();
    await input.waitFor({ state: "visible", timeout: 30000 });
    await input.fill("send an email to pedrogillet@icloud.com with subject Koda File Test and body Here is the Scrum chapter document");
    await input.press("Enter");

    // Card renders (collapsed by default).
    const card = page.getByRole("button", { name: /open email: koda file test/i });
    await expect(card).toBeVisible({ timeout: 30000 });

    // Should show subject + recipient in the card.
    await expect(card).toContainText("Koda File Test");
    await expect(card).toContainText("pedrogillet@icloud.com");

    // Open modal
    await card.click();
    await expect(page.locator('input[placeholder*="name@"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Subject"]')).toBeVisible();
    await expect(page.locator('text=Attachments')).toBeVisible();

    // Open picker and add a file.
    await page.locator('button:has-text("Add files")').click();
    await expect(page.locator('text=Home').first()).toBeVisible();
    // Click the PDF file row (force to avoid MIME type label overlap)
    await page.locator(`text=Capítulo_8__Framework__Scrum_.pdf`).last().click({ force: true });
    await page.locator('button:has-text("Add selected")').click();

    // Attachment should appear in the list.
    await expect(page.locator(`text=Capítulo_8__Framework__Scrum_.pdf`).first()).toBeVisible();

    // Send without editing body (uses original confirmation token, no mint needed)
    await page.locator('button:has-text("Send")').click();

    // Confirmation flow mocked to "Sent."
    await expect(page.locator('text=Sent.').first()).toBeVisible({ timeout: 30000 });
  });
});
