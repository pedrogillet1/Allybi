#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DATA_BANKS_ROOT = new URL("../../src/data_banks", import.meta.url).pathname;
const REGISTRY_PATH = path.join(DATA_BANKS_ROOT, "manifest", "bank_registry.any.json");

const USED_BY_RULES = [
  {
    match: (relPath) => relPath.startsWith("patterns/"),
    values: ["services/chat/turnRoutePolicy.service.ts"],
  },
  {
    match: (relPath) => relPath.includes("/document_intelligence/"),
    values: ["services/core/retrieval/retrievalEngine.service.ts"],
  },
  {
    match: (relPath) => relPath.startsWith("policies/"),
    values: ["services/llm/core/llmRequestBuilder.service.ts"],
  },
  {
    match: (relPath) => relPath.startsWith("operators/"),
    values: ["services/core/banks/dataBankLoader.service.ts"],
  },
  {
    match: (relPath) => relPath.startsWith("retrieval/"),
    values: ["services/core/retrieval/retrievalEngine.service.ts"],
  },
];

const TEST_RULES = [
  {
    match: (relPath) => relPath.startsWith("patterns/"),
    values: ["tests/patternDeterminism.test.ts"],
  },
  {
    match: (relPath) => relPath.includes("/document_intelligence/"),
    values: ["tests/document-intelligence/docint-bank-integrity.test.ts"],
  },
  {
    match: (relPath) => relPath.startsWith("policies/"),
    values: ["tests/certification/prompt-mode-coverage.cert.test.ts"],
  },
  {
    match: (relPath) => relPath.startsWith("operators/"),
    values: ["tests/patternWiringProof.test.ts"],
  },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    scope: "runtime",
    owner: "data-bank-governance",
    lastUpdated: new Date().toISOString().slice(0, 10),
    write: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || "");
    const next = String(args[i + 1] || "");
    if (token === "--scope" && next) out.scope = next;
    if (token === "--owner" && next) out.owner = next;
    if (token === "--last-updated" && next) out.lastUpdated = next;
    if (token === "--write") out.write = true;
  }
  if (!["runtime", "all"].includes(out.scope)) {
    throw new Error(`Invalid --scope '${out.scope}'. Use runtime|all.`);
  }
  return out;
}

function walkJson(rootDir, out = []) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkJson(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function normalizeRelPath(fullPath) {
  return path.relative(DATA_BANKS_ROOT, fullPath).replace(/\\/g, "/");
}

function getRuntimeFileSet() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const banks = Array.isArray(registry?.banks) ? registry.banks : [];
  const set = new Set();
  for (const entry of banks) {
    const rel = String(entry?.path || "").trim();
    if (!rel) continue;
    set.add(path.resolve(path.join(DATA_BANKS_ROOT, rel)));
  }
  return set;
}

function firstMatchingValues(relPath, rules, fallback) {
  const matched = rules.find((rule) => rule.match(relPath));
  return matched ? matched.values : fallback;
}

function isPatternStyleBank(bank) {
  return (
    (Array.isArray(bank?.patterns) && bank.patterns.length > 0) ||
    (Array.isArray(bank?.rules) && bank.rules.length > 0) ||
    (Array.isArray(bank?.connectors) && bank.connectors.length > 0) ||
    (Array.isArray(bank?.guardrails) && bank.guardrails.length > 0)
  );
}

function inferLanguages(relPath) {
  const normalized = String(relPath || "").toLowerCase();
  if (
    normalized.includes(".pt.") ||
    normalized.includes("/pt/") ||
    normalized.endsWith(".pt.json")
  ) {
    return ["pt"];
  }
  if (
    normalized.includes(".es.") ||
    normalized.includes("/es/") ||
    normalized.endsWith(".es.json")
  ) {
    return ["es"];
  }
  if (
    normalized.includes(".en.") ||
    normalized.includes("/en/") ||
    normalized.endsWith(".en.json")
  ) {
    return ["en"];
  }
  return ["en"];
}

function main() {
  const args = parseArgs();
  const allFiles = walkJson(DATA_BANKS_ROOT).map((filePath) => path.resolve(filePath));
  const runtimeSet = args.scope === "runtime" ? getRuntimeFileSet() : null;

  const targetFiles = allFiles.filter((filePath) => {
    const rel = normalizeRelPath(filePath);
    if (args.scope === "runtime") {
      if (!runtimeSet?.has(filePath)) return false;
      if (rel.startsWith("_deprecated/")) return false;
      if (rel.startsWith("_quarantine/")) return false;
      if (rel.startsWith(".compiled/")) return false;
    }
    return true;
  });

  let touched = 0;
  let ownerBackfilled = 0;
  let usedByBackfilled = 0;
  let testsBackfilled = 0;
  let languagesBackfilled = 0;
  let lastUpdatedBackfilled = 0;
  let deterministicBackfilled = 0;
  let dedupeBackfilled = 0;
  let sortByBackfilled = 0;

  const changedFiles = [];

  for (const filePath of targetFiles) {
    let bank;
    try {
      bank = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    if (!bank || typeof bank !== "object" || Array.isArray(bank)) continue;

    const relPath = normalizeRelPath(filePath);
    let changed = false;

    if (!bank._meta || typeof bank._meta !== "object" || Array.isArray(bank._meta)) {
      bank._meta = {};
      changed = true;
    }
    if (!bank.config || typeof bank.config !== "object" || Array.isArray(bank.config)) {
      bank.config = {};
      changed = true;
    }
    if (typeof bank.config.enabled !== "boolean") {
      bank.config.enabled = true;
      changed = true;
    }

    if (!String(bank._meta.owner || "").trim()) {
      bank._meta.owner = args.owner;
      ownerBackfilled += 1;
      changed = true;
    }
    if (!Array.isArray(bank._meta.usedBy) || bank._meta.usedBy.length === 0) {
      bank._meta.usedBy = firstMatchingValues(
        relPath,
        USED_BY_RULES,
        ["services/core/banks/dataBankLoader.service.ts"],
      );
      usedByBackfilled += 1;
      changed = true;
    }
    if (!Array.isArray(bank._meta.tests) || bank._meta.tests.length === 0) {
      bank._meta.tests = firstMatchingValues(
        relPath,
        TEST_RULES,
        ["tests/patternWiringProof.test.ts"],
      );
      testsBackfilled += 1;
      changed = true;
    }
    if (!Array.isArray(bank._meta.languages) || bank._meta.languages.length === 0) {
      bank._meta.languages = inferLanguages(relPath);
      languagesBackfilled += 1;
      changed = true;
    }
    if (!String(bank._meta.lastUpdated || "").trim()) {
      bank._meta.lastUpdated = String(args.lastUpdated || "").trim();
      lastUpdatedBackfilled += 1;
      changed = true;
    }

    if (isPatternStyleBank(bank)) {
      if (bank.config.deterministic !== true) {
        bank.config.deterministic = true;
        deterministicBackfilled += 1;
        changed = true;
      }
      if (bank.config.dedupe !== true) {
        bank.config.dedupe = true;
        dedupeBackfilled += 1;
        changed = true;
      }
      if (!Object.prototype.hasOwnProperty.call(bank.config, "sortBy")) {
        bank.config.sortBy = "id";
        sortByBackfilled += 1;
        changed = true;
      }
    }

    if (changed) {
      touched += 1;
      changedFiles.push(relPath);
      if (args.write) {
        writeFileSync(filePath, `${JSON.stringify(bank, null, 2)}\n`);
      }
    }
  }

  const summary = {
    ok: true,
    scope: args.scope,
    write: args.write,
    owner: args.owner,
    scannedFiles: targetFiles.length,
    touched,
    ownerBackfilled,
    usedByBackfilled,
    testsBackfilled,
    languagesBackfilled,
    lastUpdatedBackfilled,
    deterministicBackfilled,
    dedupeBackfilled,
    sortByBackfilled,
    changedFiles: changedFiles.slice(0, 200),
    truncatedChangedFiles: Math.max(0, changedFiles.length - 200),
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main();
