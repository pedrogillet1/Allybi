#!/usr/bin/env node
/**
 * Test runner: 5 conversations × 10 queries each against localhost.
 * Uses the non-streaming POST /api/chat/chat endpoint.
 *
 * Usage: node scripts/test-conversations.mjs
 */

const BASE = "https://localhost:5000/api";

// Disable TLS verification for self-signed local certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// ── Document IDs (test@koda.com) ──
const DOCS = {
  oba_marketing: "5471856b-b93f-4aae-b450-35b121cad140",
  scrum_cap8: "8938fa6a-730f-4d12-8d6a-4416ea9a6438",
  trabalho_projeto: "ee91764d-304d-4162-8c0b-826662ee70a3",
  guarda_bens_pptx: "ce276bc4-bed3-41c2-b965-05ceb9ea0913",
  anotacoes_aula2: "7d55ead0-4840-4537-94ee-913e2feb5bce",
  trabalho_final_png: "9adf1713-2991-49a1-92bd-94938d30df1e",
};

// ── Conversations ──
const CONVERSATIONS = [
  {
    title: "Conv1 — Marketing de Serviços",
    docIds: [DOCS.oba_marketing],
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
    title: "Conv2 — Framework Scrum",
    docIds: [DOCS.scrum_cap8],
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
    title: "Conv3 — Diagnóstico de Negócio",
    docIds: [DOCS.trabalho_projeto, DOCS.guarda_bens_pptx],
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
    title: "Conv4 — Síntese Aprendizado + Execução",
    docIds: [DOCS.anotacoes_aula2, DOCS.scrum_cap8, DOCS.guarda_bens_pptx],
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
    title: "Conv5 — Estratégia Comercial",
    docIds: [DOCS.oba_marketing, DOCS.trabalho_projeto, DOCS.trabalho_final_png],
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

// ── Helpers ──
async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function login() {
  const { status, data } = await post("/auth/login", {
    email: "test@koda.com",
    password: "test123",
  });
  if (status !== 200 || !data.accessToken) {
    console.error("Login failed:", status, data);
    process.exit(1);
  }
  return data.accessToken;
}

async function sendMessage(token, conversationId, message, docIds) {
  const body = {
    message,
    ...(conversationId ? { conversationId } : {}),
    ...(docIds?.length
      ? { attachedDocuments: docIds.map((id) => ({ id })) }
      : {}),
  };
  return post("/chat/chat", body, token);
}

function truncate(s, len = 80) {
  if (!s) return "(empty)";
  return s.length > len ? s.slice(0, len) + "..." : s;
}

// ── Main ──
async function main() {
  console.log("=".repeat(80));
  console.log("KODA CHAT TEST RUNNER — 5 conversations × 10 queries");
  console.log("=".repeat(80));

  const token = await login();
  console.log("\nLogged in as test@koda.com\n");

  const results = [];

  for (let ci = 0; ci < CONVERSATIONS.length; ci++) {
    const conv = CONVERSATIONS[ci];
    console.log(`\n${"─".repeat(70)}`);
    console.log(`CONVERSATION ${ci + 1}: ${conv.title}`);
    console.log(`Docs: ${conv.docIds.length} document(s)`);
    console.log(`${"─".repeat(70)}`);

    let conversationId = null;
    const convResults = [];

    for (let qi = 0; qi < conv.queries.length; qi++) {
      const query = conv.queries[qi];
      const isFirst = qi === 0;
      const startMs = Date.now();

      process.stdout.write(`  [${qi + 1}/10] ${truncate(query, 60)} ... `);

      try {
        const { status, data } = await sendMessage(
          token,
          conversationId,
          query,
          isFirst ? conv.docIds : [], // Only attach docs on first message
        );

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

        if (status === 200 && data.ok !== false) {
          // Extract conversationId from result
          const cid =
            data.data?.conversationId ||
            data.conversationId ||
            data.data?.conversation?.id;
          if (cid && !conversationId) {
            conversationId = cid;
          }

          const assistantText =
            data.data?.assistantText ||
            data.assistantMessage?.content ||
            data.data?.assistantMessage?.content ||
            "";

          console.log(`OK (${elapsed}s) — ${truncate(assistantText, 50)}`);
          convResults.push({ query: qi + 1, ok: true, elapsed, len: assistantText.length });
        } else {
          console.log(`FAIL (${elapsed}s) — status=${status} ${truncate(JSON.stringify(data), 60)}`);
          convResults.push({ query: qi + 1, ok: false, elapsed, error: data });
        }
      } catch (err) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`ERROR (${elapsed}s) — ${err.message}`);
        convResults.push({ query: qi + 1, ok: false, elapsed, error: err.message });
      }
    }

    const passed = convResults.filter((r) => r.ok).length;
    console.log(`\n  Result: ${passed}/10 passed`);
    results.push({ conversation: ci + 1, title: conv.title, passed, total: 10, conversationId });
  }

  // ── Summary ──
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}`);
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  for (const r of results) {
    const status = r.passed === r.total ? "PASS" : "FAIL";
    console.log(`  [${status}] Conv ${r.conversation}: ${r.title} — ${r.passed}/${r.total} (id: ${r.conversationId || "none"})`);
  }
  console.log(`\n  TOTAL: ${totalPassed}/50 queries passed`);
  console.log(`${"=".repeat(80)}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
