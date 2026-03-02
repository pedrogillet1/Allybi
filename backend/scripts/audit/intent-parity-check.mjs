#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

// ---------------------------------------------------------------------------
// Allowlist — known intentional EN/PT differences (skip these pattern IDs)
// ---------------------------------------------------------------------------
const ALLOWED_DIFFERENCE_EXCEPTIONS = {
  // PT has an extra informal rewrite variant not present in EN.
  "docx.rewrite.informal": {
    reason: "PT language coverage needs both informal and casual rewrite intents.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
};

// Slot/clarify differences that are intentional (PT-specific enhancements)
const ALLOWED_SLOT_DIFF_EXCEPTIONS = {
  // PT indent pattern has PT-specific firstLinePt slot.
  "docx.format.indent": {
    reason: "PT indent parser needs first-line slot for locale-specific grammar.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  // PT rewrite patterns have llmGenerated clarification slot.
  "docx.rewrite.paragraph": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  "docx.rewrite.formal": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  "docx.rewrite.concise": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  "docx.rewrite.expand": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  "docx.rewrite.section": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  "docx.rewrite.friendly": {
    reason: "PT rewrite workflow requires explicit generated-text fallback slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
  // PT list conversion has extra targets clarification.
  "docx.list.convert_to_paragraphs": {
    reason: "PT phrasing often omits explicit target count and needs extra clarify slot.",
    owner: "allybi-editing",
    reviewBy: "2026-12-31",
  },
};

const ALLOWED_DIFFERENCES = new Set(
  Object.keys(ALLOWED_DIFFERENCE_EXCEPTIONS),
);
const ALLOWED_SLOT_DIFFS = new Set(
  Object.keys(ALLOWED_SLOT_DIFF_EXCEPTIONS),
);

function isValidExceptionMeta(value) {
  if (!value || typeof value !== "object") return false;
  const reason = String(value.reason || "").trim();
  const owner = String(value.owner || "").trim();
  const reviewBy = String(value.reviewBy || "").trim();
  if (!reason || !owner) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) return false;
  return Number.isFinite(Date.parse(`${reviewBy}T00:00:00Z`));
}

function validateExceptionContract(label, map) {
  let invalid = 0;
  for (const [id, meta] of Object.entries(map)) {
    if (!isValidExceptionMeta(meta)) {
      invalid++;
      console.log(`[${label}] Invalid exception metadata for "${id}"`);
    }
  }
  return invalid;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a bank file, returning its patterns array.
 */
function loadPatterns(relPath) {
  const full = path.join(ROOT, relPath);
  const raw = fs.readFileSync(full, "utf-8");
  const bank = JSON.parse(raw);
  return bank.patterns ?? [];
}

/**
 * Collect the set of canonical operator names from planTemplate across all patterns.
 */
function collectOps(patterns) {
  const ops = new Set();
  for (const p of patterns) {
    let sawOperator = false;
    for (const step of p.planTemplate ?? []) {
      if (step.op) {
        ops.add(step.op);
        sawOperator = true;
      }
    }
    if (!sawOperator) {
      const calcFamily = String(p?.calcFamily || "").trim();
      if (calcFamily) ops.add(`CALC_FAMILY:${calcFamily}`);
    }
  }
  return ops;
}

/**
 * Build a map from pattern ID -> set of slot output keys (from slotExtractors).
 */
function collectSlotKeys(patterns) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const p of patterns) {
    const keys = new Set();
    for (const ext of p.slotExtractors ?? []) {
      if (ext.out) keys.add(ext.out);
    }
    map.set(p.id, keys);
  }
  return map;
}

/**
 * Build a map from pattern ID -> set of clarifyIfMissing slot names.
 */
function collectClarifySlots(patterns) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const p of patterns) {
    const slots = new Set();
    for (const c of p.clarifyIfMissing ?? []) {
      if (c.slot) slots.add(c.slot);
    }
    if (slots.size > 0) map.set(p.id, slots);
  }
  return map;
}

/**
 * Symmetric set difference helper. Returns { onlyA, onlyB }.
 */
function setDiff(a, b) {
  const onlyA = new Set([...a].filter((x) => !b.has(x)));
  const onlyB = new Set([...b].filter((x) => !a.has(x)));
  return { onlyA, onlyB };
}

function normalizeIdentity(id) {
  return String(id || "");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const PAIRS = [
  {
    label: "DOCX",
    enPath: "src/data_banks/intent_patterns/docx.en.any.json",
    ptPath: "src/data_banks/intent_patterns/docx.pt.any.json",
    normalizeId: normalizeIdentity,
  },
  {
    label: "EXCEL",
    enPath: "src/data_banks/intent_patterns/excel.en.any.json",
    ptPath: "src/data_banks/intent_patterns/excel.pt.any.json",
    normalizeId: normalizeIdentity,
  },
  {
    label: "CALC",
    enPath: "src/data_banks/agents/excel_calc/routing/calc_intent_patterns.en.any.json",
    ptPath: "src/data_banks/agents/excel_calc/routing/calc_intent_patterns.pt.any.json",
    normalizeId: (id) => String(id || "").replace(/\.pt$/i, ""),
  },
];

let criticalCount = 0;
const summaryLines = [];

console.log("=== Intent Parity Check ===");

criticalCount += validateExceptionContract(
  "ALLOWED_DIFFERENCE_EXCEPTIONS",
  ALLOWED_DIFFERENCE_EXCEPTIONS,
);
criticalCount += validateExceptionContract(
  "ALLOWED_SLOT_DIFF_EXCEPTIONS",
  ALLOWED_SLOT_DIFF_EXCEPTIONS,
);

for (const { label, enPath, ptPath, normalizeId } of PAIRS) {
  const normalizePatternId = normalizeId || normalizeIdentity;
  const enPatterns = loadPatterns(enPath).map((pattern) => ({
    ...pattern,
    id: normalizePatternId(pattern?.id),
  }));
  const ptPatterns = loadPatterns(ptPath).map((pattern) => ({
    ...pattern,
    id: normalizePatternId(pattern?.id),
  }));

  // --- 1. Pattern ID parity ---
  const enIds = new Set(enPatterns.map((p) => p.id));
  const ptIds = new Set(ptPatterns.map((p) => p.id));

  const { onlyA: enOnly, onlyB: ptOnly } = setDiff(enIds, ptIds);

  // Filter through allowlist
  const enOnlyFiltered = [...enOnly].filter((id) => !ALLOWED_DIFFERENCES.has(id));
  const ptOnlyFiltered = [...ptOnly].filter((id) => !ALLOWED_DIFFERENCES.has(id));

  if (enOnlyFiltered.length > 0) {
    console.log(`\n[${label}] Pattern IDs in EN but NOT in PT:`);
    for (const id of enOnlyFiltered) console.log(`  - ${id}`);
  }
  if (ptOnlyFiltered.length > 0) {
    console.log(`\n[${label}] Pattern IDs in PT but NOT in EN:`);
    for (const id of ptOnlyFiltered) console.log(`  - ${id}`);
  }

  // --- 2. Canonical operator (planTemplate op) parity ---
  const enOps = collectOps(enPatterns);
  const ptOps = collectOps(ptPatterns);

  const { onlyA: opsEnOnly, onlyB: opsPtOnly } = setDiff(enOps, ptOps);

  const missingOps = opsEnOnly.size + opsPtOnly.size;

  if (opsEnOnly.size > 0) {
    console.log(`\n[${label}] Operators in EN but NOT in PT:`);
    for (const op of opsEnOnly) console.log(`  - ${op}`);
    criticalCount += opsEnOnly.size;
  }
  if (opsPtOnly.size > 0) {
    console.log(`\n[${label}] Operators in PT but NOT in EN:`);
    for (const op of opsPtOnly) console.log(`  - ${op}`);
    criticalCount += opsPtOnly.size;
  }

  // --- 3. Slot extractor output key parity (per shared pattern ID) ---
  const enSlots = collectSlotKeys(enPatterns);
  const ptSlots = collectSlotKeys(ptPatterns);

  const sharedIds = [...enIds].filter((id) => ptIds.has(id));
  let slotMismatches = 0;

  for (const id of sharedIds) {
    if (ALLOWED_DIFFERENCES.has(id) || ALLOWED_SLOT_DIFFS.has(id)) continue;

    const enSet = enSlots.get(id) ?? new Set();
    const ptSet = ptSlots.get(id) ?? new Set();
    const { onlyA: slotEnOnly, onlyB: slotPtOnly } = setDiff(enSet, ptSet);

    if (slotEnOnly.size > 0 || slotPtOnly.size > 0) {
      slotMismatches++;
      console.log(`\n[${label}] Slot key mismatch for pattern "${id}":`);
      if (slotEnOnly.size > 0) console.log(`  EN-only slots: ${[...slotEnOnly].join(", ")}`);
      if (slotPtOnly.size > 0) console.log(`  PT-only slots: ${[...slotPtOnly].join(", ")}`);
    }
  }

  if (slotMismatches > 0) {
    criticalCount += slotMismatches;
  }

  // --- 4. clarifyIfMissing slot parity ---
  const enClarify = collectClarifySlots(enPatterns);
  const ptClarify = collectClarifySlots(ptPatterns);

  let clarifyMismatches = 0;

  for (const id of sharedIds) {
    if (ALLOWED_DIFFERENCES.has(id) || ALLOWED_SLOT_DIFFS.has(id)) continue;

    const enSet = enClarify.get(id) ?? new Set();
    const ptSet = ptClarify.get(id) ?? new Set();
    const { onlyA: cEnOnly, onlyB: cPtOnly } = setDiff(enSet, ptSet);

    if (cEnOnly.size > 0 || cPtOnly.size > 0) {
      clarifyMismatches++;
      console.log(`\n[${label}] clarifyIfMissing slot mismatch for pattern "${id}":`);
      if (cEnOnly.size > 0) console.log(`  EN-only: ${[...cEnOnly].join(", ")}`);
      if (cPtOnly.size > 0) console.log(`  PT-only: ${[...cPtOnly].join(", ")}`);
    }
  }

  if (clarifyMismatches > 0) {
    criticalCount += clarifyMismatches;
  }

  // --- Summary line ---
  const slotStatus =
    slotMismatches === 0 && clarifyMismatches === 0
      ? "OK"
      : `${slotMismatches + clarifyMismatches} mismatch(es)`;

  summaryLines.push(
    `${label}: EN patterns=${enPatterns.length}, PT patterns=${ptPatterns.length}`,
  );
  summaryLines.push(
    `  Op coverage: ${enOps.size} EN, ${ptOps.size} PT, ${missingOps} missing`,
  );
  summaryLines.push(`  Slot parity: ${slotStatus}`);
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
console.log("\n=== Summary ===");
for (const line of summaryLines) console.log(line);

if (criticalCount > 0) {
  console.log(`\n\u2717 Parity check FAILED: ${criticalCount} critical issue${criticalCount === 1 ? "" : "s"} found`);
  process.exit(1);
} else {
  console.log(`\n\u2713 Parity check passed`);
  process.exit(0);
}
