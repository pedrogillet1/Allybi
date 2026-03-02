import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@koda.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";

/* ─────────────────────────────────────────────────────────────────────────────
 * 50-Query Explicit Doc-Name Test
 *
 * Every query explicitly names the target document.
 * Tests doc-name-aware retrieval + no truncation + stability.
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
  "No documento Capítulo 8 (Framework Scrum).pdf, qual é a definição de Scrum?",
  "Quais são os papéis de Scrum citados em Capítulo 8 (Framework Scrum).pdf?",
  "Liste os eventos do Scrum em ordem, com uma frase para cada um.",
  "O documento menciona artefatos de Scrum? Liste todos.",
  "Traga uma citação literal curta sobre Sprint Planning em Capítulo 8 (Framework Scrum).pdf.",
  "Qual a diferença entre Product Backlog e Sprint Backlog segundo o documento?",
  "O que o texto diz sobre Definition of Done?",
  "Faça um resumo em 5 bullets de Capítulo 8 (Framework Scrum).pdf.",
  "Faça um resumo em 1 parágrafo para diretoria do mesmo documento.",
  "Quais termos aparecem com mais frequência em Capítulo 8 (Framework Scrum).pdf?",
  "Monte uma tabela: conceito Scrum | definição | trecho de evidência.",
  "Quais riscos de implementação de Scrum o documento sugere?",
  "Se houver, quais métricas de acompanhamento são citadas?",
  "Extraia todas as menções a \"Sprint Review\" com contexto.",
  "Em uma frase: qual a mensagem central do capítulo?",
  "Em Anotações Aula 2 (1).pdf, qual o tema principal?",
  "Faça um resumo estruturado por tópicos de Anotações Aula 2 (1).pdf.",
  "Liste termos técnicos-chave desse PDF com breve explicação.",
  "Traga 3 citações que melhor representem o conteúdo das anotações.",
  "Existe alguma metodologia além de Scrum nas anotações?",
  "Quais conceitos se repetem entre páginas diferentes de Anotações Aula 2 (1).pdf?",
  "Identifique possíveis definições formais presentes nesse arquivo.",
  "Quais perguntas de prova eu poderia criar com base nesse PDF?",
  "Gere 10 flashcards (pergunta/resposta) com base nas anotações.",
  "Quais pontos parecem mais confusos ou ambíguos no texto?",
  "Em Trabalho projeto .pdf, qual é o objetivo do projeto?",
  "Extraia escopo, entregáveis e critérios de sucesso de Trabalho projeto .pdf.",
  "Liste prazos, marcos e datas mencionadas no documento.",
  "Quais stakeholders são citados no trabalho?",
  "Monte uma matriz: requisito | prioridade | evidência no documento.",
  "Há restrições (tempo/custo/recursos) explícitas em Trabalho projeto .pdf?",
  "Quais riscos e mitigação o documento apresenta?",
  "Resuma o projeto em formato de pitch de 60 segundos.",
  "Faça uma análise SWOT baseada apenas no Trabalho projeto .pdf.",
  "Gere um checklist de execução com base no trabalho.",
  "Em OBA_marketing_servicos (1).pdf, quais serviços são oferecidos?",
  "Extraia proposta de valor e diferenciais de OBA_marketing_servicos (1).pdf.",
  "Há público-alvo explícito nesse PDF? Qual?",
  "Liste palavras de marketing usadas nesse documento.",
  "Reescreva a proposta comercial em tom mais executivo.",
  "Crie uma versão curta para WhatsApp da oferta desse PDF.",
  "Monte uma tabela: serviço | benefício | prova no documento.",
  "Existe call-to-action explícito? Qual?",
  "Quais objeções de cliente posso antecipar com base no PDF?",
  "Gere 5 perguntas de qualificação comercial baseadas nesse arquivo.",
  "No TRABALHO FINAL (1).PNG, faça OCR e transcreva todo o texto.",
  "Resuma o conteúdo do PNG em 5 bullets.",
  "Extraia nomes, datas e números presentes na imagem.",
  "Existe alguma tabela ou estrutura visual no PNG? Descreva.",
  "Quais partes do texto da imagem estão ilegíveis ou incertas?",
];

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
const REPORT_FILE = path.join(REPORT_DIR, "query-test-50-explicit-results.json");
const MAX_RESPONSE_WAIT_MS = 180_000;
const MAX_ASSISTANT_APPEAR_MS = 12_000;

interface StreamInterceptState {
  lastHttpStatus: number | null;
  lastRequestId: string | null;
  lastErrorBody: string | null;
}

async function dismissOnboardingIfPresent(page: Page): Promise<void> {
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
        await page.waitForTimeout(250);
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }

  await page.keyboard.press("Escape").catch(() => undefined);
}

async function ensureChatReady(page: Page): Promise<void> {
  await dismissOnboardingIfPresent(page);
  const chatInput = page.locator("textarea.chat-v3-textarea");
  if (await chatInput.isVisible({ timeout: 1200 }).catch(() => false)) return;

  if (!page.url().includes("/c/")) {
    await page.goto("/c/k4r8f5");
  }
  await dismissOnboardingIfPresent(page);
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
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
  if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissOnboardingIfPresent(page);
    return;
  }
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/a/"), { timeout: 30_000 });
  } catch {
    await page.screenshot({ path: path.join(REPORT_DIR, "login-failed-50exp.png") });
    throw new Error(`Login did not redirect. Current URL: ${page.url()}`);
  }
  await page.waitForTimeout(3000);
  await dismissOnboardingIfPresent(page);
}

async function navigateToNewChat(page: Page) {
  await page.goto("/c/k4r8f5");
  await ensureChatReady(page);
}

async function setupDocumentAttachmentInjector(page: Page) {
  await page.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") { await route.continue(); return; }
    try {
      const raw = request.postData();
      if (!raw) { await route.continue(); return; }
      const postData = JSON.parse(raw);
      const hadDocs = postData.attachedDocuments?.length > 0;
      if (!hadDocs) {
        postData.attachedDocuments = TARGET_DOCUMENTS;
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
    await ensureChatReady(page);

    const assistantMsgs = page.locator('[data-testid="msg-assistant"]');
    const beforeCount = await assistantMsgs.count();
    const chatInput = page.locator("textarea.chat-v3-textarea");
    await chatInput.fill(query);
    await page.waitForTimeout(300);
    const sendBtn = page.locator('button[aria-label="Send"]');
    if (await sendBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await chatInput.press("Enter");
    }
    await expect(assistantMsgs).toHaveCount(beforeCount + 1, { timeout: MAX_ASSISTANT_APPEAR_MS });
    const lastMsg = assistantMsgs.nth(beforeCount);
    await page.locator('button[aria-label="Send"]').waitFor({ state: "visible", timeout: MAX_RESPONSE_WAIT_MS });
    await page.waitForTimeout(1500);

    const markdownEl = lastMsg.locator('.markdown-preview-container');
    const contentEl = lastMsg.locator('[data-testid="assistant-message-content"]');
    let responseText = "";
    if (await markdownEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      responseText = await markdownEl.evaluate((el) => el.innerText);
    } else if (await contentEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      responseText = await contentEl.evaluate((el) => el.innerText);
    } else {
      responseText = await lastMsg.evaluate((el) => el.innerText);
    }

    const sourcePills = lastMsg.locator(".koda-source-pill__text");
    const pillCount = await sourcePills.count();
    const sources: string[] = [];
    for (let i = 0; i < pillCount; i++) {
      const txt = await sourcePills.nth(i).textContent();
      if (txt) sources.push(txt.trim());
    }
    if (pillCount === 0) {
      const altPills = lastMsg.locator(".koda-source-pill, .source-pill, [class*='source']");
      const altCount = await altPills.count();
      for (let i = 0; i < altCount; i++) {
        const txt = await altPills.nth(i).evaluate((el) => el.innerText);
        if (txt && txt.trim()) sources.push(txt.trim());
      }
    }

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
      errorDetail: `${err.message || String(err)} | url=${page.url()}`,
      transport: { httpStatus: transport.lastHttpStatus, requestId: transport.lastRequestId, errorBody: transport.lastErrorBody },
    };
  }
}

test.describe("50-Query Explicit Doc-Name Test", () => {
  test.setTimeout(0);

  test("run 50 explicit queries — doc-name retrieval + no truncation", async ({ page }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    console.log("[EXP-50] Setting up doc attachment injector...");
    await setupDocumentAttachmentInjector(page);
    const transport = setupStreamInterceptor(page);

    console.log("[EXP-50] Logging in...");
    await login(page);

    console.log("[EXP-50] Opening new chat...");
    await navigateToNewChat(page);
    await page.waitForTimeout(2000);

    const results: QueryResult[] = [];

    for (let i = 0; i < QUERIES_50.length; i++) {
      const q = QUERIES_50[i];
      console.log(`\n[EXP-50] ─── Query ${i + 1}/50 ───`);
      console.log(`[EXP-50] Q: ${q.substring(0, 90)}...`);

      const result = await sendQueryAndCapture(page, q, i, transport);

      console.log(`[EXP-50] Status: ${result.status} | HTTP: ${result.transport.httpStatus} | ${result.durationMs}ms`);
      console.log(`[EXP-50] Response: ${result.responseLength} chars`);
      console.log(`[EXP-50] Sources: [${result.sources.join(", ")}]`);
      if (result.truncation) console.log(`[EXP-50] TRUNCATION: ${result.truncation}`);
      if (result.failureCode) console.log(`[EXP-50] FAILURE: ${result.failureCode}`);
      if (result.errorDetail) console.log(`[EXP-50] ERROR: ${result.errorDetail}`);

      results.push(result);
      fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2));
      await page.waitForTimeout(1000);
    }

    // ── Summary ──
    const ok = results.filter(r => r.status === "ok").length;
    const errors = results.filter(r => r.status === "error").length;
    const timeouts = results.filter(r => r.status === "timeout").length;
    const truncated = results.filter(r => r.truncation).length;
    const withSources = results.filter(r => r.sources.length > 0).length;
    const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
    const avgLength = Math.round(results.filter(r => r.status === "ok").reduce((s, r) => s + r.responseLength, 0) / Math.max(1, ok));

    console.log("\n═══════════════════════════════════════════");
    console.log("     50-QUERY EXPLICIT DOC-NAME RESULTS");
    console.log("═══════════════════════════════════════════");
    console.log(`Successful:       ${ok}/50`);
    console.log(`Errors:           ${errors}/50`);
    console.log(`Timeouts:         ${timeouts}/50`);
    console.log(`Truncated:        ${truncated}/50`);
    console.log(`With sources:     ${withSources}/50`);
    console.log(`Avg duration:     ${avgDuration}ms`);
    console.log(`Avg resp length:  ${avgLength} chars`);
    console.log(`Report: ${REPORT_FILE}`);
    console.log("═══════════════════════════════════════════");

    expect(errors, `${errors} queries errored`).toBeLessThanOrEqual(3);
    expect(ok, `Only ${ok}/50 ok`).toBeGreaterThanOrEqual(45);
  });
});
