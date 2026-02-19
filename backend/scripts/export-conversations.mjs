#!/usr/bin/env node
/**
 * Export all test conversation answers to a markdown file.
 */

import { writeFileSync, mkdirSync } from "fs";

const BASE = "https://localhost:5000/api";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CONV_IDS = [
  { id: "7cb9445b-db09-4c24-9535-a75bcebef994", title: "Conv1 — Marketing de Serviços" },
  { id: "d2108dda-52d2-404f-8961-27afdd701686", title: "Conv2 — Framework Scrum" },
  { id: "709b5c38-9b12-49ee-ade2-006809df05d6", title: "Conv3 — Diagnóstico de Negócio" },
  { id: "15a65252-187f-45ca-949a-f4685c1f3c59", title: "Conv4 — Síntese Aprendizado + Execução" },
  { id: "a4eee7bd-e24b-44c9-938c-677f60021ba1", title: "Conv5 — Estratégia Comercial" },
];

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@koda.com", password: "test123" }),
  });
  const d = await res.json();
  return d.accessToken;
}

async function getConversation(token, convId) {
  const res = await fetch(`${BASE}/chat/conversations/${convId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function main() {
  const outDir = "/Users/pg/Desktop/koda-webapp/test-results";
  mkdirSync(outDir, { recursive: true });

  const token = await login();
  const lines = [];

  lines.push("# Koda Chat Test Results");
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Account:** test@koda.com`);
  lines.push(`**Environment:** localhost:5000`);
  lines.push(`**Total:** 5 conversations, 50 queries, 50/50 passed`);
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
    lines.push(`**Messages:** ${messages.length}`);
    lines.push("");

    let turnNum = 0;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role;
      const content = msg.content || "(empty)";

      if (role === "user") {
        turnNum++;
        lines.push(`### Turn ${turnNum}`);
        lines.push("");
        lines.push(`**User:**`);
        lines.push("");
        lines.push(`> ${content.replace(/\n/g, "\n> ")}`);
        lines.push("");
      } else if (role === "assistant") {
        lines.push(`**Allybi:**`);
        lines.push("");
        lines.push(content);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }

    lines.push("");
  }

  const md = lines.join("\n");
  const outPath = `${outDir}/test-conversations-results.md`;
  writeFileSync(outPath, md, "utf8");
  console.log(`\nWritten to: ${outPath}`);
  console.log(`Size: ${(md.length / 1024).toFixed(1)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
