#!/usr/bin/env node
/**
 * run-conversation-tests.mjs
 *
 * Sends all 50 test queries through the chat API (same pipeline the frontend
 * ChatInterface.jsx uses, just non-streaming for reliable JSON parsing).
 *
 * Endpoint: POST /api/chat/chat
 * Collects: assistantText, answerMode, answerClass, sources, conversationId
 * Generates: test-results/test-conversations-results.md
 */

import https from "node:https";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://localhost:5000";
const EMAIL = "test@koda.com";
const PASSWORD = "test123";

// ── Test conversations ──────────────────────────────────────────────────────
const CONVERSATIONS = [
  {
    name: "Conv1 — Marketing de Serviços (1 doc)",
    expectedDocs: ["OBA marketing servicos", "OBA_marketing_servicos"],
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
    name: "Conv2 — Framework Scrum (1 doc)",
    expectedDocs: ["Capítulo 8", "Framework Scrum", "Capitulo 8"],
    queries: [
      "Usando o documento Capítulo 8 (Framework Scrum).pdf, resume esse capítulo de Scrum em linguagem de equipe, não acadêmica.",
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
    name: "Conv3 — Diagnóstico de Negócio (2 docs)",
    expectedDocs: ["Trabalho projeto", "guarda bens self storage"],
    queries: [
      "Usando os documentos Trabalho projeto.pdf e guarda bens self storage.pptx, me dá uma visão geral do negócio unindo esses dois documentos.",
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
    name: "Conv4 — Síntese Aprendizado + Execução (3 docs)",
    expectedDocs: [
      "Anotações Aula 2",
      "Anotacoes Aula 2",
      "Capítulo 8",
      "Framework Scrum",
      "guarda bens self storage",
    ],
    queries: [
      "Usando os documentos Anotações Aula 2 (1).pdf, Capítulo 8 (Framework Scrum).pdf e guarda bens self storage.pptx, faz um resumo integrado dos 3 arquivos em até 12 bullets.",
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
    name: "Conv5 — Estratégia Comercial (3 docs)",
    expectedDocs: [
      "OBA marketing servicos",
      "OBA_marketing_servicos",
      "Trabalho projeto",
      "TRABALHO FINAL",
      "TRABALHO_FINAL",
    ],
    queries: [
      "Usando os documentos OBA_marketing_servicos (1).pdf, Trabalho projeto.pdf e TRABALHO FINAL (1).PNG, integra os 3 materiais e me diz qual proposta de valor mais forte emerge.",
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

/** HTTPS JSON request ignoring self-signed certs (localhost dev) */
function request(urlPath, opts = {}) {
  const url = new URL(urlPath, BASE);
  return new Promise((resolve, reject) => {
    const reqOpts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
      rejectUnauthorized: false,
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

/** Login → accessToken */
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

/** Send a chat message (non-streaming) and return the full result */
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
  if (!json.ok) throw new Error(`API error: ${JSON.stringify(json).slice(0, 200)}`);
  return json.data;
}

/** Check if source filename matches any expected doc keyword */
function sourceMatchesExpected(filename, expectedDocs) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return expectedDocs.some((kw) => lower.includes(kw.toLowerCase()));
}

/** Truncate text to N chars */
function truncate(text, n = 500) {
  if (!text) return "(empty)";
  return text.length > n ? text.slice(0, n) + "…" : text;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const totalQueries = CONVERSATIONS.reduce((s, c) => s + c.queries.length, 0);

  console.log("=== Koda Chat Frontend Test Runner ===");
  console.log(`Target: ${BASE}`);
  console.log(`Account: ${EMAIL}`);
  console.log(`Conversations: ${CONVERSATIONS.length}`);
  console.log(`Total queries: ${totalQueries}`);
  console.log(`Endpoint: POST /api/chat/chat (same pipeline as frontend)\n`);

  // 1. Login
  console.log("[1/3] Logging in...");
  const token = await login();
  console.log("  ✓ Got access token\n");

  // 2. Run all conversations
  console.log("[2/3] Running conversations...\n");
  const results = [];
  let globalIdx = 0;

  for (let ci = 0; ci < CONVERSATIONS.length; ci++) {
    const conv = CONVERSATIONS[ci];
    console.log(`━━ ${conv.name} ━━`);

    let conversationId = undefined;
    const turnResults = [];

    for (let qi = 0; qi < conv.queries.length; qi++) {
      const query = conv.queries[qi];
      const turnNum = qi + 1;
      globalIdx++;
      process.stdout.write(
        `  Turn ${turnNum}/10 (${globalIdx}/${totalQueries}): ${query.slice(0, 55)}… `,
      );

      const startMs = Date.now();
      try {
        const data = await sendChat(token, query, conversationId);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

        // Capture conversationId from first response
        if (!conversationId && data.conversationId) {
          conversationId = data.conversationId;
        }

        const sources = data.sources || [];
        const answerMode = data.answerMode || "unknown";
        const answerClass = data.answerClass || "unknown";
        const content = data.assistantText || "";

        // Check source correctness
        const sourceFilenames = sources.map(
          (s) => s.fileName || s.filename || s.name || "unknown",
        );
        const allMatch =
          sources.length > 0 &&
          sourceFilenames.every((fn) =>
            sourceMatchesExpected(fn, conv.expectedDocs),
          );
        const unexpectedSources = sourceFilenames.filter(
          (fn) => !sourceMatchesExpected(fn, conv.expectedDocs),
        );

        let sourceCheck;
        if (sources.length === 0) {
          sourceCheck = `⚠️ No sources (answerMode: \`${answerMode}\`)`;
        } else if (allMatch) {
          sourceCheck = "✅ all sources match expected docs";
        } else {
          sourceCheck = `❌ unexpected source(s): ${unexpectedSources.join(", ")}`;
        }

        const icon = allMatch ? "✅" : sources.length === 0 ? "⚠️" : "❌";
        console.log(
          `${icon} ${elapsed}s | ${answerMode} | ${sources.length} src`,
        );

        turnResults.push({
          turn: turnNum,
          query,
          content,
          answerMode,
          answerClass,
          sources,
          sourceFilenames,
          sourceCheck,
          allMatch,
          unexpectedSources,
          conversationId: data.conversationId,
          messageId: data.assistantMessageId,
          elapsed,
        });
      } catch (err) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`✗ ERROR (${elapsed}s): ${err.message}`);
        turnResults.push({
          turn: turnNum,
          query,
          error: err.message,
          elapsed,
        });
      }
    }

    results.push({ conv, conversationId, turnResults });
    console.log();
  }

  // 3. Generate report
  console.log("[3/3] Generating report...");
  const report = generateReport(results);
  const outDir = path.resolve("test-results");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "test-conversations-results.md");
  fs.writeFileSync(outPath, report, "utf-8");
  console.log(`  ✓ Written to ${outPath}`);

  // Quick summary
  const totalTurns = results.reduce((s, r) => s + r.turnResults.length, 0);
  const matching = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => t.allMatch).length, 0,
  );
  const mismatched = results.reduce(
    (s, r) =>
      s + r.turnResults.filter((t) => !t.error && t.sources?.length > 0 && !t.allMatch).length,
    0,
  );
  const noSrc = results.reduce(
    (s, r) =>
      s + r.turnResults.filter((t) => !t.error && t.sources?.length === 0).length,
    0,
  );
  const errors = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => t.error).length, 0,
  );

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  ✅ Matching sources: ${matching}/${totalTurns}`);
  console.log(`  ❌ Mismatched sources: ${mismatched}/${totalTurns}`);
  console.log(`  ⚠️  No sources: ${noSrc}/${totalTurns}`);
  console.log(`  ✗  Errors: ${errors}/${totalTurns}`);
  console.log(`\nDone!`);
}

function generateReport(results) {
  const now = new Date().toISOString().slice(0, 10);
  const totalTurns = results.reduce((s, r) => s + r.turnResults.length, 0);
  const turnsWithSources = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => t.sources?.length > 0).length, 0,
  );
  const turnsMatching = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => t.allMatch).length, 0,
  );
  const turnsNoSources = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => !t.error && t.sources?.length === 0).length, 0,
  );
  const turnsMismatched = results.reduce(
    (s, r) =>
      s + r.turnResults.filter((t) => !t.error && t.sources?.length > 0 && !t.allMatch).length,
    0,
  );
  const turnsErrored = results.reduce(
    (s, r) => s + r.turnResults.filter((t) => t.error).length, 0,
  );

  let md = `# Koda Chat Test Results — Full with Sources

**Date:** ${now}
**Account:** ${EMAIL}
**Environment:** localhost:5000
**Total:** ${results.length} conversations, ${totalTurns} queries

---

`;

  const issueRows = [];

  for (const { conv, conversationId, turnResults } of results) {
    md += `## ${conv.name}\n\n`;
    md += `**Conversation ID:** \`${conversationId || "N/A"}\`\n`;
    md += `**Expected docs:** ${conv.expectedDocs.join(", ")}\n`;
    md += `**Messages:** ${turnResults.length * 2}\n\n`;

    for (const t of turnResults) {
      md += `### Turn ${t.turn}\n\n`;
      md += `**User:**\n\n> ${t.query}\n\n`;

      if (t.error) {
        md += `**Allybi:**\n\n⚠️ ERROR: ${t.error}\n\n`;
        md += `<details><summary><b>Sources & Metadata</b> (error)</summary>\n\n`;
        md += `| Field | Value |\n|-------|-------|\n`;
        md += `| error | \`${t.error}\` |\n`;
        md += `| elapsed | ${t.elapsed}s |\n\n`;
        md += `</details>\n\n---\n\n`;
        issueRows.push({
          conv: conv.name.slice(0, 32),
          turn: t.turn,
          issue: `error: ${t.error}`,
          sources: "—",
        });
        continue;
      }

      md += `**Allybi:**\n\n${truncate(t.content)}\n\n`;

      const srcCount = t.sources?.length || 0;
      md += `<details><summary><b>Sources & Metadata</b> (${srcCount} source${srcCount !== 1 ? "s" : ""})</summary>\n\n`;
      md += `| Field | Value |\n|-------|-------|\n`;
      md += `| answerMode | \`${t.answerMode}\` |\n`;
      md += `| answerClass | \`${t.answerClass}\` |\n`;
      md += `| sources count | ${srcCount} |\n`;
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
      } else {
        md += `*No sources returned for this response.*\n\n`;
      }

      md += `**Source check:** ${t.sourceCheck}\n\n`;
      md += `</details>\n\n---\n\n`;

      // Collect issues
      if (srcCount === 0 && !t.error) {
        issueRows.push({
          conv: conv.name.slice(0, 32),
          turn: t.turn,
          issue: `no sources (answerMode: ${t.answerMode})`,
          sources: "—",
        });
      } else if (!t.allMatch && srcCount > 0) {
        issueRows.push({
          conv: conv.name.slice(0, 32),
          turn: t.turn,
          issue: `unexpected source(s): ${t.unexpectedSources.join(", ")}`,
          sources: t.sourceFilenames.join(", "),
        });
      }
    }
  }

  // Verification Summary
  md += `## Verification Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total turns | ${totalTurns} |\n`;
  md += `| Turns with sources | ${turnsWithSources} |\n`;
  md += `| Turns with matching sources | ${turnsMatching} |\n`;
  md += `| Turns with NO sources | ${turnsNoSources} |\n`;
  md += `| Turns with mismatched sources | ${turnsMismatched} |\n`;
  md += `| Turns with errors | ${turnsErrored} |\n\n`;

  if (issueRows.length > 0) {
    md += `### Issues Found\n\n`;
    md += `| Conv | Turn | Issue | Sources |\n`;
    md += `|------|------|-------|---------|\n`;
    for (const row of issueRows) {
      md += `| ${row.conv} | ${row.turn} | ${row.issue} | ${row.sources} |\n`;
    }
    md += "\n";
  }

  return md;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
