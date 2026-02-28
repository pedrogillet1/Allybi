#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BANKS_ROOT = path.resolve(ROOT, "src/data_banks");
const WRITE = process.argv.includes("--write");
const STRICT = process.argv.includes("--strict");
const SKIP_PREFIXES = new Set(["_quarantine/"]);

const KEY_CANDIDATES = ["id", "name", "canonical"];

// Arrays intentionally modeled as semantic flow/priority and should not be auto-sorted.
const EXCLUDED_ARRAY_KEYS = new Set([
  "sections",
  "tables",
  "hints",
  "rules",
  "validationChecks",
  "unitsRules",
  "headerContextRules",
  "askQuestionWhen",
  "audienceProfiles",
  "requirements",
  "priorities",
  "strategies",
  "tests",
  "cases",
  "detectionRules",
  "operators",
  "families",
  "templates",
  "tools",
  "guardrails",
  "tiebreakers",
  "tiebreakStages",
  "roles",
  "packs",
  "slots",
  "unitRules",
  "timePeriodRules",
  "reconciliationHints",
  "dontInferRules",
  "kpiDefinitions",
  "validationProfiles",
  "promptFiles",
]);

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function walkAnyJson(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".any.json")) out.push(full);
    }
  }
  return out;
}

function compareText(a, b) {
  const aa = String(a ?? "").toLowerCase();
  const bb = String(b ?? "").toLowerCase();
  return aa.localeCompare(bb);
}

function stableSortByKey(arr, key) {
  return arr
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const byKey = compareText(a.item?.[key], b.item?.[key]);
      if (byKey !== 0) return byKey;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}

function sameOrder(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

if (!fs.existsSync(BANKS_ROOT)) {
  console.error(`[banks:determinism] missing banks root: ${BANKS_ROOT}`);
  process.exit(1);
}

const files = walkAnyJson(BANKS_ROOT);
const changedFiles = [];
const unsortedSites = [];
let scannedArrays = 0;

for (const file of files) {
  const rel = toPosix(path.relative(BANKS_ROOT, file));
  if ([...SKIP_PREFIXES].some((prefix) => rel.startsWith(prefix))) continue;
  let bank;
  try {
    bank = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    continue;
  }

  let touched = false;

  for (const [arrayKey, value] of Object.entries(bank || {})) {
    if (!Array.isArray(value) || value.length < 2) continue;
    if (EXCLUDED_ARRAY_KEYS.has(arrayKey)) continue;

    const sortKey = KEY_CANDIDATES.find((candidate) =>
      value.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          entry[candidate] !== undefined &&
          (typeof entry[candidate] === "string" || typeof entry[candidate] === "number"),
      ),
    );
    if (!sortKey) continue;

    scannedArrays++;
    const sorted = stableSortByKey(value, sortKey);
    if (sameOrder(value, sorted)) continue;

    unsortedSites.push({ file: rel, arrayKey, sortKey, count: value.length });
    if (WRITE) {
      bank[arrayKey] = sorted;
      touched = true;
    }
  }

  if (touched) {
    fs.writeFileSync(file, `${JSON.stringify(bank, null, 2)}\n`, "utf8");
    changedFiles.push(rel);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? "write" : "check",
  strict: STRICT,
  totals: {
    filesScanned: files.length,
    eligibleArraysScanned: scannedArrays,
    unsortedSites: unsortedSites.length,
    filesChanged: changedFiles.length,
  },
  unsortedSites,
  changedFiles,
  excludedArrayKeys: [...EXCLUDED_ARRAY_KEYS].sort((a, b) => a.localeCompare(b)),
};

console.log(JSON.stringify(report, null, 2));

if (!WRITE && STRICT && unsortedSites.length > 0) process.exit(1);
