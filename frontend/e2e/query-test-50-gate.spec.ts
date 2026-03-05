import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  createQueryIndexByText,
  resolveScopedDocsForRequest,
} from "./support/attachment-scope";
import { captureAssistantMessage } from "./support/response-capture";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@koda.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

/* ─────────────────────────────────────────────────────────────────────────────
 * 50-Query Gate Test
 *
 * Runs 50 sequential queries in a single chat session to verify:
 * 1. Documents are attached and retrieval engages (sources present)
 * 2. No truncation on normal or table responses
 * 3. Backend stays stable across all 50 queries
 * 4. Doc-name-aware retrieval resolves correct documents
 * ─────────────────────────────────────────────────────────────────────────── */

const TARGET_DOCUMENTS = [
  { id: "7d55ead0-4840-4537-94ee-913e2feb5bce", name: "Anotações_Aula_2__1_.pdf", type: "application/pdf" },
  { id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438", name: "Capítulo_8__Framework_Scrum_.pdf", type: "application/pdf" },
  { id: "ee91764d-304d-4162-8c0b-826662ee70a3", name: "Trabalho_projeto_.pdf", type: "application/pdf" },
  { id: "5471856b-b93f-4aae-b450-35b121cad140", name: "OBA_marketing_servicos__1_.pdf", type: "application/pdf" },
  { id: "5708e5f5-42d4-45e7-803b-ae490c45a766", name: "TRABALHO_FINAL__1_.PNG", type: "image/png" },
  { id: "ce276bc4-bed3-41c2-b965-05ceb9ea0913", name: "guarda_bens_self_storage.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
];

const QUERIES_50: string[] = [
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
  "No capítulo de scrum, qual é a definição central de Scrum?",
  "Quais papéis aparecem e qual a responsabilidade de cada um?",
  "Me explica os eventos na ordem correta, bem simples.",
  "Onde entra o Product Backlog nesse fluxo?",
  "E qual a diferença prática entre Product Backlog e Sprint Backlog?",
  "Me diz o que o texto fala de Definition of Done.",
  "Agora traz isso em tabela: conceito | definição | evidência.",
  "Me dá 3 trechos curtos que provem as ideias principais.",
  "Quais erros comuns de implementação de Scrum o capítulo sugere evitar?",
  "Se eu fosse aplicar amanhã, quais 5 ações iniciais eu faria?",
  "Me responde isso como plano de 2 semanas.",
  "Agora me dá versão para explicar isso a alguém leigo.",
  "Faz 10 flashcards de estudo com base nesse capítulo.",
  "Cria 5 perguntas de prova com gabarito.",
  "Ótimo, agora conecta isso com as anotações da aula.",
  "Nas anotações da aula, quais temas batem com o capítulo de scrum?",
  "Quais termos das anotações complementam o capítulo?",
  "Quais pontos das anotações parecem contradizer ou ampliar o capítulo?",
  "Resume as anotações em tópicos por tema.",
  "Me dá os 10 termos mais importantes das anotações com explicação curta.",
  "Quais partes das anotações parecem mais práticas?",
  "Quais partes parecem mais teóricas?",
  "Gera um mapa mental textual das anotações.",
  "Agora transforma isso em checklist de revisão para estudo.",
  "Fechou. Vamos para o trabalho do projeto.",
  "No trabalho do projeto, qual é o objetivo principal?",
  "Extrai escopo, entregáveis e critérios de sucesso.",
  "Me mostra os prazos e marcos que aparecem.",
  "Quem são os stakeholders citados?",
  "Cria uma matriz: requisito | prioridade | evidência.",
  "Quais riscos do projeto aparecem no texto?",
  "Quais mitigadores o documento sugere?",
  "Se faltarem mitigadores, sugere com base no conteúdo existente.",
  "Resume o projeto em formato pitch de 60 segundos.",
  "Agora em versão técnica para equipe de execução.",
  "Me dá uma SWOT baseada só no trabalho do projeto.",
  "Quais lacunas impedem execução imediata?",
  "Gera uma lista de perguntas de esclarecimento para o autor.",
  "Agora compara esse trabalho com o capítulo de scrum.",
  "E diz se a execução proposta está aderente ao framework.",
];
const QUERY_INDEX_BY_TEXT = createQueryIndexByText(QUERIES_50, 0);

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
const REPORT_FILE = path.join(REPORT_DIR, "query-test-50-gate-results.json");
const MAX_RESPONSE_WAIT_MS = 180_000;

function buildReportPayload(results: QueryResult[]) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalQueries: QUERIES_50.length,
      documentsAttached: TARGET_DOCUMENTS.map((document) => ({
        id: document.id,
        name: document.name,
      })),
    },
    results,
  };
}

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
    await page.screenshot({ path: path.join(REPORT_DIR, "login-failed-50.png") });
    throw new Error(`Login did not redirect. Current URL: ${page.url()}`);
  }
  await page.waitForTimeout(3000);
  await suppressTours(page);
}

async function navigateToNewChat(page: Page) {
  await page.goto("/c/k4r8f5");
  await page
    .waitForURL((url) => url.pathname.startsWith("/c/"), { timeout: 12_000 })
    .catch(() => {});
  await ensureChatComposerVisible(page);
  await page.waitForTimeout(1000);
}

async function suppressTours(page: Page) {
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

async function dismissOnboardingOverlays(page: Page) {
  const skipIntro = page.getByRole("button", { name: /Skip introduction/i });
  if (await skipIntro.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipIntro.click();
  }
  const dialog = page.getByRole("dialog", { name: /onboarding tour/i });
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    const doneBtn = dialog.getByRole("button", { name: /^Done$/i });
    if (await doneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await doneBtn.click();
      return;
    }
    const skipBtn = dialog.getByRole("button", { name: /^Skip$/i });
    if (await skipBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipBtn.click();
    }
  }
}

async function ensureChatComposerVisible(page: Page) {
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

  await dismissOnboardingOverlays(page);
  if (
    inChatRoute() &&
    (await chatInput.isVisible({ timeout: 1200 }).catch(() => false))
  ) {
    return;
  }

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

  await page.goto("/c/k4r8f5");
  await page
    .waitForURL((url) => url.pathname.startsWith("/c/"), { timeout: 12_000 })
    .catch(() => {});
  await dismissOnboardingOverlays(page);
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
}

async function setupDocumentAttachmentInjector(page: Page) {
  const scopedState = { fallbackTurn: 0 };
  await page.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    try {
      const raw = request.postData();
      if (!raw) {
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
      await route.continue({ postData: JSON.stringify(postData) });
    } catch {
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
    await ensureChatComposerVisible(page);
    const chatInput = page.locator("textarea.chat-v3-textarea");
    await chatInput.fill(query);
    await page.waitForTimeout(300);
    await chatInput.press("Enter");
    await expect(assistantMsgs).toHaveCount(beforeCount + 1, { timeout: 45_000 });
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
    const normalizedResponse = responseText.trim();
    const genericErrorMessages = new Set([
      "Something went wrong",
      "Something went wrong.",
      "Algo deu errado. Por favor, tente novamente.",
      "Algo deu errado. Tente novamente.",
      "Houve um problema. Por favor, tente mais uma vez.",
      "Stream interrupted.",
    ]);
    const isGenericError = genericErrorMessages.has(normalizedResponse);
    const isHttpError = transport.lastHttpStatus !== null && transport.lastHttpStatus >= 400;
    let status: "ok" | "error" | "timeout" = "ok";
    if (isGenericError || isHttpError || failureCode || normalizedResponse.length === 0) status = "error";

    return {
      index: queryIndex + 1, query, response: normalizedResponse, responseLength: normalizedResponse.length,
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

test.describe("50-Query Gate Test", () => {
  test.setTimeout(0);

  test("run 50 queries — verify RAG retrieval, no truncation, stability", async ({ page }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    console.log("[GATE-50] Setting up doc attachment injector...");
    await setupDocumentAttachmentInjector(page);
    const transport = setupStreamInterceptor(page);

    console.log("[GATE-50] Logging in...");
    await login(page);

    console.log("[GATE-50] Opening new chat...");
    await navigateToNewChat(page);
    await page.waitForTimeout(2000);

    const results: QueryResult[] = [];

    for (let i = 0; i < QUERIES_50.length; i++) {
      const q = QUERIES_50[i];
      console.log(`\n[GATE-50] ─── Query ${i + 1}/50 ───`);
      console.log(`[GATE-50] Q: ${q.substring(0, 80)}...`);

      const result = await sendQueryAndCapture(page, q, i, transport);

      console.log(`[GATE-50] Status: ${result.status} | HTTP: ${result.transport.httpStatus} | ${result.durationMs}ms`);
      console.log(`[GATE-50] Response: ${result.responseLength} chars`);
      console.log(`[GATE-50] Sources: [${result.sources.join(", ")}]`);
      if (result.truncation) console.log(`[GATE-50] TRUNCATION: ${result.truncation}`);
      if (result.failureCode) console.log(`[GATE-50] FAILURE: ${result.failureCode}`);
      if (result.errorDetail) console.log(`[GATE-50] ERROR: ${result.errorDetail}`);

      results.push(result);
      fs.writeFileSync(REPORT_FILE, JSON.stringify(buildReportPayload(results), null, 2));
      await page.waitForTimeout(1000);
    }

    // ── Summary ──
    const ok = results.filter(r => r.status === "ok").length;
    const errors = results.filter(r => r.status === "error").length;
    const timeouts = results.filter(r => r.status === "timeout").length;
    const truncated = results.filter(r => r.truncation).length;
    const withSources = results.filter(r => r.sources.length > 0).length;
    const uniqueSources = new Set(results.flatMap((r) => r.sources)).size;
    const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
    const avgLength = Math.round(results.filter(r => r.status === "ok").reduce((s, r) => s + r.responseLength, 0) / Math.max(1, ok));
    const shortResponses = results.filter(r => r.status === "ok" && r.responseLength < 100).length;
    const compareRows = results.filter((r) => r.index === 49 || r.index === 50);

    console.log("\n═══════════════════════════════════════════");
    console.log("        50-QUERY GATE TEST RESULTS");
    console.log("═══════════════════════════════════════════");
    console.log(`Successful:       ${ok}/50`);
    console.log(`Errors:           ${errors}/50`);
    console.log(`Timeouts:         ${timeouts}/50`);
    console.log(`Truncated:        ${truncated}/50`);
    console.log(`With sources:     ${withSources}/50`);
    console.log(`Unique sources:   ${uniqueSources}`);
    console.log(`Short (<100ch):   ${shortResponses}/50`);
    console.log(`Avg duration:     ${avgDuration}ms`);
    console.log(`Avg resp length:  ${avgLength} chars`);
    console.log(`Report: ${REPORT_FILE}`);
    console.log("═══════════════════════════════════════════");

    // ── Assertions ──
    expect(errors, `${errors} queries errored — backend not stable`).toBe(0);
    expect(timeouts, `${timeouts} queries timed out — backend not stable`).toBe(0);
    expect(truncated, `${truncated} queries truncated — table/response limits too aggressive`).toBe(0);
    expect(ok, `Only ${ok}/50 ok — too many failures`).toBe(50);
    expect(withSources, `Only ${withSources}/50 responses with sources`).toBe(50);
    expect(uniqueSources, `Only ${uniqueSources} unique sources used across 50 queries`).toBeGreaterThanOrEqual(5);
    expect(
      compareRows.every((row) => row.sources.length >= 2),
      "Cross-doc comparison turns must cite at least two documents",
    ).toBe(true);
  });
});
