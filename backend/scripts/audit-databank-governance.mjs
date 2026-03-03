#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const DATA_BANKS_ROOT = new URL("../src/data_banks", import.meta.url).pathname;
const REGISTRY_PATH = path.join(DATA_BANKS_ROOT, "manifest", "bank_registry.any.json");
const DEFAULT_OUTPUT = new URL(
  "../reports/data-banks/governance-audit.json",
  import.meta.url,
).pathname;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    scope: "runtime",
    mode: "warn",
    output: DEFAULT_OUTPUT,
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] || "");
    const next = String(args[i + 1] || "");
    if (token === "--scope" && next) out.scope = next;
    if (token === "--mode" && next) out.mode = next;
    if (token === "--output" && next) out.output = path.resolve(next);
  }
  if (!["runtime", "all"].includes(out.scope)) {
    throw new Error(`Invalid --scope '${out.scope}'. Use runtime|all.`);
  }
  if (!["warn", "enforce"].includes(out.mode)) {
    throw new Error(`Invalid --mode '${out.mode}'. Use warn|enforce.`);
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
    if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

function gradeFromScore(score) {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

function isObj(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function getRuntimeFileSet() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const banks = Array.isArray(registry?.banks) ? registry.banks : [];
  const set = new Set();
  for (const entry of banks) {
    const relPath = String(entry?.path || "").trim();
    if (!relPath) continue;
    const full = path.join(DATA_BANKS_ROOT, relPath);
    set.add(path.resolve(full));
  }
  return set;
}

function shouldRequireDeterminism(bank) {
  const strictArrays = ["patterns", "rules", "connectors", "guardrails"];
  return strictArrays.some((key) => Array.isArray(bank?.[key]) && bank[key].length > 0);
}

function collectDuplicateIds(bank) {
  const arrayKeys = Object.keys(bank || {}).filter((key) => Array.isArray(bank[key]));
  const duplicates = [];
  for (const key of arrayKeys) {
    const seen = new Set();
    for (const row of bank[key]) {
      if (!isObj(row)) continue;
      const id = String(row.id || "").trim();
      if (!id) continue;
      if (seen.has(id)) {
        duplicates.push({ key, id });
      } else {
        seen.add(id);
      }
    }
  }
  return duplicates;
}

function pushIssue(issues, code, severity, points) {
  issues.push({ code, severity, points });
}

function scoreFile(filePath) {
  const issues = [];
  let score = 100;
  let bank;
  try {
    bank = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {
      filePath,
      score: 0,
      grade: "F",
      issues: [{ code: "invalid_json", severity: "hard", points: 100 }],
    };
  }

  if (!isObj(bank)) {
    pushIssue(issues, "top_level_not_object", "hard", 45);
  }

  const meta = isObj(bank?._meta) ? bank._meta : null;
  if (!meta) {
    pushIssue(issues, "missing__meta", "hard", 20);
  } else {
    if (!String(meta.id || "").trim()) pushIssue(issues, "missing__meta.id", "policy", 8);
    if (!String(meta.version || "").trim()) {
      pushIssue(issues, "missing__meta.version", "policy", 6);
    }
    if (!String(meta.description || "").trim()) {
      pushIssue(issues, "missing__meta.description", "policy", 6);
    }
    if (!Array.isArray(meta.languages) || meta.languages.length === 0) {
      pushIssue(issues, "missing__meta.languages", "policy", 5);
    }
    if (!String(meta.lastUpdated || "").trim()) {
      pushIssue(issues, "missing__meta.lastUpdated", "policy", 5);
    }
    if (!String(meta.owner || "").trim()) pushIssue(issues, "missing__meta.owner", "policy", 5);
    if (!Array.isArray(meta.usedBy) || meta.usedBy.length === 0) {
      pushIssue(issues, "missing_or_empty__meta.usedBy", "policy", 12);
    }
    if (!Array.isArray(meta.tests) || meta.tests.length === 0) {
      pushIssue(issues, "missing_or_empty__meta.tests", "policy", 12);
    }
  }

  const config = isObj(bank?.config) ? bank.config : null;
  if (!config) {
    pushIssue(issues, "missing_config", "hard", 12);
  } else if (typeof config.enabled !== "boolean") {
    pushIssue(issues, "invalid_config.enabled", "hard", 10);
  }

  if (shouldRequireDeterminism(bank)) {
    if (config?.deterministic !== true) {
      pushIssue(issues, "config.deterministic_not_true", "policy", 4);
    }
    if (config?.dedupe !== true) {
      pushIssue(issues, "config.dedupe_not_true", "policy", 4);
    }
    if (!Object.prototype.hasOwnProperty.call(config || {}, "sortBy")) {
      pushIssue(issues, "config.sortBy_missing", "policy", 2);
    }
  }

  const duplicates = collectDuplicateIds(bank);
  if (duplicates.length > 0) {
    pushIssue(issues, "duplicate_row_ids", "hard", 8);
  }

  for (const issue of issues) score -= issue.points;
  if (score < 0) score = 0;
  return { filePath, score, grade: gradeFromScore(score), issues, duplicates };
}

function ensureOutputDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  const args = parseArgs();
  const allFiles = walkJson(DATA_BANKS_ROOT).map((filePath) => path.resolve(filePath));
  const runtimeSet = args.scope === "runtime" ? getRuntimeFileSet() : null;

  const targetFiles = allFiles.filter((filePath) => {
    const rel = normalizePath(path.relative(DATA_BANKS_ROOT, filePath));
    if (args.scope === "runtime") {
      if (!runtimeSet?.has(filePath)) return false;
      if (rel.startsWith("_deprecated/")) return false;
      if (rel.startsWith("_quarantine/")) return false;
      if (rel.startsWith(".compiled/")) return false;
    }
    return true;
  });

  const rows = targetFiles.map(scoreFile).sort((a, b) => a.score - b.score);
  const gradeDistribution = {};
  const issueFrequency = {};
  let blockingFailures = 0;
  for (const row of rows) {
    gradeDistribution[row.grade] = (gradeDistribution[row.grade] || 0) + 1;
    const hasBlockingIssue = row.issues.some((issue) => issue.severity === "hard");
    if (hasBlockingIssue) blockingFailures += 1;
    for (const issue of row.issues) {
      issueFrequency[issue.code] = (issueFrequency[issue.code] || 0) + 1;
    }
  }

  const averageScore = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.score, 0) / rows.length) * 100) / 100
    : 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: args.scope,
    mode: args.mode,
    totalFiles: rows.length,
    averageScore,
    gradeDistribution,
    blockingFailures,
    topIssues: Object.entries(issueFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([code, count]) => ({ code, count })),
    topFailures: rows.slice(0, 50),
  };

  const output = {
    summary,
    rows,
  };

  ensureOutputDir(args.output);
  writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        output: args.output,
        scope: args.scope,
        mode: args.mode,
        totalFiles: rows.length,
        averageScore,
        blockingFailures,
      },
      null,
      2,
    ),
  );

  if (args.mode === "enforce") {
    const failed = rows.some((row) => row.issues.length > 0);
    if (failed) process.exit(1);
  }
}

main();
