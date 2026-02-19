#!/usr/bin/env node
/**
 * Export conversations with full source verification.
 */
import { writeFileSync, mkdirSync } from "fs";

const BASE = "https://localhost:5000/api";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONV_IDS = [
  {
    id: "7cb9445b-db09-4c24-9535-a75bcebef994",
    title: "Conv1 — Marketing de Serviços (1 doc)",
    expectedDocs: ["OBA marketing servicos", "OBA_marketing_servicos"],
  },
  {
    id: "d2108dda-52d2-404f-8961-27afdd701686",
    title: "Conv2 — Framework Scrum (1 doc)",
    expectedDocs: ["Capítulo 8", "Framework Scrum", "Capitulo 8"],
  },
  {
    id: "709b5c38-9b12-49ee-ade2-006809df05d6",
    title: "Conv3 — Diagnóstico de Negócio (2 docs)",
    expectedDocs: ["Trabalho projeto", "guarda bens self storage"],
  },
  {
    id: "15a65252-187f-45ca-949a-f4685c1f3c59",
    title: "Conv4 — Síntese Aprendizado + Execução (3 docs)",
    expectedDocs: ["Anotações Aula 2", "Anotacoes Aula 2", "Capítulo 8", "Framework Scrum", "guarda bens self storage"],
  },
  {
    id: "a4eee7bd-e24b-44c9-938c-677f60021ba1",
    title: "Conv5 — Estratégia Comercial (3 docs)",
    expectedDocs: ["OBA marketing servicos", "OBA_marketing_servicos", "Trabalho projeto", "TRABALHO FINAL", "TRABALHO_FINAL"],
  },
];

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@koda.com", password: "test123" }),
  });
  return (await res.json()).accessToken;
}

async function getConversation(token, convId) {
  const res = await fetch(`${BASE}/chat/conversations/${convId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function parseMeta(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function formatSource(src) {
  const parts = [];
  if (src.filename) parts.push(src.filename);
  if (src.page != null) parts.push(`p.${src.page}`);
  if (src.chunkIndex != null) parts.push(`chunk ${src.chunkIndex}`);
  if (src.score != null) parts.push(`score: ${src.score}`);
  return parts.join(" | ") || JSON.stringify(src);
}

function norm(s) {
  return s.toLowerCase().replace(/[_\-().\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function sourceMatchesExpected(sources, expectedDocs) {
  if (!sources || sources.length === 0) return { match: false, reason: "no sources" };
  const filenames = sources.map((s) => s.filename || "").filter(Boolean);
  const unexpected = filenames.filter(
    (fn) => !expectedDocs.some((exp) => norm(fn).includes(norm(exp)))
  );
  if (unexpected.length > 0) {
    return { match: false, reason: `unexpected source(s): ${unexpected.join(", ")}` };
  }
  return { match: true, reason: "all sources match expected docs" };
}

async function main() {
  const outDir = "/Users/pg/Desktop/koda-webapp/test-results";
  mkdirSync(outDir, { recursive: true });

  const token = await login();
  const lines = [];
  let totalTurns = 0;
  let sourcedTurns = 0;
  let matchedTurns = 0;
  let noSourceTurns = 0;
  const issues = [];

  lines.push("# Koda Chat Test Results — Full with Sources");
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Account:** test@koda.com`);
  lines.push(`**Environment:** localhost:5000`);
  lines.push(`**Total:** 5 conversations, 50 queries`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const conv of CONV_IDS) {
    console.log(`Fetching ${conv.title}...`);
    const raw = await getConversation(token, conv.id);
    const data = raw.data || raw;
    const messages = data.messages || [];

    lines.push(`## ${conv.title}`);
    lines.push("");
    lines.push(`**Conversation ID:** \`${conv.id}\``);
    lines.push(`**Expected docs:** ${conv.expectedDocs.join(", ")}`);
    lines.push(`**Messages:** ${messages.length}`);
    lines.push("");

    let turnNum = 0;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        turnNum++;
        totalTurns++;
        lines.push(`### Turn ${turnNum}`);
        lines.push("");
        lines.push("**User:**");
        lines.push("");
        lines.push(`> ${(msg.content || "(empty)").replace(/\n/g, "\n> ")}`);
        lines.push("");
      } else if (msg.role === "assistant") {
        const meta = parseMeta(msg.metadata);
        const sources = meta.sources || [];
        const answerMode = meta.answerMode || "unknown";
        const answerClass = meta.answerClass || null;

        lines.push("**Allybi:**");
        lines.push("");
        lines.push(msg.content || "(empty)");
        lines.push("");

        // Source pills
        lines.push(`<details><summary><b>Sources & Metadata</b> (${sources.length} source${sources.length !== 1 ? "s" : ""})</summary>`);
        lines.push("");
        lines.push(`| Field | Value |`);
        lines.push(`|-------|-------|`);
        lines.push(`| answerMode | \`${answerMode}\` |`);
        if (answerClass) lines.push(`| answerClass | \`${answerClass}\` |`);
        lines.push(`| sources count | ${sources.length} |`);
        lines.push("");

        if (sources.length > 0) {
          sourcedTurns++;
          lines.push("| # | Filename | Page | Document ID |");
          lines.push("|---|----------|------|-------------|");
          for (let si = 0; si < sources.length; si++) {
            const s = sources[si];
            lines.push(
              `| ${si + 1} | ${s.filename || "?"} | ${s.page ?? "—"} | \`${(s.documentId || "?").slice(0, 12)}…\` |`
            );
          }
          lines.push("");

          // Verify sources match expected docs
          const check = sourceMatchesExpected(sources, conv.expectedDocs);
          if (check.match) {
            matchedTurns++;
            lines.push(`**Source check:** ✅ ${check.reason}`);
          } else {
            lines.push(`**Source check:** ❌ ${check.reason}`);
            issues.push({
              conv: conv.title,
              turn: turnNum,
              reason: check.reason,
              sources: sources.map((s) => s.filename),
            });
          }
        } else {
          noSourceTurns++;
          lines.push("*No sources returned for this response.*");
          lines.push("");
          lines.push(`**Source check:** ⚠️ No sources (answerMode: \`${answerMode}\`)`);
          issues.push({
            conv: conv.title,
            turn: turnNum,
            reason: `no sources (answerMode: ${answerMode})`,
            sources: [],
          });
        }

        lines.push("");
        lines.push("</details>");
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }
  }

  // ── Verification Summary ──
  lines.push("## Verification Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total turns | ${totalTurns} |`);
  lines.push(`| Turns with sources | ${sourcedTurns} |`);
  lines.push(`| Turns with matching sources | ${matchedTurns} |`);
  lines.push(`| Turns with NO sources | ${noSourceTurns} |`);
  lines.push(`| Turns with mismatched sources | ${issues.filter((i) => !i.reason.startsWith("no sources")).length} |`);
  lines.push("");

  if (issues.length > 0) {
    lines.push("### Issues Found");
    lines.push("");
    lines.push("| Conv | Turn | Issue | Sources |");
    lines.push("|------|------|-------|---------|");
    for (const iss of issues) {
      lines.push(
        `| ${iss.conv.slice(0, 30)} | ${iss.turn} | ${iss.reason} | ${iss.sources.join(", ") || "—"} |`
      );
    }
    lines.push("");
  } else {
    lines.push("**All source pills verified correctly.**");
  }

  const md = lines.join("\n");
  const outPath = `${outDir}/test-conversations-results.md`;
  writeFileSync(outPath, md, "utf8");
  console.log(`\nWritten to: ${outPath}`);
  console.log(`Size: ${(md.length / 1024).toFixed(1)} KB`);
  console.log(`\nVerification: ${matchedTurns}/${totalTurns} turns have correct sources`);
  console.log(`No-source turns: ${noSourceTurns}`);
  if (issues.length) {
    console.log(`\nISSUES (${issues.length}):`);
    for (const iss of issues) {
      console.log(`  ${iss.conv} turn ${iss.turn}: ${iss.reason}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
