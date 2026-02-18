#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../src/data_banks");

const isStrict = process.argv.includes("--strict");

function readJson(relPath) {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function exists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function normalizeOperator(value) {
  return String(value || "").trim().toUpperCase();
}

function collectPatternOps(patternBank) {
  const ops = new Set();
  const patterns = Array.isArray(patternBank?.patterns) ? patternBank.patterns : [];
  for (const pattern of patterns) {
    const templates = Array.isArray(pattern?.planTemplate) ? pattern.planTemplate : [];
    for (const step of templates) {
      const op = normalizeOperator(step?.op);
      if (op) ops.add(op);
    }
    const fallback = normalizeOperator(pattern?.operator);
    if (fallback) ops.add(fallback);
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Slot extractor collector — returns Map<extractorType, Map<outName, Set<patternIds>>>
// Compares by extractor type (FONT_SIZE, HEADING_LEVEL, etc.) to detect
// cases where the same type produces different slot names across locales.
// LOCATOR_TEXT is excluded since target/targets singularity is intentional.
// ---------------------------------------------------------------------------

const SKIP_PARITY_TYPES = new Set(["LOCATOR_TEXT"]);

function collectSlotsByType(patternBank) {
  // Map<extractorType, Map<outName, Set<patternId>>>
  const result = new Map();
  const patterns = Array.isArray(patternBank?.patterns) ? patternBank.patterns : [];
  for (const pattern of patterns) {
    const extractors = Array.isArray(pattern?.slotExtractors) ? pattern.slotExtractors : [];
    for (const extractor of extractors) {
      const type = String(extractor?.type || "").trim();
      const out = String(extractor?.out || "").trim();
      if (!type || !out || SKIP_PARITY_TYPES.has(type)) continue;
      if (!result.has(type)) result.set(type, new Map());
      const typeMap = result.get(type);
      if (!typeMap.has(out)) typeMap.set(out, new Set());
      typeMap.get(out).add(pattern.id || "?");
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Capability bank operator collector
// ---------------------------------------------------------------------------

function collectCapabilityOps(capabilityBank) {
  const ops = new Set();
  const operators = capabilityBank?.operators || {};
  for (const key of Object.keys(operators)) {
    ops.add(normalizeOperator(key));
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const errors = [];
  const warnings = [];
  const requiredFiles = [
    "parsers/operator_catalog.any.json",
    "intent_patterns/docx.en.any.json",
    "intent_patterns/docx.pt.any.json",
    "intent_patterns/excel.en.any.json",
    "intent_patterns/excel.pt.any.json",
    "microcopy/editing_microcopy.any.json",
    "microcopy/edit_error_catalog.any.json",
    "scope/allybi_docx_resolvers.any.json",
    "scope/allybi_xlsx_resolvers.any.json",
  ];

  for (const file of requiredFiles) {
    if (!exists(file)) errors.push(`Missing required bank file: ${file}`);
  }

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`ERROR: ${e}`));
    process.exit(1);
  }

  const operatorCatalog = readJson("parsers/operator_catalog.any.json");
  const catalogOps = new Set(Object.keys(operatorCatalog?.operators || {}).map(normalizeOperator));

  const patternBanks = [
    readJson("intent_patterns/docx.en.any.json"),
    readJson("intent_patterns/docx.pt.any.json"),
    readJson("intent_patterns/excel.en.any.json"),
    readJson("intent_patterns/excel.pt.any.json"),
  ];
  const requiredByPatterns = new Set();
  for (const bank of patternBanks) {
    for (const op of collectPatternOps(bank)) requiredByPatterns.add(op);
  }
  for (const op of requiredByPatterns) {
    if (!catalogOps.has(op)) errors.push(`Pattern references operator not in SSOT catalog: ${op}`);
  }

  // ---------------------------------------------------------------------------
  // EN/PT slot name parity check
  // ---------------------------------------------------------------------------

  const enDocxBank = patternBanks[0]; // docx.en
  const ptDocxBank = patternBanks[1]; // docx.pt
  const enExcelBank = patternBanks[2]; // excel.en
  const ptExcelBank = patternBanks[3]; // excel.pt

  const slotPairs = [
    { label: "DOCX", en: collectSlotsByType(enDocxBank), pt: collectSlotsByType(ptDocxBank) },
    { label: "XLSX", en: collectSlotsByType(enExcelBank), pt: collectSlotsByType(ptExcelBank) },
  ];

  for (const { label, en, pt } of slotPairs) {
    const allTypes = new Set([...en.keys(), ...pt.keys()]);
    for (const extractorType of allTypes) {
      const enNames = en.get(extractorType) || new Map();
      const ptNames = pt.get(extractorType) || new Map();
      const enKeys = [...enNames.keys()];
      const ptKeys = [...ptNames.keys()];
      // If both locales use the same extractor type but with different output names, flag it
      if (enKeys.length > 0 && ptKeys.length > 0) {
        for (const enKey of enKeys) {
          if (!ptNames.has(enKey)) {
            errors.push(`${label} slot name mismatch for extractor ${extractorType}: EN uses "${enKey}" but PT uses "${ptKeys.join(", ")}" — these must match`);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Operator catalog ↔ capability bank cross-reference
  // ---------------------------------------------------------------------------

  const capabilityFiles = [
    { file: "operators/allybi_docx_operators.any.json", domain: "docx" },
  ];

  for (const { file, domain } of capabilityFiles) {
    if (exists(file)) {
      const capBank = readJson(file);
      const capOps = collectCapabilityOps(capBank);
      // Check that every catalog operator for this domain is in the capability bank
      for (const [opName, entry] of Object.entries(operatorCatalog?.operators || {})) {
        const normalized = normalizeOperator(opName);
        if (entry.domain !== domain) continue;
        if (!capOps.has(normalized)) {
          warnings.push(`Catalog operator ${normalized} (domain=${domain}) missing from capability bank ${file}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pattern collision detection
  // ---------------------------------------------------------------------------

  const localePairs = [
    { label: "DOCX EN", bank: enDocxBank },
    { label: "DOCX PT", bank: ptDocxBank },
    { label: "XLSX EN", bank: enExcelBank },
    { label: "XLSX PT", bank: ptExcelBank },
  ];

  for (const { label, bank } of localePairs) {
    const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
    // For each pattern's positive examples, test against all other patterns
    for (let i = 0; i < patterns.length; i++) {
      const pA = patterns[i];
      const examplesA = pA?.examples?.positive || [];
      for (let j = i + 1; j < patterns.length; j++) {
        const pB = patterns[j];
        const regexesB = pB?.triggers?.regex_any || [];
        if (!regexesB.length) continue;
        for (const example of examplesA) {
          for (const rx of regexesB) {
            try {
              if (new RegExp(rx, "i").test(example)) {
                const opsA = (pA?.planTemplate || []).map((s) => s?.op).filter(Boolean);
                const opsB = (pB?.planTemplate || []).map((s) => s?.op).filter(Boolean);
                // Only warn if the operators differ (true collision)
                if (JSON.stringify(opsA) !== JSON.stringify(opsB)) {
                  warnings.push(
                    `${label} collision: "${pA.id}" example "${example}" also matches "${pB.id}" regex (ops: ${opsA.join(",")} vs ${opsB.join(",")})`,
                  );
                }
                break; // one collision per example-pattern pair is enough
              }
            } catch {
              // invalid regex — skip
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Microcopy coverage
  // ---------------------------------------------------------------------------

  const microcopy = readJson("microcopy/editing_microcopy.any.json");
  const byOperator = microcopy?.copy?.byOperator || {};
  const stages = ["preview", "applied", "noop", "blocked", "clarification_required", "engine_unsupported"];
  for (const op of catalogOps) {
    for (const stage of stages) {
      const hasStageCopy = Boolean(byOperator?.[stage]?.[op] || byOperator?.[stage]?.["*"]);
      if (!hasStageCopy) {
        errors.push(`Missing microcopy byOperator.${stage}.${op} (or wildcard fallback).`);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Error catalog
  // ---------------------------------------------------------------------------

  const errorCatalog = readJson("microcopy/edit_error_catalog.any.json");
  const rawErrors = errorCatalog?.errors || {};
  const locErrors = (rawErrors && typeof rawErrors === "object" && !Array.isArray(rawErrors))
    ? (rawErrors.en || rawErrors.pt || rawErrors)
    : {};
  const errorCodes = new Set(
    Object.keys(locErrors || {}).map((k) => String(k || "").trim()).filter(Boolean),
  );
  const requiredCodes = [
    "CLARIFICATION_REQUIRED",
    "ENGINE_UNSUPPORTED",
    "UNKNOWN_UNSUPPORTED_INTENT",
    "TARGET_NOT_RESOLVED",
    "EDIT_NOOP_NO_CHANGES",
  ];
  for (const code of requiredCodes) {
    if (!errorCodes.has(code)) errors.push(`Missing edit_error_catalog code: ${code}`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  if (warnings.length > 0) {
    warnings.forEach((w) => console.warn(`WARN: ${w}`));
  }

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`ERROR: ${e}`));
    process.exit(1);
  }

  // In strict mode, warnings are promoted to errors
  if (isStrict && warnings.length > 0) {
    console.error("STRICT: warnings are treated as errors in --strict mode.");
    process.exit(1);
  }

  console.log("Editing bank validation passed.");
  console.log(`Validated operators: ${catalogOps.size}`);
  console.log(`Validated pattern references: ${requiredByPatterns.size}`);
  if (warnings.length > 0) console.log(`Warnings: ${warnings.length}`);
}

main();
