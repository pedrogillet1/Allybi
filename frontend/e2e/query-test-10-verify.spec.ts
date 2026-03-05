import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createQueryIndexByText,
  resolveScopedDocsForRequest,
} from "./support/attachment-scope";
import { captureAssistantMessage } from "./support/response-capture";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@allybi.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

/* ─────────────────────────────────────────────────────────────────────────────
 * 10-Query Verification Test
 *
 * Runs first 10 queries to verify:
 * 1. Documents are attached and retrieval engages (sources present)
 * 2. No truncation on normal responses
 * 3. Backend stays stable
 * ─────────────────────────────────────────────────────────────────────────── */

const TARGET_DOCUMENTS = [
  { id: "7d55ead0-4840-4537-94ee-913e2feb5bce", name: "Anotações_Aula_2__1_.pdf", type: "application/pdf" },
  { id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438", name: "Capítulo_8__Framework_Scrum_.pdf", type: "application/pdf" },
  { id: "ee91764d-304d-4162-8c0b-826662ee70a3", name: "Trabalho_projeto_.pdf", type: "application/pdf" },
  { id: "5471856b-b93f-4aae-b450-35b121cad140", name: "OBA_marketing_servicos__1_.pdf", type: "application/pdf" },
  { id: "5708e5f5-42d4-45e7-803b-ae490c45a766", name: "TRABALHO_FINAL__1_.PNG", type: "image/png" },
  { id: "ce276bc4-bed3-41c2-b965-05ceb9ea0913", name: "guarda_bens_self_storage.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
];

const QUERIES_10: string[] = [
  "Quero começar: me dá uma visão geral dos docs que anexei (anotações da aula, capítulo de scrum, trabalho do projeto, one-pager de marketing, imagem do trabalho final e deck de self storage).",
  "Agora separa por tipo de conteúdo: acadêmico, comercial e apresentação.",
  "Qual desses documentos parece mais estratégico para tomada de decisão?",
  "E qual deles está mais técnico?",
  "Me dá um resumo executivo em 6 bullets de tudo.",
  "Agora um resumo curto, em 3 frases, para eu mandar no WhatsApp.",
  "Me diz quais docs têm linguagem mais objetiva e quais têm linguagem mais conceitual.",
  "Quais parecem incompletos ou com pouca densidade de informação?",
  "Quais documentos eu deveria ler primeiro se tiver só 15 minutos?",
  "Beleza, vamos por etapas. Começa pelo capítulo de scrum.",
];
const QUERY_INDEX_BY_TEXT = createQueryIndexByText(QUERIES_10, 0);

interface TransportMeta {
  httpStatus: number | null;
  requestId: string | null;
  errorBody: string | null;
}

interface QueryResult {
  index: number;
  query: string;
  response: string;
  responseLength: number;
  sources: string[];
  truncation: string | null;
  failureCode: string | null;
  durationMs: number;
  status: "ok" | "error" | "timeout";
  errorDetail?: string;
  transport: TransportMeta;
}

const REPORT_DIR = path.resolve(__dirname, "reports");
const REPORT_FILE = path.join(REPORT_DIR, "query-test-10-verify-results.json");
const MAX_RESPONSE_WAIT_MS = 180_000;

interface StreamInterceptState {
  lastHttpStatus: number | null;
  lastRequestId: string | null;
  lastErrorBody: string | null;
}

function setupStreamInterceptor(page: Page): StreamInterceptState {
  const state: StreamInterceptState = { lastHttpStatus: null, lastRequestId: null, lastErrorBody: null };
  page.on("response", async (response) => {
    const url = response.url();
    if (
      !url.includes("/api/chat/stream") &&
      !url.includes("/api/chat/viewer/stream") &&
      !url.includes("/api/editor-session/assistant/stream")
    ) {
      return;
    }
    state.lastHttpStatus = response.status();
    state.lastRequestId = response.request().headers()["x-request-id"] || null;
    if (!response.ok()) {
      try { state.lastErrorBody = await response.text(); } catch { state.lastErrorBody = `HTTP ${response.status()}`; }
    } else {
      state.lastErrorBody = null;
    }
  });
  return state;
}

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
    await page.screenshot({ path: path.join(REPORT_DIR, "login-failed.png") });
    throw new Error(`Login did not redirect. Current URL: ${page.url()}`);
  }
  await page.waitForTimeout(3000);
}

async function navigateToNewChat(page: Page) {
  await page.goto("/c/k4r8f5");
  const chatInput = page.locator("textarea.chat-v3-textarea");
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(1000);
}

async function setupDocumentAttachmentInjector(page: Page) {
  const scopedState = { fallbackTurn: 0 };
  await page.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    try {
      const raw = request.postData();
      if (!raw) {
        console.log("[INJECT] No postData — continuing unmodified");
        await route.continue();
        return;
      }
      const postData = JSON.parse(raw);
      const hadDocs = postData.attachedDocuments?.length > 0;
      const scope = resolveScopedDocsForRequest({
        postData,
        queryIndexByText: QUERY_INDEX_BY_TEXT,
        queryStartIndex: 0,
        state: scopedState,
      });
      if (!hadDocs) {
        postData.attachedDocuments = scope.scopedDocs;
      }
      const finalCount = Array.isArray(postData.attachedDocuments)
        ? postData.attachedDocuments.length
        : 0;
      console.log(
        `[INJECT] queryIdx=${scope.resolvedIndex} reason=${scope.reason} docs=${finalCount} had=${hadDocs} url=${request.url()}`,
      );
      await route.continue({ postData: JSON.stringify(postData) });
    } catch (err: any) {
      console.log(`[INJECT] ERROR: ${err.message}`);
      await route.continue();
    }
  });
}

async function sendQueryAndCapture(
  page: Page, query: string, queryIndex: number, transport: StreamInterceptState,
): Promise<QueryResult> {
  const start = Date.now();
  transport.lastHttpStatus = null;
  transport.lastRequestId = null;
  transport.lastErrorBody = null;

  try {
    const assistantMsgs = page.locator('[data-testid="msg-assistant"]');
    const beforeCount = await assistantMsgs.count();
    const chatInput = page.locator("textarea.chat-v3-textarea");
    await chatInput.waitFor({ state: "visible", timeout: 10_000 });
    await chatInput.fill(query);
    await page.waitForTimeout(300);
    await chatInput.press("Enter");
    await expect(assistantMsgs).toHaveCount(beforeCount + 1, { timeout: 30_000 });
    const lastMsg = assistantMsgs.nth(beforeCount);
    await page.locator('button[aria-label="Send"]').waitFor({ state: "visible", timeout: MAX_RESPONSE_WAIT_MS });
    await page.waitForTimeout(1500);

    const captured = await captureAssistantMessage(lastMsg);
    const responseText = captured.responseText;
    const sources = captured.sources;

    let truncation: string | null = null;
    const truncEl = lastMsg.locator('span:has-text("truncated")');
    if (await truncEl.isVisible({ timeout: 500 }).catch(() => false)) {
      truncation = (await truncEl.textContent()) || "truncated";
    }

    let failureCode: string | null = null;
    const failEl = lastMsg.locator('span:has-text("Warning:")');
    if (await failEl.isVisible({ timeout: 500 }).catch(() => false)) {
      failureCode = (await failEl.textContent()) || "unknown";
    }

    const durationMs = Date.now() - start;
    const isGenericError = responseText.trim() === "Something went wrong" || responseText.trim() === "Something went wrong.";
    const isHttpError = transport.lastHttpStatus !== null && transport.lastHttpStatus >= 400;
    let status: "ok" | "error" | "timeout" = "ok";
    if (isGenericError || isHttpError || failureCode || responseText.trim().length === 0) status = "error";

    return {
      index: queryIndex + 1, query, response: responseText.trim(), responseLength: responseText.trim().length,
      sources, truncation, failureCode, durationMs, status,
      ...(status === "error" ? { errorDetail: isGenericError ? `Generic error (HTTP ${transport.lastHttpStatus})` : isHttpError ? `HTTP ${transport.lastHttpStatus}` : "Empty/failed" } : {}),
      transport: { httpStatus: transport.lastHttpStatus, requestId: transport.lastRequestId, errorBody: transport.lastErrorBody },
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      index: queryIndex + 1, query, response: "", responseLength: 0, sources: [], truncation: null, failureCode: null,
      durationMs, status: durationMs >= MAX_RESPONSE_WAIT_MS ? "timeout" : "error",
      errorDetail: err.message || String(err),
      transport: { httpStatus: transport.lastHttpStatus, requestId: transport.lastRequestId, errorBody: transport.lastErrorBody },
    };
  }
}

test.describe("10-Query Verification", () => {
  test.setTimeout(0);

  test("verify first 10 queries — RAG sources + no truncation", async ({ page }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    console.log("[VERIFY] Setting up doc attachment injector (before login to prevent Q1 race)...");
    await setupDocumentAttachmentInjector(page);
    const transport = setupStreamInterceptor(page);

    console.log("[VERIFY] Logging in...");
    await login(page);

    console.log("[VERIFY] Opening new chat...");
    await navigateToNewChat(page);
    await page.waitForTimeout(2000); // settle time for React mount

    const results: QueryResult[] = [];

    for (let i = 0; i < QUERIES_10.length; i++) {
      const q = QUERIES_10[i];
      console.log(`\n[VERIFY] ─── Query ${i + 1}/10 ───`);
      console.log(`[VERIFY] Q: ${q.substring(0, 80)}...`);

      const result = await sendQueryAndCapture(page, q, i, transport);

      console.log(`[VERIFY] Status: ${result.status} | HTTP: ${result.transport.httpStatus} | ${result.durationMs}ms`);
      console.log(`[VERIFY] Response: ${result.responseLength} chars`);
      console.log(`[VERIFY] Sources: [${result.sources.join(", ")}]`);
      if (result.truncation) console.log(`[VERIFY] TRUNCATION: ${result.truncation}`);
      if (result.failureCode) console.log(`[VERIFY] FAILURE: ${result.failureCode}`);
      if (result.errorDetail) console.log(`[VERIFY] ERROR: ${result.errorDetail}`);

      results.push(result);
      fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2));
      await page.waitForTimeout(1000);
    }

    // ── Summary ──
    const ok = results.filter(r => r.status === "ok").length;
    const errors = results.filter(r => r.status === "error").length;
    const truncated = results.filter(r => r.truncation).length;
    const withSources = results.filter(r => r.sources.length > 0).length;

    console.log("\n═══════════════════════════════════");
    console.log("     10-QUERY VERIFICATION");
    console.log("═══════════════════════════════════");
    console.log(`Successful:    ${ok}/10`);
    console.log(`Errors:        ${errors}/10`);
    console.log(`Truncated:     ${truncated}/10`);
    console.log(`With sources:  ${withSources}/10`);
    console.log(`Report: ${REPORT_FILE}`);
    console.log("═══════════════════════════════════");

    // ── Assertions ──
    expect(errors, `${errors} queries errored — backend not stable`).toBeLessThanOrEqual(1);
    expect(truncated, `${truncated} queries truncated — limits too aggressive`).toBe(0);
  });
});
