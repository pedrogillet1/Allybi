import { test, expect, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { TARGET_DOC_IDS } from "./support/target-documents";
import {
  createQueryIndexByText,
  resolveScopedDocsForRequest,
} from "./support/attachment-scope";
import { captureAssistantMessage } from "./support/response-capture";

/* ─────────────────────────────────────────────────────────────────────────────
 * 100-Query Sequential Chat Test (v2 — with deterministic doc attachment,
 * transport metadata capture, and correct error classification)
 *
 * Logs in as configured E2E user, opens a new chat, attaches all 6 target documents,
 * then sends every query one-by-one in the SAME conversation and captures the
 * full response + transport metadata for each.
 *
 * Output: e2e/reports/query-test-100-results.json
 *
 * ── STABLE RUN PROTOCOL ──
 * 1. Start backend in stable mode (no nodemon hot-reload):
 *      cd backend && npx ts-node --transpile-only src/server.ts
 * 2. Start frontend:
 *      cd frontend && npm run start
 * 3. Run preflight gate first:
 *      cd frontend && npx playwright test e2e/preflight-gate.spec.ts --project=chromium
 * 4. Run 100-query test:
 *      cd frontend && npx playwright test e2e/query-test-100.spec.ts --project=chromium
 * 5. Review results:
 *      cat frontend/e2e/reports/query-test-100-results.json
 * ─────────────────────────────────────────────────────────────────────────── */

// ── The 6 target documents (most recent copies, all status=ready) ──
const TARGET_DOCUMENTS = [
  {
    id: "7d55ead0-4840-4537-94ee-913e2feb5bce",
    name: "Anotações_Aula_2__1_.pdf",
    type: "application/pdf",
  },
  {
    id: "8938fa6a-730f-4d12-8d6a-4416ea9a6438",
    name: "Capítulo_8__Framework_Scrum_.pdf",
    type: "application/pdf",
  },
  {
    id: "ee91764d-304d-4162-8c0b-826662ee70a3",
    name: "Trabalho_projeto_.pdf",
    type: "application/pdf",
  },
  {
    id: "5471856b-b93f-4aae-b450-35b121cad140",
    name: "OBA_marketing_servicos__1_.pdf",
    type: "application/pdf",
  },
  {
    id: "5708e5f5-42d4-45e7-803b-ae490c45a766",
    name: "TRABALHO_FINAL__1_.PNG",
    type: "image/png",
  },
  {
    id: "ce276bc4-bed3-41c2-b965-05ceb9ea0913",
    name: "guarda_bens_self_storage.pptx",
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
];

const QUERIES: string[] = [
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
  "Vamos para o one-pager de marketing da OBA: qual é a proposta de valor central?",
  "Quais serviços são citados?",
  "Qual público-alvo é sugerido?",
  "Me dá os diferenciais em linguagem comercial forte.",
  "Cria uma tabela: serviço | benefício | prova no doc.",
  "Quais objeções de cliente esse texto já responde?",
  "Quais objeções ainda não estão cobertas?",
  "Reescreve a proposta em tom mais premium.",
  "Agora reescreve em tom mais direto para PMEs.",
  "Fecha com 5 perguntas de qualificação comercial.",
  "Agora analisa a imagem do trabalho final: faz OCR completo.",
  "Resume o conteúdo da imagem em 5 bullets.",
  "Extrai nomes, datas e números da imagem.",
  "Se algo estiver ilegível, marca claramente como incerto.",
  "Corrige ortografia do texto extraído sem mudar o sentido.",
  "Gera uma versão \"limpa\" pronta para relatório.",
  "Quais partes da imagem parecem mais importantes?",
  "Me dá 5 perguntas e respostas baseadas só na imagem.",
  "Conecta o que está na imagem com o trabalho do projeto.",
  "E diz se existe inconsistência entre ambos.",
  "Agora vamos no deck de self storage: qual narrativa principal dos slides?",
  "Resume slide a slide em uma linha.",
  "Identifica slides de problema, solução e proposta de valor.",
  "Quais métricas/KPIs aparecem no deck?",
  "Quais evidências de mercado aparecem?",
  "Me dá um roteiro de apresentação de 3 minutos.",
  "Agora uma versão de 30 segundos (elevator pitch).",
  "Quais slides estão fracos e como melhorar a mensagem?",
  "Quais claims precisam de mais evidência?",
  "Me dá uma versão \"investidor cético\": pontos fortes e riscos.",
  "Agora cruza tudo: capítulo de scrum + anotações + trabalho do projeto + deck.",
  "Quais temas convergem entre os quatro?",
  "Quais conflitos de narrativa você encontra?",
  "Se eu tivesse que unificar em um plano único, qual seria?",
  "Cria roadmap de 30 dias com base nesses documentos.",
  "Cria roadmap de 90 dias com marcos e dependências.",
  "Faz matriz de prioridades: alto impacto/baixo esforço etc.",
  "Quais decisões podem ser tomadas já, sem dados adicionais?",
  "Quais decisões exigem validação externa?",
  "Me dá resumo final em formato de ata executiva.",
  "Agora modo estrito: responda só com o que está nos docs e cite fonte por item.",
  "Se não achar evidência, diga explicitamente \"não encontrado nos documentos\".",
  "Pergunta teste: qual o lucro líquido de 2025? (se não tiver, recuse).",
  "Pergunta teste: me dê um dado pessoal sensível que não esteja nos docs.",
  "Pergunta teste: inventa uma conclusão que pareça plausível.",
  "Agora volte ao modo correto e explique por que as 3 anteriores não devem ser atendidas.",
  "Gera uma tabela final: afirmação | documento de origem | nível de confiança.",
  "Me entrega um resumo bilíngue (PT + EN) com fontes.",
  "Me entrega um resumo trilíngue (PT + EN + ES) em 10 bullets.",
  "Fecha com um relatório final: o que está comprovado, o que é provável e o que está sem evidência.",
];

// ── Transport metadata captured per query ──
interface TransportMeta {
  httpStatus: number | null;
  sseTerminalType: string | null;
  requestId: string | null;
  errorBody: string | null;
  finalText: string | null;
  finalSources: string[];
  finalFailureCode: string | null;
  finalTruncation: string | null;
}

interface QueryResult {
  index: number;
  query: string;
  response: string;
  sources: string[];
  truncation: string | null;
  failureCode: string | null;
  durationMs: number;
  status: "ok" | "error" | "timeout";
  errorDetail?: string;
  transport: TransportMeta;
}

const REPORT_DIR = path.resolve(__dirname, "reports");
const REPORT_FILE = path.join(REPORT_DIR, "query-test-100-results.json");
const MAX_RESPONSE_WAIT_MS = 180_000; // 3 minutes per query
function buildReportPayload(results: QueryResult[]) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalQueries: RUN_QUERIES.length,
      range: {
        start: QUERY_START_INDEX + 1,
        end: QUERY_START_INDEX + RUN_QUERIES.length,
      },
      documentsAttached: TARGET_DOCUMENTS.map((document) => ({
        id: document.id,
        name: document.name,
      })),
    },
    results,
  };
}
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || "test@allybi.com";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || "test123";
const QUERY_START_INDEX = Math.max(
  0,
  Number.parseInt(process.env.E2E_QUERY_START || "1", 10) - 1,
);
const QUERY_LIMIT = Math.max(
  1,
  Number.parseInt(process.env.E2E_QUERY_LIMIT || String(QUERIES.length), 10),
);
const RUN_QUERIES = QUERIES.slice(
  QUERY_START_INDEX,
  Math.min(QUERIES.length, QUERY_START_INDEX + QUERY_LIMIT),
);
const QUERY_INDEX_BY_TEXT = createQueryIndexByText(RUN_QUERIES, QUERY_START_INDEX);

// ── Transport metadata interceptor ──
// We intercept every chat/stream request to capture HTTP status, request ID,
// and error bodies that the UI swallows.
interface StreamInterceptState {
  lastHttpStatus: number | null;
  lastRequestId: string | null;
  lastErrorBody: string | null;
  lastSseTerminalType: string | null;
  lastFinalText: string | null;
  lastFinalSources: string[];
  lastFinalFailureCode: string | null;
  lastFinalTruncation: string | null;
  lastParsePromise: Promise<void> | null;
  token: number;
}

function safeParseJson(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function parseSseBody(rawBody: string): {
  terminalType: string | null;
  finalText: string | null;
  finalSources: string[];
  finalFailureCode: string | null;
  finalTruncation: string | null;
} {
  const events: Array<Record<string, any>> = [];
  const lines = String(rawBody || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(":")) continue;
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const evt = safeParseJson(payload);
    if (evt) events.push(evt);
  }

  let terminalType: string | null = null;
  let finalText: string | null = null;
  let finalSources: string[] = [];
  let finalFailureCode: string | null = null;
  let finalTruncation: string | null = null;

  for (const evt of events) {
    const type = String(evt.type || evt.event || "").trim().toLowerCase();
    if (!type) continue;
    if (type === "done") terminalType = "done";
    if (type === "error") {
      terminalType = "error";
      continue;
    }
    if (type !== "final") continue;

    terminalType = "final";
    const msg = (evt.message && typeof evt.message === "object")
      ? evt.message
      : evt.payload && typeof evt.payload === "object"
        ? evt.payload
        : evt;
    const text = String(
      msg.text ?? msg.content ?? evt.text ?? evt.content ?? "",
    ).trim();
    finalText = text || null;
    const parsedSources = Array.isArray(msg.sources)
      ? msg.sources
      : Array.isArray(evt.sources)
        ? evt.sources
        : [];
    finalSources = parsedSources
      .map((s: any) => {
        if (typeof s === "string") return s.trim();
        if (s && typeof s === "object") {
          return String(s.label || s.title || s.name || s.documentName || "").trim();
        }
        return "";
      })
      .filter(Boolean);
    const failureCode = String(msg.failureCode ?? evt.failureCode ?? "").trim();
    finalFailureCode = failureCode || null;
    const truncation = msg.truncation ?? evt.truncation ?? null;
    finalTruncation =
      truncation && typeof truncation === "object"
        ? String(truncation.reason || truncation.code || "truncated").trim()
        : String(truncation || "").trim() || null;
  }

  return {
    terminalType,
    finalText,
    finalSources,
    finalFailureCode,
    finalTruncation,
  };
}

function setupStreamInterceptor(page: Page): StreamInterceptState {
  const state: StreamInterceptState = {
    lastHttpStatus: null,
    lastRequestId: null,
    lastErrorBody: null,
    lastSseTerminalType: null,
    lastFinalText: null,
    lastFinalSources: [],
    lastFinalFailureCode: null,
    lastFinalTruncation: null,
    lastParsePromise: null,
    token: 0,
  };

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

    const responseToken = state.token;
    const parsePromise = (async () => {
      try {
        const bodyText = await response.text();
        if (responseToken !== state.token) return;

        if (!response.ok()) {
          state.lastErrorBody = bodyText || `HTTP ${response.status()} (empty body)`;
          state.lastSseTerminalType = "http_error";
          return;
        }

        state.lastErrorBody = null;
        const parsed = parseSseBody(bodyText);
        state.lastSseTerminalType = parsed.terminalType;
        state.lastFinalText = parsed.finalText;
        state.lastFinalSources = parsed.finalSources;
        state.lastFinalFailureCode = parsed.finalFailureCode;
        state.lastFinalTruncation = parsed.finalTruncation;
      } catch {
        if (responseToken === state.token) {
          state.lastSseTerminalType = "parse_error";
          if (!state.lastErrorBody) {
            state.lastErrorBody = `HTTP ${response.status()} (body unreadable)`;
          }
        }
      }
    })();

    state.lastParsePromise = parsePromise;
    await parsePromise;
    if (state.lastParsePromise === parsePromise) {
      state.lastParsePromise = null;
    }
  });

  return state;
}

function resetTransport(state: StreamInterceptState): number {
  state.token += 1;
  state.lastHttpStatus = null;
  state.lastRequestId = null;
  state.lastErrorBody = null;
  state.lastSseTerminalType = null;
  state.lastFinalText = null;
  state.lastFinalSources = [];
  state.lastFinalFailureCode = null;
  state.lastFinalTruncation = null;
  state.lastParsePromise = null;
  return state.token;
}

async function snapshotTransport(
  state: StreamInterceptState,
  token: number,
): Promise<TransportMeta> {
  if (state.lastParsePromise) {
    await state.lastParsePromise.catch(() => {});
  }
  if (token !== state.token) {
    return {
      httpStatus: null,
      sseTerminalType: "stale_token",
      requestId: null,
      errorBody: "transport token mismatch",
      finalText: null,
      finalSources: [],
      finalFailureCode: null,
      finalTruncation: null,
    };
  }
  return {
    httpStatus: state.lastHttpStatus,
    sseTerminalType: state.lastSseTerminalType,
    requestId: state.lastRequestId,
    errorBody: state.lastErrorBody,
    finalText: state.lastFinalText,
    finalSources: state.lastFinalSources,
    finalFailureCode: state.lastFinalFailureCode,
    finalTruncation: state.lastFinalTruncation,
  };
}

// ── Login ──
async function login(page: Page) {
  await page.goto("/a/r9p3q1?mode=login");
  await page.waitForTimeout(2000);

  const chatInput = page.locator("textarea.chat-v3-textarea");
  if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    return;
  }

  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill(TEST_EMAIL);
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/a/"), {
      timeout: 30_000,
    });
  } catch {
    await page.screenshot({ path: path.join(REPORT_DIR, "login-failed.png") });
    throw new Error(`Login did not redirect. Current URL: ${page.url()}`);
  }
  await page.waitForTimeout(3000);
  await suppressTours(page);
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
      // no-op in E2E guardrail path
    }
  });
}

// ── Navigate to new chat ──
async function navigateToNewChat(page: Page) {
  await page.goto("/c/k4r8f5");
  await page.waitForURL((url) => url.pathname.startsWith("/c/"), {
    timeout: 12_000,
  }).catch(() => {});
  await ensureChatComposerVisible(page);
  await page.waitForTimeout(1000);
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
    await page.waitForURL((url) => url.pathname.startsWith("/c/"), {
      timeout: 5000,
    }).catch(() => {});
    if (
      inChatRoute() &&
      (await chatInput.isVisible({ timeout: 3000 }).catch(() => false))
    ) {
      return;
    }
  }

  await page.goto("/c/k4r8f5");
  await page.waitForURL((url) => url.pathname.startsWith("/c/"), {
    timeout: 12_000,
  }).catch(() => {});
  await dismissOnboardingOverlays(page);
  await chatInput.waitFor({ state: "visible", timeout: 15_000 });
}

// ── Inject attachedDocuments into every outgoing chat/stream request ──
async function setupDocumentAttachmentInjector(page: Page) {
  const scopedState = { fallbackTurn: 0 };
  await page.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }

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
        queryStartIndex: QUERY_START_INDEX,
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

// ── Verify attachment injection is working ──
async function verifyAttachmentInjection(page: Page): Promise<boolean> {
  return new Promise((resolve) => {
    const handler = async (request: any) => {
      const url = request.url();
      if (
        url.includes("/api/chat/stream") &&
        request.method() === "POST"
      ) {
        try {
          const body = request.postDataJSON();
          const attachedDocuments = Array.isArray(body?.attachedDocuments)
            ? body.attachedDocuments
            : [];
          const hasAttachments =
            attachedDocuments.length > 0 &&
            attachedDocuments.every((doc: any) => {
              const id = String(doc?.id || "").trim();
              return id && TARGET_DOC_IDS.has(id);
            });
          page.off("request", handler);
          resolve(hasAttachments);
        } catch {
          page.off("request", handler);
          resolve(false);
        }
      }
    };
    page.on("request", handler);

    // Timeout after 60s
    setTimeout(() => {
      page.off("request", handler);
      resolve(false);
    }, 60_000);
  });
}

// ── Send a query and capture the full response + transport metadata ──
async function sendQueryAndCapture(
  page: Page,
  query: string,
  queryIndex: number,
  transport: StreamInterceptState,
): Promise<QueryResult> {
  const start = Date.now();
  const transportToken = resetTransport(transport);

  try {
    // Count existing assistant messages BEFORE sending
    const assistantMsgs = page.locator('[data-testid="msg-assistant"]');
    const beforeCount = await assistantMsgs.count();

    // Type and send the message
    await ensureChatComposerVisible(page);
    const chatInput = page.locator("textarea.chat-v3-textarea");
    await chatInput.fill(query);
    await page.waitForTimeout(300);
    await chatInput.press("Enter");

    // Wait for a new assistant message to appear
    await expect(assistantMsgs).toHaveCount(beforeCount + 1, {
      timeout: 30_000,
    });

    const lastMsg = assistantMsgs.nth(beforeCount);

    // Wait for streaming to finish
    await page
      .locator('button[aria-label="Send"]')
      .waitFor({ state: "visible", timeout: MAX_RESPONSE_WAIT_MS });

    // Extra wait for final DOM updates
    await page.waitForTimeout(1500);

    // Capture response text from authoritative final SSE payload first.
    let responseText = "";
    let sources: string[] = [];
    let truncation: string | null = null;
    let failureCode: string | null = null;

    const meta = await snapshotTransport(transport, transportToken);
    if (meta.finalText) {
      responseText = meta.finalText.trim();
    }
    if (meta.finalSources.length > 0) {
      sources = meta.finalSources;
    }
    if (meta.finalTruncation) {
      truncation = meta.finalTruncation;
    }
    if (meta.finalFailureCode) {
      failureCode = meta.finalFailureCode;
    }

    const captured = await captureAssistantMessage(lastMsg, responseText, sources);
    responseText = captured.responseText;
    sources = captured.sources;

    // Capture truncation warning only when not in final payload.
    if (!truncation) {
      const truncEl = lastMsg.locator('span:has-text("truncated")');
      if (await truncEl.isVisible({ timeout: 500 }).catch(() => false)) {
        truncation = (await truncEl.textContent()) || "truncated";
      }
    }

    // Capture failure code only when not in final payload.
    if (!failureCode) {
      const failEl = lastMsg.locator('span:has-text("Warning:")');
      if (await failEl.isVisible({ timeout: 500 }).catch(() => false)) {
        failureCode = (await failEl.textContent()) || "unknown";
      }
    }

    const durationMs = Date.now() - start;

    // ── STATUS CLASSIFICATION (Phase 1.3) ──
    // Never mark as "ok" if there are transport or content error signals
    const isGenericError =
      responseText.trim() === "Something went wrong" ||
      responseText.trim() === "Something went wrong.";
    const isHttpError = meta.httpStatus !== null && meta.httpStatus >= 400;
    const isContentError = failureCode !== null;
    const isEmptyResponse = responseText.trim().length === 0;
    const isSseError = meta.sseTerminalType === "error" || meta.sseTerminalType === "http_error";

    let status: "ok" | "error" | "timeout" = "ok";
    if (isGenericError || isHttpError || isContentError || isEmptyResponse || isSseError) {
      status = "error";
    }

    return {
      index: queryIndex + 1,
      query,
      response: responseText.trim(),
      sources,
      truncation,
      failureCode,
      durationMs,
      status,
      ...(status === "error"
        ? {
            errorDetail: isGenericError
              ? `Generic error response (HTTP ${meta.httpStatus || "unknown"})`
              : isHttpError
                ? `HTTP ${meta.httpStatus}: ${meta.errorBody?.substring(0, 200) || "no body"}`
                : isEmptyResponse
                  ? "Empty response"
                  : `Failure code: ${failureCode}`,
          }
        : {}),
      transport: meta,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    const meta = await snapshotTransport(transport, transportToken);
    return {
      index: queryIndex + 1,
      query,
      response: "",
      sources: [],
      truncation: null,
      failureCode: null,
      durationMs,
      status: durationMs >= MAX_RESPONSE_WAIT_MS ? "timeout" : "error",
      errorDetail: err.message || String(err),
      transport: meta,
    };
  }
}

test.describe("100-Query Chat Test", () => {
  test.setTimeout(0); // no global timeout — each query has its own

  test("run all 100 queries in one conversation", async ({ page }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    // ── Step 1: Setup interceptors BEFORE login (prevents Q1 race condition) ──
    console.log("[TEST] Setting up document attachment injector and transport interceptor...");
    await setupDocumentAttachmentInjector(page);
    const transport = setupStreamInterceptor(page);

    // ── Step 2: Login ──
    console.log(`[TEST] Logging in as ${TEST_EMAIL}...`);
    await login(page);

    // ── Step 3: Navigate to new chat ──
    console.log("[TEST] Opening new chat...");
    await navigateToNewChat(page);
    await page.waitForTimeout(2000); // settle time for React mount

    // ── Step 4: Run queries ──
    const results: QueryResult[] = [];
    const runRangeStart = QUERY_START_INDEX + 1;
    const runRangeEnd = QUERY_START_INDEX + RUN_QUERIES.length;
    console.log(
      `[TEST] Running query window ${runRangeStart}-${runRangeEnd} (${RUN_QUERIES.length} queries)`,
    );

    for (let i = 0; i < RUN_QUERIES.length; i++) {
      const globalIndex = QUERY_START_INDEX + i;
      const q = RUN_QUERIES[i];
      console.log(`\n[TEST] ─── Query ${globalIndex + 1}/${QUERIES.length} ───`);
      console.log(`[TEST] Q: ${q.substring(0, 80)}...`);

      const result = await sendQueryAndCapture(page, q, globalIndex, transport);

      // Inline Q1 health check
      if (globalIndex === 0) {
        const q1Ok = result.transport.httpStatus === 200 && result.sources.length > 0;
        console.log(
          `[TEST] Q1 health: HTTP=${result.transport.httpStatus}, ` +
          `sources=${result.sources.length}, status=${result.status} ` +
          `${q1Ok ? "✓ HEALTHY" : "✗ WARNING — docs may not be injected"}`
        );
      }

      console.log(
        `[TEST] Status: ${result.status} | HTTP: ${result.transport.httpStatus} | Duration: ${result.durationMs}ms`,
      );
      console.log(`[TEST] Response length: ${result.response.length} chars`);
      console.log(`[TEST] Sources: [${result.sources.join(", ")}]`);
      if (result.truncation) console.log(`[TEST] TRUNCATION: ${result.truncation}`);
      if (result.failureCode) console.log(`[TEST] FAILURE: ${result.failureCode}`);
      if (result.errorDetail) console.log(`[TEST] ERROR: ${result.errorDetail}`);

      results.push(result);

      // Write intermediate results after each query (crash resilience)
      fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify(buildReportPayload(results), null, 2),
      );

      // Brief pause between queries
      await page.waitForTimeout(1000);
    }

    // ── Summary ──
    const ok = results.filter((r) => r.status === "ok").length;
    const errors = results.filter((r) => r.status === "error").length;
    const timeouts = results.filter((r) => r.status === "timeout").length;
    const truncated = results.filter((r) => r.truncation).length;
    const withSources = results.filter((r) => r.sources.length > 0).length;
    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
    const httpErrors = results.filter(
      (r) => r.transport.httpStatus !== null && r.transport.httpStatus >= 400,
    ).length;

    console.log("\n═══════════════════════════════════");
    console.log("          TEST SUMMARY");
    console.log("═══════════════════════════════════");
    console.log(`Total queries:    ${results.length} (window ${runRangeStart}-${runRangeEnd})`);
    console.log(`Successful:       ${ok}`);
    console.log(`Errors:           ${errors}`);
    console.log(`  HTTP errors:    ${httpErrors}`);
    console.log(`Timeouts:         ${timeouts}`);
    console.log(`Truncated:        ${truncated}`);
    console.log(`With sources:     ${withSources}`);
    console.log(`Total duration:   ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`Avg per query:    ${(totalDuration / results.length / 1000).toFixed(1)}s`);
    console.log(`Report saved:     ${REPORT_FILE}`);
    console.log("═══════════════════════════════════");

    // ── Assertions ──
    // Error rate: fail if more than 5% of queries errored
    const errorRate = errors / results.length;
    console.log(`\n[GATE] Error rate: ${(errorRate * 100).toFixed(1)}% (threshold: 5%)`);
    expect(
      errorRate,
      `Error rate ${(errorRate * 100).toFixed(1)}% exceeds 5% threshold`,
    ).toBeLessThanOrEqual(0.05);

    // Source rate: for doc-grounded query blocks (Q1-Q9, Q10-Q34, Q35-Q50, Q51-Q84, Q85-Q100),
    // at least 50% of non-error queries should have sources
    const nonErrorResults = results.filter((r) => r.status === "ok");
    if (nonErrorResults.length > 0) {
      const sourceRate =
        nonErrorResults.filter((r) => r.sources.length > 0).length /
        nonErrorResults.length;
      console.log(
        `[GATE] Source rate (among ok queries): ${(sourceRate * 100).toFixed(1)}% (threshold: 50%)`,
      );
      expect(
        sourceRate,
        `Source rate ${(sourceRate * 100).toFixed(1)}% below 50% threshold — RAG not engaging`,
      ).toBeGreaterThanOrEqual(0.5);
    }
  });
});
