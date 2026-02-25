#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const strict =
  process.argv.includes("--strict") ||
  process.argv.includes("--mode=strict") ||
  (process.argv.includes("--mode") && process.argv.includes("strict"));

const ROOT = process.cwd();
const SRC_ROOT = path.resolve(ROOT, "src");

function listRuntimeFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "tests") continue;
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      if (rel.startsWith("src/data_banks/")) continue;
      out.push(rel);
    }
  }
  return out;
}

function read(filePath) {
  return fs.readFileSync(path.resolve(ROOT, filePath), "utf8");
}

function main() {
  const files = listRuntimeFiles(SRC_ROOT);
  const failures = [];

  const owners = [
    {
      id: "DOC_SCOPE_OWNER",
      owner: "src/services/core/retrieval/docScopeLock.ts",
      definitionPattern:
        /\bexport\s+function\s+(buildAttachmentDocScopeLock|resolveDocScopeLockFromSignals)\b/g,
    },
    {
      id: "TOKEN_BUDGET_OWNER",
      owner: "src/services/core/enforcement/tokenBudget.service.ts",
      definitionPattern:
        /\bexport\s+function\s+(resolveOutputTokenBudget|trimTextToTokenBudget)\b/g,
    },
    {
      id: "ENFORCEMENT_THRESHOLD_OWNER",
      owner: "src/services/core/enforcement/responseContractEnforcer.service.ts",
      definitionPattern:
        /\b(resolveSoftTokenLimit|resolveHardTokenLimit|resolveHardCharLimit)\s*\(/g,
    },
  ];

  for (const rule of owners) {
    const offenders = [];
    for (const relPath of files) {
      if (relPath === rule.owner) continue;
      const source = read(relPath);
      if (rule.definitionPattern.test(source)) offenders.push(relPath);
      rule.definitionPattern.lastIndex = 0;
    }
    if (offenders.length > 0) {
      failures.push(`${rule.id}:${offenders.join(",")}`);
    }
  }

  // Hardcoded char cap split-truth guard: block fixed 4200 in runtime code.
  for (const relPath of files) {
    const source = read(relPath);
    if (/\b4200\b/.test(source)) {
      failures.push(`HARDCODED_4200_CAP:${relPath}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    strict,
    fileCount: files.length,
    passed: failures.length === 0,
    failures,
  };
  const outPath = path.resolve(ROOT, "reports/cert/sot-owner-audit.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(
    `[sot-owner-audit] files=${summary.fileCount} passed=${summary.passed}`,
  );
  console.log(`[sot-owner-audit] wrote ${path.relative(ROOT, outPath)}`);
  if (!summary.passed) {
    for (const failure of failures) console.error(`[sot-owner-audit] ${failure}`);
    process.exit(1);
  }
}

main();
