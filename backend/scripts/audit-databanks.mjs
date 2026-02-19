#!/usr/bin/env node
/**
 * audit-databanks.mjs
 *
 * Scans all TypeScript source files for bank ID references, cross-references
 * against the bank registry, and produces:
 *   1. A markdown report (stdout)
 *   2. A JSON removal manifest (written to scripts/unused-banks.json)
 *
 * Usage:  node backend/scripts/audit-databanks.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("../src", import.meta.url).pathname;
const BANKS_DIR = join(ROOT, "data_banks");
const REGISTRY_PATH = join(BANKS_DIR, "manifest/bank_registry.any.json");

// ── 1. Load registry ──────────────────────────────────────────────────────────
const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
const allBanks = registry.banks; // array of { id, category, path, ... }
const allIds = new Set(allBanks.map((b) => b.id));

// Infrastructure banks (used by the bank loader itself — always keep)
const INFRA_IDS = new Set([
  "bank_registry",
  "bank_aliases",
  "bank_checksums",
  "bank_dependencies",
  "bank_schema",
  "bank_manifest",
  "environments",
  "languages",
  "versioning",
]);

// ── 2. Collect all .ts files ──────────────────────────────────────────────────
function walkTs(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "_quarantine" || entry === "dist")
      continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      files = files.concat(walkTs(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

const tsFiles = walkTs(ROOT);

// ── 3. Scan for bank ID string literals ───────────────────────────────────────
// We look for quoted strings that match a known bank ID in relevant contexts:
//   getBank<...>("ID")   safeGetBank<...>("ID")   getOptionalBank<...>("ID")
//   safeEditingBank<...>("ID")   safeBank<...>("ID")
//   Also: bare string literals in arrays/objects that match bank IDs (for map declarations)

const foundInCode = new Map(); // bankId → Set<filePath:lineNo>

// Files that are purely generators / bank content themselves — skip them
const SKIP_PATTERNS = [/generators\/generateAllBanks\.ts$/];

for (const file of tsFiles) {
  if (SKIP_PATTERNS.some((p) => p.test(file))) continue;

  const src = readFileSync(file, "utf-8");
  const lines = src.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract all quoted strings from the line
    const strings = [];
    const re = /["'`]([a-z][a-z0-9_]*(?:_[a-z0-9]+)*)["'`]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      strings.push(m[1]);
    }

    // Build a context window (current line + 5 lines above + 5 below) for multi-line calls
    const ctxStart = Math.max(0, i - 5);
    const ctxEnd = Math.min(lines.length, i + 6);
    const ctxWindow = lines.slice(ctxStart, ctxEnd).join("\n");

    for (const s of strings) {
      if (!allIds.has(s) && !isPhantom(s)) continue;

      // If the string matches a registered bank ID, check context
      if (isBankRefContext(ctxWindow, line, s)) {
        const loc = `${relative(ROOT, file)}:${i + 1}`;
        if (!foundInCode.has(s)) foundInCode.set(s, new Set());
        foundInCode.get(s).add(loc);
      }
    }
  }
}

function isPhantom(s) {
  return s === "ui_copy_tokens" || s === "providerFallbacks";
}

function isBankRefContext(ctxWindow, line, id) {
  // Direct bank getter calls (on this line or within the context window for multi-line)
  const bankCallRe =
    /(?:getBank|safeGetBank|getOptionalBank|safeEditingBank|safeBank)\s*(?:<[^>]*>)?\s*\(/;
  if (bankCallRe.test(line) || bankCallRe.test(ctxWindow)) return true;

  // Array literals containing bank IDs (for PATTERN_BANK_IDS, LEXICON_IDS, etc.)
  if (/\[/.test(ctxWindow) && line.includes(`"${id}"`)) return true;

  // Object keys or values containing bank IDs
  if (
    (line.includes(`"${id}"`) || line.includes(`'${id}'`)) &&
    (/BANK_IDS|LEXICON_IDS|PARSER_IDS|loadAllybi|bankId|Bank/.test(
      ctxWindow,
    ) ||
      /:\s*["']/.test(line))
  )
    return true;

  // Maps, switch cases, or config objects referencing bank IDs
  if (
    /case\s+["']/.test(line) ||
    /bankId\s*[:=]/.test(line) ||
    /id\s*:\s*["']/.test(line)
  )
    return true;

  return false;
}

// ── 4. Also check for IDs referenced in test files (.test.ts, .spec.ts) ──────
// These are still "used" in the sense they're verified by tests

// ── 5. Cross-reference ───────────────────────────────────────────────────────
const usedIds = new Set();
const phantomIds = new Map(); // id → Set<locations>

for (const [id, locs] of foundInCode) {
  if (allIds.has(id)) {
    usedIds.add(id);
  } else {
    phantomIds.set(id, locs);
  }
}

// Mark infra as used
for (const id of INFRA_IDS) usedIds.add(id);

const unusedBanks = allBanks.filter(
  (b) => !usedIds.has(b.id) && !INFRA_IDS.has(b.id),
);
const usedBanks = allBanks.filter(
  (b) => usedIds.has(b.id) || INFRA_IDS.has(b.id),
);

// ── 6. Check loadOrder coverage ──────────────────────────────────────────────
const loadOrder = new Set(registry.loadOrder);
const categoriesInBanks = new Set(allBanks.map((b) => b.category));
const missingFromLoadOrder = [...categoriesInBanks].filter(
  (c) => !loadOrder.has(c),
);

// ── 7. Output markdown report ────────────────────────────────────────────────
const lines = [];
lines.push("# Data Bank Audit Report\n");
lines.push(`**Date:** ${new Date().toISOString().split("T")[0]}`);
lines.push(`**Total registered:** ${allBanks.length}`);
lines.push(`**Used (code refs + infra):** ${usedBanks.length}`);
lines.push(`**Unused:** ${unusedBanks.length}`);
lines.push(`**Phantom references:** ${phantomIds.size}\n`);

if (phantomIds.size > 0) {
  lines.push("## Phantom References (code refs non-existent banks)\n");
  lines.push("| Bank ID | Referenced In |");
  lines.push("|---------|---------------|");
  for (const [id, locs] of phantomIds) {
    lines.push(`| \`${id}\` | ${[...locs].join(", ")} |`);
  }
  lines.push("");
}

if (missingFromLoadOrder.length > 0) {
  lines.push("## Categories Missing from loadOrder\n");
  for (const c of missingFromLoadOrder) {
    const count = allBanks.filter((b) => b.category === c).length;
    lines.push(`- **${c}** (${count} banks)`);
  }
  lines.push("");
}

lines.push("## Used Banks\n");
lines.push("| # | ID | Category |");
lines.push("|---|-----|----------|");
for (let i = 0; i < usedBanks.length; i++) {
  const b = usedBanks[i];
  const isInfra = INFRA_IDS.has(b.id) ? " (infra)" : "";
  lines.push(`| ${i + 1} | \`${b.id}\` | ${b.category}${isInfra} |`);
}
lines.push("");

// Group unused by category
const unusedByCategory = {};
for (const b of unusedBanks) {
  if (!unusedByCategory[b.category]) unusedByCategory[b.category] = [];
  unusedByCategory[b.category].push(b);
}

lines.push("## Unused Banks (to remove)\n");
lines.push("| # | ID | Category | Path |");
lines.push("|---|----|----------|------|");
let idx = 0;
for (const cat of Object.keys(unusedByCategory).sort()) {
  for (const b of unusedByCategory[cat]) {
    idx++;
    lines.push(`| ${idx} | \`${b.id}\` | ${cat} | ${b.path} |`);
  }
}
lines.push("");

console.log(lines.join("\n"));

// ── 8. Write JSON removal manifest ──────────────────────────────────────────
const manifest = {
  generatedAt: new Date().toISOString(),
  totalRegistered: allBanks.length,
  totalUsed: usedBanks.length,
  totalUnused: unusedBanks.length,
  phantomReferences: Object.fromEntries(
    [...phantomIds].map(([id, locs]) => [id, [...locs]]),
  ),
  missingFromLoadOrder,
  unusedBanks: unusedBanks.map((b) => ({
    id: b.id,
    category: b.category,
    path: b.path,
  })),
  usedBankIds: usedBanks.map((b) => b.id).sort(),
};

const outPath = new URL("unused-banks.json", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n✓ Removal manifest written to ${outPath}`);
