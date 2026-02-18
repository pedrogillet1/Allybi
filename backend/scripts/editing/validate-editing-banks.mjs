#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../src/data_banks");

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

function main() {
  const errors = [];
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

  if (errors.length > 0) {
    errors.forEach((e) => console.error(`ERROR: ${e}`));
    process.exit(1);
  }

  console.log("Editing bank validation passed.");
  console.log(`Validated operators: ${catalogOps.size}`);
  console.log(`Validated pattern references: ${requiredByPatterns.size}`);
}

main();
