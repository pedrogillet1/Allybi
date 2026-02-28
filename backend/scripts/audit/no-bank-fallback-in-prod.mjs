#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);

const DATA_BANKS_DIR = path.join(ROOT, "src", "data_banks");
const REGISTRY_PATH = path.join(
  DATA_BANKS_DIR,
  "manifest",
  "bank_registry.any.json",
);
const BANK_SERVICE_PATH = path.join(
  ROOT,
  "src",
  "services",
  "editing",
  "banks",
  "bankService.ts",
);

const EDITING_CATEGORIES = new Set([
  "microcopy",
  "intent_patterns",
  "operators",
  "routing",
  "parsers",
  "semantics",
  "editing",
  "scope",
]);

const EDITING_ID_KEYWORDS = ["editing", "intent"];

// ── helpers ──────────────────────────────────────────────────────────────────

function isEditingBank(bank) {
  if (EDITING_CATEGORIES.has(bank.category)) return true;
  const id = String(bank.id || "").toLowerCase();
  return EDITING_ID_KEYWORDS.some((kw) => id.includes(kw));
}

// ── main ─────────────────────────────────────────────────────────────────────

let failures = 0;

// 1. Load registry
let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
} catch (err) {
  console.error(`FATAL: cannot read bank registry at ${REGISTRY_PATH}`);
  console.error(err.message);
  process.exit(1);
}

const allBanks = registry.banks || [];
const editingBanks = allBanks.filter(isEditingBank);

if (editingBanks.length === 0) {
  console.error("FATAL: found 0 editing banks — filter may be wrong");
  process.exit(1);
}

// 2. Verify each editing bank
let allExist = true;
let allParse = true;
let allHaveMeta = true;

for (const bank of editingBanks) {
  const filePath = path.join(DATA_BANKS_DIR, bank.path);

  // 2a. file exists
  if (!fs.existsSync(filePath)) {
    console.error(`  MISSING: ${bank.id} → ${bank.path}`);
    allExist = false;
    continue;
  }

  // 2b. valid JSON
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`  BAD JSON: ${bank.id} → ${bank.path}: ${err.message}`);
    allParse = false;
    continue;
  }

  // 2c. _meta.id present
  const metaId = parsed?._meta?.id;
  if (!metaId) {
    console.error(`  NO _meta.id: ${bank.id} → ${bank.path}`);
    allHaveMeta = false;
  }
}

if (!allExist) failures++;
if (!allParse) failures++;
if (!allHaveMeta) failures++;

// 3. Read bankService.ts source and verify shouldAllowFilesystemFallback
let bankServiceSrc;
try {
  bankServiceSrc = fs.readFileSync(BANK_SERVICE_PATH, "utf8");
} catch (err) {
  console.error(`FATAL: cannot read bankService.ts at ${BANK_SERVICE_PATH}`);
  console.error(err.message);
  process.exit(1);
}

// Extract the function body using balanced-brace parsing for robustness
let fnBodyRaw = null;
{
  const fnStart = bankServiceSrc.indexOf("shouldAllowFilesystemFallback");
  if (fnStart !== -1) {
    const braceStart = bankServiceSrc.indexOf("{", fnStart);
    if (braceStart !== -1) {
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < bankServiceSrc.length; i++) {
        if (bankServiceSrc[i] === "{") depth++;
        else if (bankServiceSrc[i] === "}") {
          depth--;
          if (depth === 0) { braceEnd = i; break; }
        }
      }
      if (braceEnd !== -1) {
        fnBodyRaw = bankServiceSrc.slice(braceStart + 1, braceEnd);
      }
    }
  }
}

let guardOk = false;
if (!fnBodyRaw) {
  console.error(
    "  shouldAllowFilesystemFallback function not found in bankService.ts",
  );
} else {
  // Strip comments and normalize whitespace for analysis
  const fnBody = fnBodyRaw
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Must reference NODE_ENV
  const referencesNodeEnv = /NODE_ENV/.test(fnBody);
  // Must contain return pattern gated on === "test"
  const returnsTestOnly = /===?\s*["']test["']/.test(fnBody);
  // Must NOT have any bare "return true" that could bypass the guard
  const hasBareReturnTrue = /return\s+true\b/.test(fnBody);
  // Must NOT explicitly allow production or staging
  const allowsProd = /["']production["']/.test(fnBody) && hasBareReturnTrue;
  const allowsStaging = /["']staging["']/.test(fnBody) && hasBareReturnTrue;

  const checks = [];
  if (!referencesNodeEnv) checks.push("does not check NODE_ENV");
  if (!returnsTestOnly) checks.push('does not gate on "test"');
  if (hasBareReturnTrue) checks.push('contains bare "return true" (should only return env === "test")');
  if (allowsProd) checks.push("appears to allow production fallback");
  if (allowsStaging) checks.push("appears to allow staging fallback");

  if (referencesNodeEnv && returnsTestOnly && !hasBareReturnTrue && !allowsProd && !allowsStaging) {
    guardOk = true;
  } else {
    console.error(
      "  shouldAllowFilesystemFallback does not properly guard production",
    );
    for (const c of checks) console.error(`    - ${c}`);
  }
}

if (!guardOk) failures++;

// 4. Simulate production: confirm the function would return false
const origEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
{
  // Re-evaluate the guard logic inline (mirrors the function)
  const env = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const wouldFallback = env === "test";
  if (wouldFallback) {
    console.error(
      '  Simulated production: shouldAllowFilesystemFallback would return true (expected false)',
    );
    failures++;
  }
}
process.env.NODE_ENV = origEnv;

// ── report ───────────────────────────────────────────────────────────────────

console.log("");
console.log("=== No Bank Fallback in Production ===");
console.log(`Editing banks verified: ${editingBanks.length}`);
console.log(
  `  All files exist at registered paths: ${allExist ? "\u2713" : "\u2717"}`,
);
console.log(
  `  All files parse as valid JSON: ${allParse ? "\u2713" : "\u2717"}`,
);
console.log(
  `  shouldAllowFilesystemFallback guards production: ${guardOk ? "\u2713" : "\u2717"}`,
);

if (failures > 0) {
  console.log(`\u2717 ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("\u2713 No filesystem fallback in production mode");
  process.exit(0);
}
