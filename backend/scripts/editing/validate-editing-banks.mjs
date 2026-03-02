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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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

const HIGH_RISK_DIRECTIONAL_GROUPS = {
  "excel.fill_direction": [
    { idPattern: /fill_down$/, hints: ["down", "baixo"] },
    { idPattern: /fill_right$/, hints: ["right", "direita"] },
  ],
  "docx.align_mode": [
    { idPattern: /align\.left$/, hints: ["left", "esquerda"] },
    { idPattern: /align\.right$/, hints: ["right", "direita"] },
    { idPattern: /align\.center$/, hints: ["center", "centre", "centro"] },
    { idPattern: /align\.justify$/, hints: ["justify", "justific"] },
  ],
  "docx.insert_position": [
    { idPattern: /insert\.before$/, hints: ["before", "antes"] },
    { idPattern: /insert\.after$/, hints: ["after", "depois"] },
  ],
  "docx.paragraph_structure": [
    { idPattern: /merge\.paragraphs$/, hints: ["merge", "mesclar"] },
    { idPattern: /split\.paragraph$/, hints: ["split", "dividir"] },
  ],
  "docx.text_case": [
    { idPattern: /case\.title$/, hints: ["title", "titulo", "título"] },
    { idPattern: /case\.upper$/, hints: ["upper", "maiusculas", "maiúsculas"] },
    { idPattern: /case\.lower$/, hints: ["lower", "minusculas", "minúsculas"] },
    { idPattern: /case\.sentence$/, hints: ["sentence", "frase", "sentença"] },
  ],
  "docx.toc_action": [
    { idPattern: /toc\.insert$/, hints: ["insert", "table of contents", "sumário", "sumario"] },
    { idPattern: /toc\.update$/, hints: ["update", "refresh", "atualizar"] },
  ],
  "docx.break_action": [
    { idPattern: /page_break$/, hints: ["page break", "quebra de página", "quebra de pagina"] },
    { idPattern: /section_break$/, hints: ["section break", "quebra de seção", "quebra de secao"] },
  ],
  "excel.cond_format": [
    { idPattern: /cond_format\.color_scale$/, hints: ["color", "escala"] },
    { idPattern: /cond_format\.data_bars$/, hints: ["bars", "barras"] },
    { idPattern: /cond_format\.top_n$/, hints: ["top", "top n", "maiores"] },
  ],
  "excel.rows_structural": [
    { idPattern: /insert_rows$/, hints: ["insert", "insira", "adicione"] },
    { idPattern: /delete_rows$/, hints: ["delete", "remove", "exclua", "remova"] },
  ],
  "excel.columns_structural": [
    { idPattern: /insert_columns$/, hints: ["insert", "insira", "adicione"] },
    { idPattern: /delete_columns$/, hints: ["delete", "remove", "exclua", "remova"] },
  ],
  "excel.sheet_structural": [
    { idPattern: /add_sheet$/, hints: ["add", "create", "new", "adicione", "crie", "nova"] },
    { idPattern: /rename_sheet$/, hints: ["rename", "renomeie", "renomear"] },
    { idPattern: /delete_sheet$/, hints: ["delete", "remove", "exclua", "remova"] },
  ],
  "excel.rows_visibility": [
    { idPattern: /hide_rows$/, hints: ["hide rows", "ocultar linhas"] },
    { idPattern: /show_rows$/, hints: ["show rows", "mostrar linhas"] },
  ],
  "excel.columns_visibility": [
    { idPattern: /hide_columns$/, hints: ["hide columns", "ocultar colunas"] },
    { idPattern: /show_columns$/, hints: ["show columns", "mostrar colunas"] },
  ],
  "excel.protection": [
    { idPattern: /set_protection$/, hints: ["protect sheet", "proteger planilha"] },
    { idPattern: /lock_cells$/, hints: ["lock cells", "bloquear células"] },
  ],
};

function hasDirectionalHint(pattern, expectedHints) {
  const source = [
    ...(pattern?.triggers?.tokens_any || []),
    ...(pattern?.triggers?.tokens_all || []),
    ...(pattern?.triggers?.regex_any || []),
  ]
    .map(normalizeText)
    .join(" ");
  return expectedHints.some((hint) => source.includes(normalizeText(hint)));
}

function isOperatorLikeSyntheticExample(example) {
  const low = String(example || "").toLowerCase();
  if (low.includes("[synthetic]")) return false;
  if (/\b(?:apply|aplique)\s+[a-z0-9]+_[a-z0-9_]+\b/.test(low)) return true;
  if (/\b(?:apply|aplique)\s+align\s+(?:left|right|center|justify)\b/.test(low)) return true;
  return false;
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
  const collisionCounts = new Map();
  const requiredFiles = [
    "parsers/operator_catalog.any.json",
    "intent_patterns/docx.en.any.json",
    "intent_patterns/docx.pt.any.json",
    "intent_patterns/excel.en.any.json",
    "intent_patterns/excel.pt.any.json",
    "agents/excel_calc/routing/calc_intent_patterns.en.any.json",
    "agents/excel_calc/routing/calc_intent_patterns.pt.any.json",
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
    readJson("agents/excel_calc/routing/calc_intent_patterns.en.any.json"),
    readJson("agents/excel_calc/routing/calc_intent_patterns.pt.any.json"),
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
  const enCalcBank = patternBanks[4]; // calc.en
  const ptCalcBank = patternBanks[5]; // calc.pt

  const slotPairs = [
    { label: "DOCX", en: collectSlotsByType(enDocxBank), pt: collectSlotsByType(ptDocxBank) },
    { label: "XLSX", en: collectSlotsByType(enExcelBank), pt: collectSlotsByType(ptExcelBank) },
    { label: "CALC", en: collectSlotsByType(enCalcBank), pt: collectSlotsByType(ptCalcBank) },
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
    { label: "CALC EN", bank: enCalcBank },
    { label: "CALC PT", bank: ptCalcBank },
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
                  collisionCounts.set(label, (collisionCounts.get(label) || 0) + 1);
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
  // Pattern hardening coverage checks
  // ---------------------------------------------------------------------------

  for (const { label, bank } of localePairs) {
    const patterns = Array.isArray(bank?.patterns) ? bank.patterns : [];
    if (patterns.length === 0) {
      errors.push(`${label} has no patterns.`);
      continue;
    }

    const tokensNoneCount = patterns.filter(
      (p) => Array.isArray(p?.triggers?.tokens_none) && p.triggers.tokens_none.length > 0,
    ).length;
    const disambiguationCount = patterns.filter(
      (p) => String(p?.disambiguationGroup || "").trim().length > 0,
    ).length;
    const scoreAdjustmentCount = patterns.filter(
      (p) => p?.scoreAdjustments && typeof p.scoreAdjustments === "object",
    ).length;
    const priorityCount = patterns.filter(
      (p) => Number.isFinite(Number(p?.priority)),
    ).length;
    const negativeExamplesCount = patterns.filter(
      (p) => Array.isArray(p?.examples?.negative) && p.examples.negative.length > 0,
    ).length;
    const nonEmptyTemplateCount = patterns.filter(
      (p) => Array.isArray(p?.planTemplate) && p.planTemplate.length > 0,
    ).length;
    const calcFamilyCount = patterns.filter(
      (p) => String(p?.calcFamily || "").trim().length > 0,
    ).length;

    const tokensNoneCoverage = tokensNoneCount / patterns.length;
    const disambiguationCoverage = disambiguationCount / patterns.length;
    const scoreAdjustmentsCoverage = scoreAdjustmentCount / patterns.length;

    if (label.startsWith("XLSX") && tokensNoneCoverage < 0.9) {
      errors.push(
        `${label} tokens_none coverage too low (${tokensNoneCount}/${patterns.length}); minimum is 90%.`,
      );
    }
    if (label.startsWith("DOCX") && tokensNoneCoverage < 0.55) {
      warnings.push(
        `${label} tokens_none coverage is low (${tokensNoneCount}/${patterns.length}); consider expanding hard negative guards.`,
      );
    }
    if (label.startsWith("XLSX") && disambiguationCoverage < 0.6) {
      errors.push(
        `${label} disambiguationGroup coverage too low (${disambiguationCount}/${patterns.length}); minimum is 60%.`,
      );
    }
    if (label.startsWith("XLSX") && scoreAdjustmentsCoverage < 0.75) {
      warnings.push(
        `${label} scoreAdjustments coverage is low (${scoreAdjustmentCount}/${patterns.length}); target is 75%+.`,
      );
    }
    if (label.startsWith("CALC") && priorityCount !== patterns.length) {
      errors.push(
        `${label} priority coverage too low (${priorityCount}/${patterns.length}); all calc patterns must define numeric priority.`,
      );
    }
    if (label.startsWith("CALC") && disambiguationCoverage < 0.95) {
      errors.push(
        `${label} disambiguationGroup coverage too low (${disambiguationCount}/${patterns.length}); minimum is 95%.`,
      );
    }
    if (label.startsWith("CALC") && negativeExamplesCount !== patterns.length) {
      errors.push(
        `${label} negative example coverage too low (${negativeExamplesCount}/${patterns.length}); all calc patterns must include negative examples.`,
      );
    }
    if (
      label.startsWith("CALC") &&
      patterns.filter((p) => {
        const hasTemplate = Array.isArray(p?.planTemplate) && p.planTemplate.length > 0;
        const hasFamily = String(p?.calcFamily || "").trim().length > 0;
        return hasTemplate || hasFamily;
      }).length !== patterns.length
    ) {
      errors.push(
        `${label} calc execution contract coverage too low (${Math.max(nonEmptyTemplateCount, calcFamilyCount)}/${patterns.length}); all calc patterns must define calcFamily or planTemplate.`,
      );
    }
    if (label.startsWith("CALC") && tokensNoneCoverage < 0.3) {
      errors.push(
        `${label} tokens_none coverage too low (${tokensNoneCount}/${patterns.length}); minimum is 30%.`,
      );
    }

    // High-risk disambiguation groups must carry directional hooks per variant.
    for (const [group, rules] of Object.entries(HIGH_RISK_DIRECTIONAL_GROUPS)) {
      const groupPatterns = patterns.filter(
        (pattern) => String(pattern?.disambiguationGroup || "").trim() === group,
      );
      for (const pattern of groupPatterns) {
        const matchedRule = rules.find((rule) => rule.idPattern.test(String(pattern?.id || "")));
        if (!matchedRule) continue;
        if (!hasDirectionalHint(pattern, matchedRule.hints)) {
          errors.push(
            `${label} pattern ${pattern.id} in ${group} is missing directional disambiguation hints (${matchedRule.hints.join(", ")}).`,
          );
        }
      }
    }

    // Prevent machine-like examples unless explicitly marked synthetic.
    for (const pattern of patterns) {
      for (const example of pattern?.examples?.positive || []) {
        if (isOperatorLikeSyntheticExample(example)) {
          errors.push(
            `${label} pattern ${pattern.id} has operator-like positive example "${example}" (tag as [synthetic] or rewrite naturally).`,
          );
        }
      }
    }

    const collisions = collisionCounts.get(label) || 0;
    const collisionRatio = collisions / patterns.length;
    if (collisionRatio > 0.5) {
      errors.push(
        `${label} collision ratio too high (${collisions}/${patterns.length}).`,
      );
    } else if (collisionRatio > 0.25) {
      warnings.push(
        `${label} collision ratio is elevated (${collisions}/${patterns.length}).`,
      );
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
