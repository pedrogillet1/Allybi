#!/usr/bin/env node
/**
 * run-endurance-test.mjs
 *
 * Sends all 50 test queries through the chat API in a SINGLE conversation.
 * Tests that Allybi can maintain context, memory, and doc grounding across
 * a long conversation without forgetting previous queries or documents.
 *
 * Key differences from run-conversation-tests.mjs:
 * - One conversation, 50 turns (not 5 conversations × 10 turns)
 * - Each "phase" switches document context via explicit doc references
 * - Checks: source correctness, memory retention, no degradation over time
 *
 * Endpoint: POST /api/chat/chat
 * Output:   test-results/test-endurance-results.md
 */

import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://localhost:5000";
const EMAIL = "test@koda.com";
const PASSWORD = "test123";

// ── Phases (same queries as conversation tests, but run in 1 conversation) ──

const PHASES = [
  {
    name: "Phase 1 — Marketing de Serviços (1 doc)",
    expectedDocs: ["OBA marketing servicos", "OBA_marketing_servicos"],
    expectedDocGroups: [["OBA marketing servicos", "OBA_marketing_servicos"]],
    queries: [
      "Usando o documento OBA_marketing_servicos (1).pdf, me dá um resumo curto desse material em 8 bullets, sem enrolação.",
      "Agora faz uma tabela com: conceito, definição, exemplo prático e risco de aplicar mal.",
      "Quais são os 5 termos mais importantes do texto e por quê?",
      "Explica a parte mais difícil como se eu fosse iniciante.",
      "Quero um resumo executivo de 1 página, em português claro.",
      "Cria 10 perguntas de prova com gabarito com base nesse documento.",
      "Me mostra uma tabela comparando marketing de serviços vs marketing de produtos.",
      "Onde o documento é mais vago? Liste os pontos e o que faltou detalhar.",
      "Gera um plano de estudo de 7 dias baseado só nesse conteúdo.",
      "Fecha com um checklist prático para aplicar amanhã em um negócio local.",
    ],
  },
  {
    name: "Phase 2 — Framework Scrum (1 doc)",
    expectedDocs: ["Capítulo 8", "Framework Scrum", "Capitulo 8"],
    expectedDocGroups: [["Capítulo 8", "Capitulo 8", "Framework Scrum"]],
    queries: [
      "Agora muda de documento. Usando o documento Capítulo 8 (Framework Scrum).pdf, resume esse capítulo de Scrum em linguagem de equipe, não acadêmica.",
      "Faz uma tabela: papel no Scrum, responsabilidade, erro comum, métrica de sucesso.",
      "Explica rapidamente diferença entre Sprint Planning, Daily, Review e Retrospective.",
      "Cria um fluxo passo a passo de uma sprint completa.",
      "Quais antipadrões o texto sugere evitar?",
      "Gera uma tabela de artefatos Scrum com dono, frequência e finalidade.",
      "Me dá 8 perguntas que um PO deveria fazer antes de começar a sprint.",
      "Transforma em um guia de onboarding para novos membros do time.",
      "Faz um resumo em 120 palavras e outro em 350 palavras.",
      "Monta um plano de melhoria de 30 dias com ações semanais.",
    ],
  },
  {
    name: "Phase 3 — Diagnóstico de Negócio (2 docs)",
    expectedDocs: ["Trabalho projeto", "guarda bens self storage"],
    expectedDocGroups: [["Trabalho projeto"], ["guarda bens self storage"]],
    queries: [
      "Agora vamos usar dois documentos juntos. Usando os documentos Trabalho projeto.pdf e guarda bens self storage.pptx, me dá uma visão geral do negócio unindo esses dois documentos.",
      "Cria uma tabela com: problema atual, causa provável, impacto, proposta de solução.",
      "Quais processos operacionais aparecem com mais clareza no PPTX?",
      "No PDF do projeto, quais objetivos estratégicos são mais explícitos?",
      "Faz um comparativo entre o que foi planejado e o que parece executável.",
      "Quero uma matriz prioridade x esforço das ações sugeridas.",
      "Gera um resumo executivo para diretoria em tom objetivo.",
      "Cria uma tabela de KPIs: indicador, fórmula, periodicidade e meta inicial.",
      "Quais decisões dependem de dados que ainda não aparecem nesses arquivos?",
      "Fecha com um plano de 90 dias dividido em fase 1, 2 e 3.",
    ],
  },
  {
    name: "Phase 4 — Síntese Aprendizado + Execução (3 docs)",
    expectedDocs: [
      "Anotações Aula 2",
      "Anotacoes Aula 2",
      "Capítulo 8",
      "Framework Scrum",
      "guarda bens self storage",
    ],
    expectedDocGroups: [
      ["Anotações Aula 2", "Anotacoes Aula 2"],
      ["Capítulo 8", "Capitulo 8", "Framework Scrum"],
      ["guarda bens self storage"],
    ],
    queries: [
      "Agora vamos cruzar 3 documentos. Usando os documentos Anotações Aula 2 (1).pdf, Capítulo 8 (Framework Scrum).pdf e guarda bens self storage.pptx, faz um resumo integrado dos 3 arquivos em até 12 bullets.",
      "Cria uma tabela cruzando teoria (Scrum) com prática (PPTX) e insights das anotações.",
      "Quais pontos das anotações reforçam ou contradizem o capítulo de Scrum?",
      "Monta um roteiro de reunião de 45 min para transformar isso em plano de ação.",
      "Quero uma tabela de riscos: risco, sinal de alerta, prevenção, plano B.",
      "Extrai termos-chave dos 3 docs e monta um glossário com definição simples.",
      "Gera um backlog inicial com épicos e histórias de usuário.",
      "Me dá 10 perguntas de alinhamento para o time antes da execução.",
      "Cria uma versão 'explica como se eu fosse gestor não técnico'.",
      "Finaliza com próximos passos imediatos (hoje, semana, mês).",
    ],
  },
  {
    name: "Phase 5 — Estratégia Comercial (3 docs)",
    expectedDocs: [
      "OBA marketing servicos",
      "OBA_marketing_servicos",
      "Trabalho projeto",
      "TRABALHO FINAL",
      "TRABALHO_FINAL",
    ],
    expectedDocGroups: [
      ["OBA marketing servicos", "OBA_marketing_servicos"],
      ["Trabalho projeto"],
      ["TRABALHO FINAL", "TRABALHO_FINAL"],
    ],
    queries: [
      "Última fase. Usando os documentos OBA_marketing_servicos (1).pdf, Trabalho projeto.pdf e TRABALHO FINAL (1).PNG, integra os 3 materiais e me diz qual proposta de valor mais forte emerge.",
      "Faz uma tabela de persona: perfil, dor, objeção, argumento de venda.",
      "Do PNG, o que dá para extrair de informação útil para posicionamento?",
      "Cruza o conteúdo de marketing com o contexto real do projeto.",
      "Quais mensagens comerciais seriam mais convincentes com base nos docs?",
      "Monta uma tabela de canais: canal, objetivo, mensagem, KPI.",
      "Gera um resumo em tom de pitch de 2 minutos.",
      "Quero 3 versões de proposta comercial: conservadora, equilibrada, agressiva.",
      "Lista lacunas de informação que impedem uma estratégia 100% segura.",
      "Fecha com um plano de ação comercial de 30 dias com metas semanais.",
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function request(urlPath, opts = {}) {
  const url = new URL(urlPath, BASE);
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
    };
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("error", reject);
    req.setTimeout(180_000, () => {
      req.destroy(new Error("REQUEST_TIMEOUT"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function login() {
  const res = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = JSON.parse(res.body);
  if (!data.accessToken) throw new Error("Login failed: " + res.body);
  return data.accessToken;
}

async function sendChat(token, message, conversationId) {
  const payload = { message };
  if (conversationId) payload.conversationId = conversationId;

  const res = await request("/api/chat/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`);
  }

  const json = JSON.parse(res.body);
  if (!json.ok)
    throw new Error(`API error: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

function sourceMatchesExpected(filename, expectedDocs) {
  if (!filename) return false;
  const lower = normalizeText(filename)
    .replace(/\.[a-z]{2,5}$/, "")
    .trim();
  return expectedDocs.some((kw) => lower.includes(normalizeText(kw)));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/__/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExplicitDocCountHint(query) {
  const q = normalizeText(query);
  if (!q) return null;
  if (
    /\b(?:3|tres|três)\s+(?:docs?|documentos?|arquivos?|materiais?)\b/.test(q)
  ) {
    return 3;
  }
  if (/\b(?:2|dois)\s+(?:docs?|documentos?|arquivos?|materiais?)\b/.test(q)) {
    return 2;
  }
  return null;
}

function resolveRequiredDocGroups(query, expectedDocGroups) {
  if (!Array.isArray(expectedDocGroups) || expectedDocGroups.length <= 1) {
    return [];
  }
  const q = normalizeText(query);
  const explicitlyMentioned = expectedDocGroups.filter((group) =>
    group.some((alias) => q.includes(normalizeText(alias))),
  );
  if (explicitlyMentioned.length >= 2) return explicitlyMentioned;

  const explicitCount = extractExplicitDocCountHint(q);
  if (explicitCount !== null) {
    return expectedDocGroups.slice(
      0,
      Math.min(expectedDocGroups.length, explicitCount),
    );
  }

  const crossDocIntentRe = /\b(cruz|integr|unind|junt|compar|combina|cross)\w*/;
  if (crossDocIntentRe.test(q)) {
    return expectedDocGroups;
  }

  return [];
}

function evaluateSourceCoverage({
  query,
  sourceFilenames,
  expectedDocs,
  expectedDocGroups,
}) {
  const unexpectedSources = sourceFilenames.filter(
    (fn) => !sourceMatchesExpected(fn, expectedDocs),
  );
  const requiredGroups = resolveRequiredDocGroups(query, expectedDocGroups);
  const missingRequiredGroups = requiredGroups
    .filter(
      (group) =>
        !sourceFilenames.some((fn) =>
          group.some((alias) => sourceMatchesExpected(fn, [alias])),
        ),
    )
    .map((group) => String(group[0] || "unknown"));
  const allMatch =
    sourceFilenames.length > 0 &&
    unexpectedSources.length === 0 &&
    missingRequiredGroups.length === 0;
  return {
    allMatch,
    unexpectedSources,
    missingRequiredGroups,
    requiredGroupCount: requiredGroups.length,
  };
}

function checkSourcesConsistency(content, sourceFilenames) {
  if (!sourceFilenames || sourceFilenames.length === 0)
    return { ok: true, issue: null };

  const notProvidedRe =
    /(?:não foi fornecid|not (?:been )?provided|wasn't provided|not available in the context|não (?:foi )?(?:disponibilizad|encontrad))/gi;
  const refusalRe =
    /(?:não (?:inclui|contém|oferece|possui) (?:detalhes|informaç|conteúdo|dados)|não é possível (?:criar|gerar|produzir)|(?:it.?s )?not (?:possible|in the doc)|(?:não|nao) (?:pôde|pode) ser utilizad)/gi;

  const hasNotProvided = notProvidedRe.test(content);
  const hasRefusal = refusalRe.test(content);

  if (!hasNotProvided && !hasRefusal) return { ok: true, issue: null };

  // Check if any source filename appears in the content near a refusal
  for (const fn of sourceFilenames) {
    const shortName = fn.replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
    if (content.toLowerCase().includes(shortName.toLowerCase())) {
      return {
        ok: false,
        issue: `Claims "${shortName}" not provided but it's in sources`,
      };
    }
  }

  // If refusal pattern found + sources exist → generic contradiction
  if (hasRefusal && sourceFilenames.length > 0) {
    return {
      ok: false,
      issue: "Generic refusal despite having sources attached",
    };
  }

  return { ok: true, issue: null };
}

// Detects grounded refusals: LLM says document doesn't contain the requested info
const groundedRefusalRe =
  /(?:o\s+documento\s+não\s+(?:contém|possui|inclui|apresenta|traz)|(?:não\s+(?:há|existe[m]?|consta[m]?|foi\s+(?:encontrad|identificad)))\s+.*?\b(?:no|nos|nesse|nesses|neste|nestes|no\s+(?:documento|arquivo|material))|(?:the\s+document\s+does\s+not\s+(?:contain|include|have|provide|mention))|(?:(?:this|that)\s+(?:information|data|content)\s+(?:is\s+not|isn't)\s+(?:available|present|included)\s+in)|(?:não\s+(?:é\s+possível|foi\s+possível)\s+(?:extrair|identificar|encontrar).*?(?:com\s+base|a\s+partir))|(?:(?:not\s+enough|insufficient)\s+(?:information|data|evidence)\s+in\s+the\s+doc)|(?:não\s+há\s+informaç[õo]es?\s+(?:detalhad|explícit|específic|suficient))|(?:com\s+base\s+nos\s+documentos\s+fornecidos,?\s+não\s+há)|(?:based\s+on\s+the\s+(?:provided|available)\s+documents?,?\s+there\s+(?:is|are)\s+no))/i;

function checkFormatCompliance(query, content, attachments) {
  const wantsTable = /\b(tabela|tabla|table|comparativ[ao]|matriz)\b/i.test(
    query,
  );
  if (!wantsTable) return { ok: true, issue: null };

  // Check for table_data attachment
  if (Array.isArray(attachments)) {
    const hasTableAttachment = attachments.some(
      (a) =>
        a &&
        a.type === "table_data" &&
        Array.isArray(a.columns) &&
        a.rows?.length > 0,
    );
    if (hasTableAttachment) return { ok: true, issue: null };
  }

  // Validate GFM table structure (header + separator + at least 1 data row)
  const lines = content.split("\n");
  for (let i = 0; i < lines.length - 2; i++) {
    const l0 = lines[i].trim();
    const l1 = lines[i + 1].trim();
    const l2 = lines[i + 2].trim();
    if (
      /^\|.+\|$/.test(l0) && // header row
      /^\|[\s|:\-]+\|$/.test(l1) && // separator row
      /^\|.+\|$/.test(l2) // at least 1 data row
    ) {
      return { ok: true, issue: null };
    }
  }

  // Grounded refusal: LLM says document doesn't have the info → warning, not failure
  if (groundedRefusalRe.test(content)) {
    return {
      ok: true,
      issue: "Table requested but LLM gave grounded refusal (doc lacks data)",
      warning: true,
      refusal: true,
    };
  }

  return {
    ok: false,
    issue:
      "Table requested but no valid GFM table (header+separator+data) in response",
  };
}

function checkCompleteness(content) {
  if (!content || content.length < 20)
    return { ok: false, issue: "Response too short" };
  const trimmed = content.trim();
  // Reject ellipsis endings (mid-thought truncation)
  if (/[.…]{3,}$|…$/.test(trimmed))
    return { ok: false, issue: "Response ends with ellipsis (incomplete)" };
  const lastChar = trimmed[trimmed.length - 1];
  // Accept: punctuation, closing brackets, markdown formatting, table pipes, separators
  if (/[.!?)\]"*_\n|\-:;}`\d]/.test(lastChar)) return { ok: true, issue: null };
  // Accept trailing table rows or horizontal rules
  const lastLine = trimmed.split("\n").pop().trim();
  if (/^\|.*\|$/.test(lastLine)) return { ok: true, issue: null };
  if (/^[-=]{3,}$/.test(lastLine)) return { ok: true, issue: null };
  return { ok: false, issue: "Response appears truncated (ends mid-sentence)" };
}

function checkSourceLeakage(content) {
  const re =
    /^\s*[-*•]\s+(?:\*{1,2})?(?:Sources?|Fontes?|Fuentes?|References?|Refer[eê]ncias?):?(?:\*{1,2})?\s*:?\s+.*\.(pdf|xlsx?|docx?|pptx?|csv|txt|png|jpe?g)\b/gim;
  const matches = content.match(re) || [];
  if (matches.length === 0) return { ok: true, issue: null };
  return {
    ok: false,
    issue: `${matches.length} inline source citation(s) leaked`,
  };
}

function extractKeyPhrases(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(extractKeyPhrases(a));
  const setB = new Set(extractKeyPhrases(b));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

function checkAnswerRelevance(content, query, allPreviousResults) {
  // Check: Response is nearly identical to a previous turn's response (stuck loop)
  if (allPreviousResults && allPreviousResults.length > 0) {
    for (const prev of allPreviousResults.slice(-5)) {
      if (!prev.content) continue;
      const similarity = jaccardSimilarity(
        prev.content.slice(0, 500),
        content.slice(0, 500),
      );
      if (similarity > 0.7) {
        return {
          ok: false,
          issue: `Response too similar to Turn ${prev.globalTurn} (${(similarity * 100).toFixed(0)}% overlap)`,
        };
      }
    }
  }

  return { ok: true, issue: null };
}

function checkThematicDrift(query, content) {
  const deliverableRe =
    /\b(tabela|table|resumo|summary|plano|plan|perguntas|questions|backlog|glossário|glossary|checklist|roteiro|guia|guide|pitch|proposta|fluxo|flow|matriz|bullets?|comparativ[ao])\b/i;
  const vaguenessCritiqueRe =
    /\b((?:mais\s+)?vago|faltou\s+detalhar|o\s+que\s+faltou|ponto\s+vago|pontos?\s+onde.*vag|where.*vague|lacks?\s+detail)\b/i;

  if (!deliverableRe.test(query)) return { ok: true, issue: null };
  if (!vaguenessCritiqueRe.test(content.slice(0, 300)))
    return { ok: true, issue: null };

  return {
    ok: false,
    issue:
      "Response discusses document gaps/vagueness instead of producing the requested deliverable",
  };
}

function truncate(text, n = 4000) {
  if (!text) return "(empty)";
  return text.length > n ? text.slice(0, n) + "…" : text;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const totalQueries = PHASES.reduce((s, p) => s + p.queries.length, 0);

  console.log("=== Koda Endurance Test — Single Conversation ===");
  console.log(`Target: ${BASE}`);
  console.log(`Account: ${EMAIL}`);
  console.log(`Phases: ${PHASES.length}`);
  console.log(`Total queries: ${totalQueries} (all in 1 conversation)`);
  console.log(`Endpoint: POST /api/chat/chat\n`);

  // 1. Login
  console.log("[1/3] Logging in...");
  const token = await login();
  console.log("  ✓ Got access token\n");

  // 2. Run all queries in a single conversation
  console.log("[2/3] Running endurance test...\n");

  let conversationId = undefined;
  let globalIdx = 0;
  const allResults = [];
  const phaseTimings = [];

  for (let pi = 0; pi < PHASES.length; pi++) {
    const phase = PHASES[pi];
    const phaseStart = Date.now();
    console.log(`━━ ${phase.name} ━━`);

    for (let qi = 0; qi < phase.queries.length; qi++) {
      const query = phase.queries[qi];
      globalIdx++;
      process.stdout.write(
        `  Turn ${globalIdx}/${totalQueries}: ${query.slice(0, 55)}… `,
      );

      const startMs = Date.now();
      try {
        const data = await sendChat(token, query, conversationId);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

        if (!conversationId && data.conversationId) {
          conversationId = data.conversationId;
        }

        const sources = data.sources || [];
        const answerMode = data.answerMode || "unknown";
        const answerClass = data.answerClass || "unknown";
        const content = data.assistantText || "";
        const truncation = data.truncation || { occurred: false };
        const providerTruncation = Boolean(data.truncation?.providerOccurred);

        const sourceFilenames = sources.map(
          (s) => s.fileName || s.filename || s.name || "unknown",
        );
        const coverage = evaluateSourceCoverage({
          query,
          sourceFilenames,
          expectedDocs: phase.expectedDocs,
          expectedDocGroups: phase.expectedDocGroups || [phase.expectedDocs],
        });
        const allMatch = coverage.allMatch;
        const unexpectedSources = coverage.unexpectedSources;
        const missingRequiredGroups = coverage.missingRequiredGroups;

        let sourceCheck;
        if (sources.length === 0) {
          sourceCheck = `⚠️ No sources (answerMode: \`${answerMode}\`)`;
        } else if (allMatch) {
          if (coverage.requiredGroupCount > 1) {
            sourceCheck = `✅ source coverage complete across ${coverage.requiredGroupCount} required docs`;
          } else {
            sourceCheck = "✅ all sources match expected docs";
          }
        } else if (
          missingRequiredGroups.length > 0 &&
          unexpectedSources.length > 0
        ) {
          sourceCheck = `❌ missing expected docs: ${missingRequiredGroups.join(", ")}; unexpected source(s): ${unexpectedSources.join(", ")}`;
        } else if (missingRequiredGroups.length > 0) {
          sourceCheck = `❌ missing expected docs: ${missingRequiredGroups.join(", ")}`;
        } else {
          sourceCheck = `❌ unexpected source(s): ${unexpectedSources.join(", ")}`;
        }

        // Quality checks
        const qcConsistency = checkSourcesConsistency(content, sourceFilenames);
        const qcFormat = checkFormatCompliance(
          query,
          content,
          data.attachmentsPayload || data.attachments || [],
        );
        const qcCompleteness = checkCompleteness(content);
        const qcLeakage = checkSourceLeakage(content);
        const qcRelevance = checkAnswerRelevance(content, query, allResults);
        const qcDrift = checkThematicDrift(query, content);

        const truncBadge = truncation.occurred
          ? " TRUNCATED"
          : providerTruncation
            ? " PROVIDER_TRUNC"
            : "";
        const qcBadges = [
          !qcConsistency.ok ? "CONTRADICT" : "",
          qcFormat.refusal ? "REFUSAL" : !qcFormat.ok ? "NO_TABLE" : "",
          !qcCompleteness.ok ? "INCOMPLETE" : "",
          !qcLeakage.ok ? "LEAK" : "",
          !qcRelevance.ok ? "STUCK" : "",
          !qcDrift.ok ? "DRIFT" : "",
        ]
          .filter(Boolean)
          .join(",");
        const icon = allMatch ? "✅" : sources.length === 0 ? "⚠️" : "❌";
        console.log(
          `${icon} ${elapsed}s | ${answerMode} | ${sources.length} src${truncBadge}${qcBadges ? " " + qcBadges : ""}`,
        );

        allResults.push({
          globalTurn: globalIdx,
          phase: phase.name,
          phaseIdx: pi,
          query,
          content,
          answerMode,
          answerClass,
          sources,
          sourceFilenames,
          sourceCheck,
          allMatch,
          unexpectedSources,
          missingRequiredGroups,
          truncation,
          providerTruncation,
          conversationId: data.conversationId,
          elapsed,
          qcConsistency,
          qcFormat,
          qcCompleteness,
          qcLeakage,
          qcRelevance,
          qcDrift,
        });
      } catch (err) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`✗ ERROR (${elapsed}s): ${err.message}`);
        allResults.push({
          globalTurn: globalIdx,
          phase: phase.name,
          phaseIdx: pi,
          query,
          error: err.message,
          elapsed,
        });
      }
    }

    const phaseElapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
    phaseTimings.push({ name: phase.name, elapsed: phaseElapsed });
    console.log(`  ⏱ Phase total: ${phaseElapsed}s\n`);
  }

  // 3. Generate report
  console.log("[3/3] Generating report...");
  const report = generateReport(allResults, conversationId, phaseTimings);
  const outDir = path.resolve("test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "test-endurance-results.md");
  fs.writeFileSync(outPath, report, "utf-8");
  console.log(`  ✓ Written to ${outPath}`);

  // Summary
  const matching = allResults.filter((t) => t.allMatch).length;
  const mismatched = allResults.filter(
    (t) => !t.error && t.sources?.length > 0 && !t.allMatch,
  ).length;
  const noSrc = allResults.filter(
    (t) => !t.error && t.sources?.length === 0,
  ).length;
  const errors = allResults.filter((t) => t.error).length;
  const truncated = allResults.filter((t) => t.truncation?.occurred).length;
  const providerTruncated = allResults.filter(
    (t) => t.providerTruncation,
  ).length;
  const totalTime = phaseTimings
    .reduce((s, p) => s + parseFloat(p.elapsed), 0)
    .toFixed(1);

  // Quality check aggregates
  const successResults = allResults.filter((t) => !t.error);
  const consistencyOk = successResults.filter(
    (t) => t.qcConsistency?.ok,
  ).length;
  const formatOk = successResults.filter((t) => t.qcFormat?.ok).length;
  const formatRefusals = successResults.filter(
    (t) => t.qcFormat?.refusal,
  ).length;
  const completenessOk = successResults.filter(
    (t) => t.qcCompleteness?.ok,
  ).length;
  const leakageOk = successResults.filter((t) => t.qcLeakage?.ok).length;
  const relevanceOk = successResults.filter((t) => t.qcRelevance?.ok).length;
  const driftOk = successResults.filter((t) => t.qcDrift?.ok !== false).length;

  console.log(`\n═══ ENDURANCE SUMMARY ═══`);
  console.log(`  🆔 Conversation ID: ${conversationId || "N/A"}`);
  console.log(`  ⏱  Total time: ${totalTime}s`);
  console.log(`  ✅ Matching sources: ${matching}/${totalQueries}`);
  console.log(`  ❌ Mismatched sources: ${mismatched}/${totalQueries}`);
  console.log(`  ⚠️  No sources: ${noSrc}/${totalQueries}`);
  console.log(`  ✗  Errors: ${errors}/${totalQueries}`);
  console.log(`  ✂️  Truncated: ${truncated}/${totalQueries}`);
  console.log(`  🧭 Provider truncation: ${providerTruncated}/${totalQueries}`);

  console.log(`\n  Quality checks:`);
  console.log(
    `    Sources consistency: ${consistencyOk}/${successResults.length}`,
  );
  console.log(
    `    Format compliance:   ${formatOk}/${successResults.length}${formatRefusals > 0 ? ` (${formatRefusals} grounded refusal${formatRefusals > 1 ? "s" : ""})` : ""}`,
  );
  console.log(
    `    Completeness:        ${completenessOk}/${successResults.length}`,
  );
  console.log(`    Source leakage:      ${leakageOk}/${successResults.length}`);
  console.log(
    `    Answer relevance:    ${relevanceOk}/${successResults.length}`,
  );
  console.log(`    Thematic drift:      ${driftOk}/${successResults.length}`);

  // Per-phase breakdown
  console.log(`\n  Per-phase breakdown:`);
  for (const phase of PHASES) {
    const pResults = allResults.filter((r) => r.phase === phase.name);
    const pMatch = pResults.filter((r) => r.allMatch).length;
    const pErr = pResults.filter((r) => r.error).length;
    const pTrunc = pResults.filter((r) => r.truncation?.occurred).length;
    const pProviderTrunc = pResults.filter((r) => r.providerTruncation).length;
    const avgElapsed =
      pResults
        .filter((r) => !r.error)
        .reduce((s, r) => s + parseFloat(r.elapsed), 0) /
      Math.max(1, pResults.filter((r) => !r.error).length);
    console.log(
      `    ${phase.name}: ${pMatch}/${pResults.length} match | ${pErr} err | ${pTrunc} trunc | ${pProviderTrunc} provider | avg ${avgElapsed.toFixed(1)}s`,
    );
  }

  // Latency trend (detect degradation)
  const first10 = allResults.slice(0, 10).filter((r) => !r.error);
  const last10 = allResults.slice(-10).filter((r) => !r.error);
  const avgFirst =
    first10.reduce((s, r) => s + parseFloat(r.elapsed), 0) /
    Math.max(1, first10.length);
  const avgLast =
    last10.reduce((s, r) => s + parseFloat(r.elapsed), 0) /
    Math.max(1, last10.length);
  const degradation = ((avgLast - avgFirst) / avgFirst) * 100;

  console.log(
    `\n  Latency trend: first 10 avg ${avgFirst.toFixed(1)}s → last 10 avg ${avgLast.toFixed(1)}s (${degradation > 0 ? "+" : ""}${degradation.toFixed(0)}%)`,
  );
  if (degradation > 50) {
    console.log(`  ⚠️  Significant latency degradation detected!`);
  } else if (degradation > 20) {
    console.log(`  ⚠️  Moderate latency increase detected.`);
  } else {
    console.log(`  ✅ No significant latency degradation.`);
  }

  if (truncated > 0) {
    console.log(
      `\n⚠️  ${truncated} response(s) were truncated — investigate token limits.`,
    );
  }

  // Truncation rate gates
  const totalExecutedQueries = allResults.length;
  if (totalExecutedQueries > 0) {
    const truncationRate = truncated / totalExecutedQueries;
    if (truncationRate > 0.05) {
      console.log(
        `\n❌ FAIL: Truncation rate ${(truncationRate * 100).toFixed(1)}% exceeds 5% threshold (${truncated}/${totalExecutedQueries}).`,
      );
      process.exit(1);
    }

    const providerTruncated = allResults.filter(
      (r) => r.providerTruncation,
    ).length;
    const providerTruncationRate = providerTruncated / totalExecutedQueries;
    if (providerTruncationRate > 0.1) {
      console.log(
        `\n❌ FAIL: Provider truncation rate ${(providerTruncationRate * 100).toFixed(1)}% exceeds 10% threshold (${providerTruncated}/${totalExecutedQueries}).`,
      );
      process.exit(1);
    }
  }

  console.log(`\nDone!`);
}

function generateReport(allResults, conversationId, phaseTimings) {
  const now = new Date().toISOString().slice(0, 10);
  const totalTurns = allResults.length;

  let md = `# Koda Endurance Test — Single Conversation (${totalTurns} turns)

**Date:** ${now}
**Account:** ${EMAIL}
**Environment:** localhost:5000
**Conversation ID:** \`${conversationId || "N/A"}\`
**Total turns:** ${totalTurns} (all in 1 conversation)
**Test type:** Memory & context retention across long conversation

---

`;

  // Phase timings
  md += `## Phase Timings\n\n`;
  md += `| Phase | Time |\n|-------|------|\n`;
  for (const pt of phaseTimings) {
    md += `| ${pt.name} | ${pt.elapsed}s |\n`;
  }
  md += `\n---\n\n`;

  const issueRows = [];
  let currentPhase = null;

  for (const t of allResults) {
    if (t.phase !== currentPhase) {
      currentPhase = t.phase;
      md += `## ${t.phase}\n\n`;
    }

    md += `### Turn ${t.globalTurn}\n\n`;
    md += `**User:**\n\n> ${t.query}\n\n`;

    if (t.error) {
      md += `**Allybi:**\n\n⚠️ ERROR: ${t.error}\n\n`;
      md += `<details><summary><b>Metadata</b> (error)</summary>\n\n`;
      md += `| Field | Value |\n|-------|-------|\n`;
      md += `| error | \`${t.error}\` |\n`;
      md += `| elapsed | ${t.elapsed}s |\n`;
      md += `| globalTurn | ${t.globalTurn} |\n\n`;
      md += `</details>\n\n---\n\n`;
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `error: ${t.error}`,
      });
      continue;
    }

    md += `**Allybi:**\n\n${truncate(t.content)}\n\n`;

    const srcCount = t.sources?.length || 0;
    md += `<details><summary><b>Sources & Metadata</b> (${srcCount} source${srcCount !== 1 ? "s" : ""})</summary>\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| globalTurn | ${t.globalTurn} |\n`;
    md += `| answerMode | \`${t.answerMode}\` |\n`;
    md += `| answerClass | \`${t.answerClass}\` |\n`;
    md += `| sources count | ${srcCount} |\n`;
    md += `| truncated | ${t.truncation?.occurred ? "**YES**" : "no"} |\n`;
    md += `| elapsed | ${t.elapsed}s |\n\n`;

    if (srcCount > 0) {
      md += `| # | Filename | Page | Document ID |\n`;
      md += `|---|----------|------|-------------|\n`;
      t.sources.forEach((s, i) => {
        const fn = s.fileName || s.filename || s.name || "unknown";
        const pg = s.page ?? s.pageNumber ?? "—";
        const docId = s.documentId
          ? `\`${String(s.documentId).slice(0, 11)}…\``
          : "—";
        md += `| ${i + 1} | ${fn} | ${pg} | ${docId} |\n`;
      });
      md += "\n";
    }

    md += `**Source check:** ${t.sourceCheck}\n\n`;

    // Quality checks per turn
    const qcItems = [];
    if (t.qcConsistency && !t.qcConsistency.ok)
      qcItems.push(`Consistency: ${t.qcConsistency.issue}`);
    if (t.qcFormat && !t.qcFormat.ok)
      qcItems.push(`Format: ${t.qcFormat.issue}`);
    if (t.qcCompleteness && !t.qcCompleteness.ok)
      qcItems.push(`Completeness: ${t.qcCompleteness.issue}`);
    if (t.qcLeakage && !t.qcLeakage.ok)
      qcItems.push(`Leakage: ${t.qcLeakage.issue}`);
    if (t.qcRelevance && !t.qcRelevance.ok)
      qcItems.push(`Relevance: ${t.qcRelevance.issue}`);
    if (t.qcDrift && !t.qcDrift.ok) qcItems.push(`Drift: ${t.qcDrift.issue}`);
    if (qcItems.length > 0) {
      md += `**Quality issues:** ${qcItems.join(" | ")}\n\n`;
    }

    md += `</details>\n\n---\n\n`;

    if (t.truncation?.occurred) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `TRUNCATED`,
      });
    }
    if (srcCount === 0 && !t.error) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `no sources (${t.answerMode})`,
      });
    } else if (!t.allMatch && srcCount > 0) {
      const coverageIssue =
        t.missingRequiredGroups?.length > 0
          ? `missing: ${t.missingRequiredGroups.join(", ")}`
          : null;
      const unexpectedIssue =
        t.unexpectedSources?.length > 0
          ? `unexpected: ${t.unexpectedSources.join(", ")}`
          : null;
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: [coverageIssue, unexpectedIssue].filter(Boolean).join(" | "),
      });
    }
    if (t.qcConsistency && !t.qcConsistency.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `CONTRADICTION: ${t.qcConsistency.issue}`,
      });
    }
    if (t.qcFormat && t.qcFormat.refusal) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `REFUSAL (warning): ${t.qcFormat.issue}`,
      });
    } else if (t.qcFormat && !t.qcFormat.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `FORMAT: ${t.qcFormat.issue}`,
      });
    }
    if (t.qcCompleteness && !t.qcCompleteness.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `INCOMPLETE: ${t.qcCompleteness.issue}`,
      });
    }
    if (t.qcLeakage && !t.qcLeakage.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `LEAKAGE: ${t.qcLeakage.issue}`,
      });
    }
    if (t.qcRelevance && !t.qcRelevance.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `STUCK: ${t.qcRelevance.issue}`,
      });
    }
    if (t.qcDrift && !t.qcDrift.ok) {
      issueRows.push({
        turn: t.globalTurn,
        phase: t.phase.slice(0, 20),
        issue: `DRIFT: ${t.qcDrift.issue}`,
      });
    }
  }

  // Summary tables
  const matching = allResults.filter((t) => t.allMatch).length;
  const mismatched = allResults.filter(
    (t) => !t.error && t.sources?.length > 0 && !t.allMatch,
  ).length;
  const noSrc = allResults.filter(
    (t) => !t.error && t.sources?.length === 0,
  ).length;
  const errors = allResults.filter((t) => t.error).length;
  const truncated = allResults.filter((t) => t.truncation?.occurred).length;

  // Quality check aggregates for report
  const successRes = allResults.filter((t) => !t.error);
  const rConsistencyOk = successRes.filter((t) => t.qcConsistency?.ok).length;
  const rFormatOk = successRes.filter((t) => t.qcFormat?.ok).length;
  const rFormatRefusals = successRes.filter((t) => t.qcFormat?.refusal).length;
  const rCompletenessOk = successRes.filter((t) => t.qcCompleteness?.ok).length;
  const rLeakageOk = successRes.filter((t) => t.qcLeakage?.ok).length;
  const rRelevanceOk = successRes.filter((t) => t.qcRelevance?.ok).length;
  const rDriftOk = successRes.filter((t) => t.qcDrift?.ok !== false).length;

  md += `## Verification Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total turns | ${totalTurns} |\n`;
  md += `| Matching sources | ${matching} |\n`;
  md += `| Mismatched sources | ${mismatched} |\n`;
  md += `| No sources | ${noSrc} |\n`;
  md += `| Errors | ${errors} |\n`;
  md += `| Truncated | ${truncated} |\n`;
  md += `| Sources consistency | ${rConsistencyOk}/${successRes.length} |\n`;
  md += `| Format compliance | ${rFormatOk}/${successRes.length}${rFormatRefusals > 0 ? ` (${rFormatRefusals} grounded refusal${rFormatRefusals > 1 ? "s" : ""})` : ""} |\n`;
  md += `| Completeness | ${rCompletenessOk}/${successRes.length} |\n`;
  md += `| Source leakage | ${rLeakageOk}/${successRes.length} |\n`;
  md += `| Answer relevance | ${rRelevanceOk}/${successRes.length} |\n`;
  md += `| Thematic drift | ${rDriftOk}/${successRes.length} |\n\n`;

  // Latency per turn (for trend analysis)
  md += `## Latency Trend\n\n`;
  md += `| Turn | Phase | Elapsed | Status |\n`;
  md += `|------|-------|---------|--------|\n`;
  for (const t of allResults) {
    const status = t.error
      ? "❌ error"
      : t.truncation?.occurred
        ? "✂️ truncated"
        : t.allMatch
          ? "✅"
          : "⚠️ mismatch";
    md += `| ${t.globalTurn} | ${t.phase.slice(0, 20)} | ${t.elapsed}s | ${status} |\n`;
  }
  md += "\n";

  if (issueRows.length > 0) {
    md += `## Issues Found\n\n`;
    md += `| Turn | Phase | Issue |\n`;
    md += `|------|-------|-------|\n`;
    for (const row of issueRows) {
      md += `| ${row.turn} | ${row.phase} | ${row.issue} |\n`;
    }
    md += "\n";
  }

  return md;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
