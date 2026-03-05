#!/usr/bin/env node

/**
 * Document Intelligence Evaluation Runner
 *
 * Loads suite_registry, reads all JSONL eval cases, validates references
 * (docTypeId, queryFamily), checks EN/PT parity, and prints coverage summary.
 *
 * Usage:
 *   node scripts/eval/run_docint_eval.mjs [--strict] [--suite <suite_id>]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const evalRoot = path.join(dataBanksRoot, "document_intelligence", "eval");

const strict = process.argv.includes("--strict");
const suiteFilter = (() => {
  const idx = process.argv.indexOf("--suite");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const failures = [];
const warnings = [];

const LEGACY_DOC_TYPE_ALIASES_PATH = path.join(
  evalRoot,
  "suites",
  "legacy_doc_type_aliases.any.json",
);

function fail(msg) {
  failures.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function loadLegacyDocTypeAliases() {
  if (!fs.existsSync(LEGACY_DOC_TYPE_ALIASES_PATH)) {
    warn(`Missing legacy doc type aliases at ${LEGACY_DOC_TYPE_ALIASES_PATH}`);
    return {};
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(LEGACY_DOC_TYPE_ALIASES_PATH, "utf8"),
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail(
        `Invalid legacy doc type aliases payload at ${LEGACY_DOC_TYPE_ALIASES_PATH}`,
      );
      return {};
    }
    return parsed;
  } catch (error) {
    fail(
      `Invalid JSON in legacy doc type aliases: ${LEGACY_DOC_TYPE_ALIASES_PATH} — ${error.message}`,
    );
    return {};
  }
}

const LEGACY_DOC_TYPE_ALIASES = loadLegacyDocTypeAliases();

// ── Load doc type catalogs (core + extended) ───────────────────────────
function loadCoreTaxonomyByDomain() {
  const taxPath = path.join(
    dataBanksRoot,
    "semantics",
    "taxonomy",
    "doc_taxonomy.any.json",
  );
  if (!fs.existsSync(taxPath)) {
    fail(`Missing doc_taxonomy at ${taxPath}`);
    return new Map();
  }
  const tax = JSON.parse(fs.readFileSync(taxPath, "utf8"));
  const byDomain = new Map();
  const clusters = tax.clusters || {};
  for (const domain of Object.keys(clusters)) {
    const normalizedDomain = String(domain || "").trim().toLowerCase();
    if (!normalizedDomain) continue;
    if (!byDomain.has(normalizedDomain)) byDomain.set(normalizedDomain, new Set());
    const arr = clusters[domain];
    if (Array.isArray(arr)) {
      for (const id of arr) {
        const normalizedId = String(id || "").trim();
        if (normalizedId) byDomain.get(normalizedDomain).add(normalizedId);
      }
    }
  }
  return byDomain;
}

function loadExtendedCatalogByDomain() {
  const domainsRoot = path.join(dataBanksRoot, "document_intelligence", "domains");
  if (!fs.existsSync(domainsRoot)) {
    warn(`Missing document_intelligence domains root at ${domainsRoot}`);
    return new Map();
  }

  const byDomain = new Map();
  const dirs = fs
    .readdirSync(domainsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dir of dirs) {
    const catalogPath = path.join(
      domainsRoot,
      dir,
      "doc_types",
      "doc_type_catalog.any.json",
    );
    if (!fs.existsSync(catalogPath)) continue;

    try {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      const domain =
        String(catalog?.domain || catalog?.config?.domain || dir || "")
          .trim()
          .toLowerCase();
      if (!domain) {
        warn(`Catalog has empty domain: ${catalogPath}`);
        continue;
      }

      if (!byDomain.has(domain)) byDomain.set(domain, new Set());
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
      for (const entry of docTypes) {
        const id = String(entry?.id || "").trim();
        if (id) byDomain.get(domain).add(id);
      }
    } catch (error) {
      fail(`Invalid JSON in doc_type_catalog: ${catalogPath} — ${error.message}`);
    }
  }

  return byDomain;
}

function mergeDocTypeCatalogs(...maps) {
  const byDomain = new Map();
  for (const m of maps) {
    for (const [domain, ids] of m.entries()) {
      const normalizedDomain = String(domain || "").trim().toLowerCase();
      if (!normalizedDomain) continue;
      if (!byDomain.has(normalizedDomain)) byDomain.set(normalizedDomain, new Set());
      for (const id of ids) {
        const normalizedId = String(id || "").trim();
        if (normalizedId) byDomain.get(normalizedDomain).add(normalizedId);
      }
    }
  }
  return byDomain;
}

function flattenDocTypesByDomain(byDomain) {
  const all = new Set();
  for (const ids of byDomain.values()) {
    for (const id of ids) all.add(id);
  }
  return all;
}

function loadAllowedDomains(registry) {
  const allowed = new Set();
  for (const suite of registry?.suites || []) {
    for (const domain of suite?.domains || []) {
      const normalized = String(domain || "").trim().toLowerCase();
      if (normalized) allowed.add(normalized);
    }
  }
  return allowed;
}

function resolveLegacyDocTypeAlias(domain, docTypeId) {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  const rawDocTypeId = String(docTypeId || "").trim();
  if (!normalizedDomain || !rawDocTypeId) return rawDocTypeId;
  const aliases = LEGACY_DOC_TYPE_ALIASES[normalizedDomain] || null;
  if (!aliases) return rawDocTypeId;
  return aliases[rawDocTypeId] || rawDocTypeId;
}

// ── Load operator families ─────────────────────────────────────────────
function loadQueryFamilies() {
  const famPath = path.join(
    dataBanksRoot,
    "routing",
    "operator_families.any.json",
  );
  if (!fs.existsSync(famPath)) {
    warn(`Missing operator_families — skipping queryFamily validation`);
    return null;
  }
  const fam = JSON.parse(fs.readFileSync(famPath, "utf8"));
  const families = new Set();
  for (const f of fam.families || []) {
    if (f.id) families.add(f.id);
  }
  return families;
}

// ── Load suite registry ────────────────────────────────────────────────
function loadRegistry() {
  const regPath = path.join(evalRoot, "suites", "suite_registry.any.json");
  if (!fs.existsSync(regPath)) {
    fail(`Missing suite_registry at ${regPath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

// ── Parse JSONL ────────────────────────────────────────────────────────
function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing JSONL file: ${filePath}`);
    return [];
  }
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  const cases = [];
  for (let i = 0; i < lines.length; i++) {
    try {
      cases.push(JSON.parse(lines[i]));
    } catch (e) {
      fail(`Invalid JSON at ${filePath}:${i + 1} — ${e.message}`);
    }
  }
  return cases;
}

// ── Load cases for a suite ─────────────────────────────────────────────
function loadSuiteCases(suite) {
  const suitePath = suite.path;
  const fullPath = path.join(dataBanksRoot, suitePath);

  if (suitePath.endsWith("/")) {
    // Directory — load all .qa.jsonl files
    if (!fs.existsSync(fullPath)) {
      fail(`Missing eval directory: ${fullPath}`);
      return [];
    }
    const files = fs
      .readdirSync(fullPath)
      .filter((f) => f.endsWith(".qa.jsonl"))
      .sort();
    if (files.length === 0) {
      fail(`No .qa.jsonl files in ${fullPath}`);
      return [];
    }
    let allCases = [];
    for (const f of files) {
      allCases = allCases.concat(parseJsonl(path.join(fullPath, f)));
    }
    return allCases;
  }

  return parseJsonl(path.join(dataBanksRoot, suitePath));
}

// ── Validate a single case ─────────────────────────────────────────────
function validateCase(c, suite, validDocTypesByDomain, allDocTypes, validFamilies, allowedDomains) {
  const errs = [];
  const suiteId = suite?.id || "<missing-suite-id>";
  const caseId = c.id || "<missing-id>";
  const caseDomain = String(c.domain || "").trim().toLowerCase();
  const suiteDomains = new Set(
    Array.isArray(suite?.domains)
      ? suite.domains.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
      : [],
  );

  if (!c.id || typeof c.id !== "string") errs.push("missing/invalid id");
  if (!["en", "pt"].includes(c.lang)) errs.push(`invalid lang: ${c.lang}`);
  if (!caseDomain) {
    errs.push(`invalid domain: ${c.domain}`);
  } else {
    if (allowedDomains.size > 0 && !allowedDomains.has(caseDomain)) {
      errs.push(`invalid domain: ${c.domain}`);
    }
    if (suiteDomains.size > 0 && !suiteDomains.has(caseDomain)) {
      errs.push(`domain not declared by suite: ${caseDomain}`);
    }
  }
  if (!c.docTypeId || typeof c.docTypeId !== "string")
    errs.push("missing docTypeId");
  else {
    const canonicalDocTypeId = resolveLegacyDocTypeAlias(caseDomain, c.docTypeId);
    const domainSet = caseDomain ? validDocTypesByDomain.get(caseDomain) : null;
    if (domainSet && domainSet.size > 0) {
      if (!domainSet.has(canonicalDocTypeId)) {
        errs.push(`unknown docTypeId for domain ${caseDomain}: ${c.docTypeId}`);
      }
    } else if (allDocTypes.size > 0 && !allDocTypes.has(canonicalDocTypeId)) {
      errs.push(`unknown docTypeId: ${c.docTypeId}`);
    }
  }
  if (!c.queryFamily || typeof c.queryFamily !== "string")
    errs.push("missing queryFamily");
  else if (validFamilies && !validFamilies.has(c.queryFamily))
    errs.push(`unknown queryFamily: ${c.queryFamily}`);
  if (!c.query || typeof c.query !== "string") errs.push("missing query");
  if (!c.expected || typeof c.expected !== "object")
    errs.push("missing expected");
  else {
    if (!Array.isArray(c.expected.mustCite)) errs.push("missing mustCite array");
    if (!Array.isArray(c.expected.mustNotDo)) errs.push("missing mustNotDo array");
    if (typeof c.expected.format !== "string") errs.push("missing format");
    if (typeof c.expected.negative !== "boolean") errs.push("missing negative boolean");
  }

  if (errs.length > 0) {
    fail(`[${suiteId}] case ${caseId}: ${errs.join("; ")}`);
  }
  return errs.length === 0;
}

// ── Main ───────────────────────────────────────────────────────────────
const registry = loadRegistry();
if (!registry) {
  console.error("[docint-eval] Cannot load suite registry — aborting.");
  process.exit(1);
}

const coreDocTypesByDomain = loadCoreTaxonomyByDomain();
const extendedDocTypesByDomain = loadExtendedCatalogByDomain();
const validDocTypesByDomain = mergeDocTypeCatalogs(
  coreDocTypesByDomain,
  extendedDocTypesByDomain,
);
const validDocTypes = flattenDocTypesByDomain(validDocTypesByDomain);
const allowedDomains = loadAllowedDomains(registry);
const validFamilies = loadQueryFamilies();

const suites = (registry.suites || []).filter(
  (s) => !suiteFilter || s.id === suiteFilter,
);

if (suites.length === 0) {
  console.error(
    suiteFilter
      ? `[docint-eval] No suite found with id=${suiteFilter}`
      : "[docint-eval] No suites in registry",
  );
  process.exit(1);
}

const summary = [];

for (const suite of suites) {
  const cases = loadSuiteCases(suite);
  const validCases = cases.filter((c) =>
    validateCase(
      c,
      suite,
      validDocTypesByDomain,
      validDocTypes,
      validFamilies,
      allowedDomains,
    ),
  );

  // Count metrics
  const total = cases.length;
  const enCount = cases.filter((c) => c.lang === "en").length;
  const ptCount = cases.filter((c) => c.lang === "pt").length;
  const negCount = cases.filter((c) => c.expected?.negative === true).length;
  const negRatio = total > 0 ? negCount / total : 0;

  // Duplicate ID check
  const idSet = new Set();
  for (const c of cases) {
    if (c.id && idSet.has(c.id)) {
      fail(`[${suite.id}] duplicate id: ${c.id}`);
    }
    if (c.id) idSet.add(c.id);
  }

  // Domain coverage
  const domainCounts = {};
  for (const c of cases) {
    domainCounts[c.domain] = (domainCounts[c.domain] || 0) + 1;
  }

  // DocType coverage
  const docTypeCounts = {};
  for (const c of cases) {
    docTypeCounts[c.docTypeId] = (docTypeCounts[c.docTypeId] || 0) + 1;
  }

  // Threshold checks
  if (total < suite.minimumCases) {
    fail(
      `[${suite.id}] case count ${total} below minimum ${suite.minimumCases}`,
    );
  }

  if (negRatio < (registry.config?.minimumNegativeRatio || 0.2)) {
    fail(
      `[${suite.id}] negative ratio ${(negRatio * 100).toFixed(1)}% below minimum 20%`,
    );
  }

  // EN/PT parity
  const parityTolerance =
    (registry.config?.parityTolerancePercent || 10) / 100;
  if (total > 0) {
    const enRatio = enCount / total;
    const ptRatio = ptCount / total;
    if (Math.abs(enRatio - ptRatio) > parityTolerance) {
      fail(
        `[${suite.id}] EN/PT parity gap: EN=${enCount} PT=${ptCount} (${(Math.abs(enRatio - ptRatio) * 100).toFixed(1)}% gap, max ${(parityTolerance * 100).toFixed(0)}%)`,
      );
    }
  }

  summary.push({
    suite: suite.id,
    total,
    valid: validCases.length,
    en: enCount,
    pt: ptCount,
    negative: negCount,
    negPct: `${(negRatio * 100).toFixed(1)}%`,
    domains: Object.keys(domainCounts).length,
    docTypes: Object.keys(docTypeCounts).length,
    pass: total >= suite.minimumCases,
  });
}

// ── Print results ──────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════");
console.log("  Document Intelligence Eval Coverage Report");
console.log("═══════════════════════════════════════════════════════\n");

console.log(
  "Suite".padEnd(26) +
    "Total".padStart(6) +
    "EN".padStart(5) +
    "PT".padStart(5) +
    "Neg%".padStart(6) +
    "Doms".padStart(6) +
    "DocT".padStart(6) +
    "Pass".padStart(6),
);
console.log("─".repeat(66));

for (const s of summary) {
  console.log(
    s.suite.padEnd(26) +
      String(s.total).padStart(6) +
      String(s.en).padStart(5) +
      String(s.pt).padStart(5) +
      s.negPct.padStart(6) +
      String(s.domains).padStart(6) +
      String(s.docTypes).padStart(6) +
      (s.pass ? "  ✓" : "  ✗").padStart(6),
    );
}

console.log("─".repeat(66));
const totalCases = summary.reduce((a, s) => a + s.total, 0);
const totalEn = summary.reduce((a, s) => a + s.en, 0);
const totalPt = summary.reduce((a, s) => a + s.pt, 0);
console.log(
  "TOTAL".padEnd(26) +
    String(totalCases).padStart(6) +
    String(totalEn).padStart(5) +
    String(totalPt).padStart(5),
);
console.log(
  `[docint-eval] catalogs: domains=${validDocTypesByDomain.size}, docTypes=${validDocTypes.size}, coreDomains=${coreDocTypesByDomain.size}, extendedDomains=${extendedDocTypesByDomain.size}`,
);

if (warnings.length > 0) {
  console.log(`\n[docint-eval] warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}

if (failures.length > 0) {
  console.error(`\n[docint-eval] FAILED with ${failures.length} issue(s):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  if (strict) process.exit(1);
} else {
  console.log("\n[docint-eval] ALL CHECKS PASSED ✓");
}
