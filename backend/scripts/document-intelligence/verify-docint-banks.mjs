#!/usr/bin/env node

/**
 * verify-docint-banks.mjs
 *
 * Comprehensive document intelligence bank verification script.
 *
 * Checks performed:
 *   1. Load / Parse / Schema validation for all DI bank JSON files
 *   2. Registry cross-reference (disk <-> bank_registry)
 *   3. No empty critical arrays
 *   4. Dependency validation (graph integrity + cycle detection)
 *   5. Orphan detection (banks not consumed by any service)
 *   6. Cross-domain consistency (every domain has the same core bank families)
 *
 * Usage:
 *   node scripts/document-intelligence/verify-docint-banks.mjs
 *   node scripts/document-intelligence/verify-docint-banks.mjs --strict
 *
 * Exit codes:
 *   0 = all pass (or only warnings, unless --strict)
 *   1 = errors (or warnings in --strict mode)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import safeRegex from "safe-regex";

// ── paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const diRoot = path.join(dataBanksRoot, "document_intelligence");
const registryPath = path.join(dataBanksRoot, "manifest", "bank_registry.any.json");
const globalDepsPath = path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json");
const diDepsPath = path.join(diRoot, "manifest", "dependency_graph.any.json");
const usageManifestPath = path.join(diRoot, "manifest", "usage_manifest.any.json");
const orphanAllowlistPath = path.join(diRoot, "manifest", "orphan_allowlist.any.json");
const legacyDocTypeAliasesPath = path.join(
  diRoot,
  "eval",
  "suites",
  "legacy_doc_type_aliases.any.json",
);
const diBanksServicePath = path.join(
  repoRoot,
  "src",
  "services",
  "core",
  "banks",
  "documentIntelligenceBanks.service.ts",
);

const strict = process.argv.includes("--strict");

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toPosixPath(input) {
  return String(input || "").replace(/\\/g, "/");
}

function toPosixRelativePath(from, to) {
  return toPosixPath(path.relative(from, to));
}

/**
 * Recursively collect all .json files under a directory.
 */
function collectJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(full);
    }
  }
  return results;
}

// ── counters / accumulators ──────────────────────────────────────────────────
let passed = 0;
let warnings = 0;
let errors = 0;

const NON_REGISTRY_DI_REL_PATHS = new Set([
  "document_intelligence/__implementation_report.any.json",
  "document_intelligence/eval/suites/legacy_doc_type_aliases.any.json",
]);

function isLegacyLegalDocTypeAliasPath(relPath) {
  return /^document_intelligence\/domains\/legal\/doc_types\/(extraction|sections|tables)\/(?!legal_)[^/]+\.(extraction_hints|sections|tables)\.any\.json$/.test(
    relPath,
  );
}

function shouldRequireRegistryEntry(relPath) {
  if (NON_REGISTRY_DI_REL_PATHS.has(relPath)) return false;
  if (isLegacyLegalDocTypeAliasPath(relPath)) return false;
  return true;
}

function pass(msg) {
  passed++;
  console.log(`\u2713 ${msg}`);
}

function warn(msg) {
  warnings++;
  console.log(`\u26A0 ${msg}`);
}

function fail(msg) {
  errors++;
  console.log(`\u2717 ${msg}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. LOAD / PARSE / SCHEMA VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

const allDiFiles = collectJsonFiles(diRoot);

if (!allDiFiles.length) {
  fail("No JSON files found under document_intelligence/");
  printSummary();
  process.exit(1);
}

const parsedBanks = []; // { filePath, relPath, data, isEntitySchema }
const parseErrors = [];

for (const filePath of allDiFiles) {
  const relPath = toPosixRelativePath(dataBanksRoot, filePath);
  const isEntitySchema = filePath.endsWith(".entities.schema.json");

  let data;
  try {
    data = readJson(filePath);
  } catch (err) {
    parseErrors.push(`Invalid JSON: ${relPath} — ${err.message}`);
    continue;
  }

  parsedBanks.push({ filePath, relPath, data, isEntitySchema });

  // Entity schema files are JSON Schema definitions, not data banks — skip _meta checks.
  if (isEntitySchema) continue;

  // _meta.id
  const metaId = data?._meta?.id;
  if (!metaId || typeof metaId !== "string" || !metaId.trim()) {
    parseErrors.push(`Missing or empty _meta.id: ${relPath}`);
  }

  // _meta.version
  const metaVersion = data?._meta?.version;
  if (!metaVersion || typeof metaVersion !== "string" || !metaVersion.trim()) {
    parseErrors.push(`Missing or empty _meta.version: ${relPath}`);
  }

  // _meta.description (some older ontology/language banks use _meta.owner instead — accept either)
  const metaDesc = data?._meta?.description;
  const metaOwner = data?._meta?.owner;
  const hasDescription =
    (typeof metaDesc === "string" && metaDesc.trim().length > 0) ||
    (typeof metaOwner === "string" && metaOwner.trim().length > 0);
  if (!hasDescription) {
    parseErrors.push(`Missing or empty _meta.description (or _meta.owner): ${relPath}`);
  }

  // config.enabled where config object exists
  if (data?.config && typeof data.config === "object") {
    if (typeof data.config.enabled !== "boolean") {
      parseErrors.push(`Missing config.enabled (boolean): ${relPath}`);
    }
  }
}

if (parseErrors.length) {
  fail(`Parse/schema issues (${parseErrors.length}):`);
  for (const e of parseErrors) console.log(`    - ${e}`);
} else {
  pass(`Parsed ${parsedBanks.length} document intelligence banks (${allDiFiles.length} files)`);
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. REGISTRY CROSS-REFERENCE
// ══════════════════════════════════════════════════════════════════════════════

let registry;
try {
  registry = readJson(registryPath);
} catch (err) {
  fail(`Cannot load bank_registry: ${err.message}`);
  printSummary();
  process.exit(1);
}

const registryByPath = new Map();
const registryById = new Map();
for (const b of registry.banks || []) {
  if (b.path) registryByPath.set(toPosixPath(b.path), b);
  if (b.id) registryById.set(String(b.id), b);
}

// Only non-entity-schema DI banks need registry entries.
const diBanksForRegistry = parsedBanks.filter(
  (b) => !b.isEntitySchema && shouldRequireRegistryEntry(b.relPath),
);

const missingInRegistry = [];
for (const { relPath, data } of diBanksForRegistry) {
  if (registryByPath.has(relPath)) continue;

  // Allow canonical filename mirrors (same _meta.id already registered at another path).
  // This supports strict filename parity files without forcing duplicate registry IDs.
  const metaId = String(data?._meta?.id || "").trim();
  const canonicalEntry = metaId ? registryById.get(metaId) : null;
  if (canonicalEntry?.path && canonicalEntry.path !== relPath) {
    continue;
  }

  missingInRegistry.push(relPath);
}

// Registry entries pointing to DI paths that have no file on disk.
const diRegistryPaths = [...registryByPath.entries()]
  .filter(([p]) => p.startsWith("document_intelligence/"))
  .map(([p]) => toPosixPath(p));
const diskRelPaths = new Set(parsedBanks.map((b) => b.relPath));
const missingOnDisk = diRegistryPaths.filter((p) => !diskRelPaths.has(p));

if (missingInRegistry.length) {
  fail(`Missing registry entries (${missingInRegistry.length}): ${missingInRegistry.join(", ")}`);
} else {
  pass("All DI banks registered in bank_registry");
}

if (missingOnDisk.length) {
  fail(`Registry entries with no file on disk (${missingOnDisk.length}): ${missingOnDisk.join(", ")}`);
} else {
  pass("All DI registry entries have a file on disk");
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. NO EMPTY CRITICAL ARRAYS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Map of filename-pattern → array keys that must not be empty.
 * Each entry describes what content arrays we expect to be populated.
 */
const criticalArrayMap = [
  { pattern: /domain_detection_rules/, keys: ["rules"] },
  { pattern: /evidence_requirements/, keys: ["rules", "evidenceHierarchy", "requirements"] },
  { pattern: /reasoning_scaffolds/, keys: ["scaffolds"] },
  { pattern: /retrieval_strategies/, keys: ["sectionPriority", "boostRules", "queryExpansion", "strategies"] },
  { pattern: /answer_style_bank/, keys: ["audienceProfiles", "styleRules", "styles"] },
  { pattern: /validation_policies/, keys: ["rules", "policies"] },
  { pattern: /disclaimer_policy/, keys: ["disclaimers", "policies", "rules"] },
  { pattern: /redaction_and_safety_rules/, keys: ["rules", "redactionRules", "safetyRules"] },
  { pattern: /\.sections\.any\.json$/, keys: ["sections"] },
  { pattern: /\.tables\.any\.json$/, keys: ["tables"] },
  { pattern: /\.extraction_hints\.any\.json$/, keys: ["hints"] },
  { pattern: /doc_type_catalog/, keys: ["docTypes"] },
  { pattern: /abbreviation_global/, keys: ["abbreviations"] },
  { pattern: /normalization_rules/, keys: ["rules"] },
  { pattern: /doc_type_ontology/, keys: ["docTypes"] },
  { pattern: /domain_ontology/, keys: ["domains"] },
  { pattern: /entity_ontology/, keys: ["entities", "entityTypes"] },
  { pattern: /section_ontology/, keys: ["sections"] },
  { pattern: /metric_ontology/, keys: ["metrics"] },
  { pattern: /unit_and_measurement_ontology/, keys: ["units"] },
  { pattern: /abbreviations\//, keys: ["abbreviations", "entries", "terms"] },
  { pattern: /lexicons\//, keys: ["terms", "entries", "lexicon"] },
];

const emptyArrayWarnings = [];

for (const { relPath, data, isEntitySchema } of parsedBanks) {
  if (isEntitySchema) continue;

  for (const { pattern, keys } of criticalArrayMap) {
    if (!pattern.test(relPath)) continue;

    // At least one of the expected keys should be a non-empty array.
    const found = keys.some((k) => {
      const val = data[k];
      return Array.isArray(val) && val.length > 0;
    });

    if (!found) {
      emptyArrayWarnings.push(
        `${relPath}: expected non-empty array in one of [${keys.join(", ")}]`,
      );
    }
  }
}

if (emptyArrayWarnings.length) {
  warn(`Empty critical arrays (${emptyArrayWarnings.length}):`);
  for (const w of emptyArrayWarnings) console.log(`    - ${w}`);
} else {
  pass("No empty critical arrays");
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DEPENDENCY VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

let diDeps;
try {
  diDeps = readJson(diDepsPath);
} catch (err) {
  fail(`Cannot load DI dependency graph: ${err.message}`);
  diDeps = null;
}

const depErrors = [];

if (diDeps) {
  const depBanks = diDeps.banks || [];

  // Build adjacency list from DI dependency graph.
  const adjList = new Map(); // id → Set<dependsOn id>
  for (const node of depBanks) {
    const id = String(node.id || "");
    const deps = (node.dependsOn || []).map(String);
    adjList.set(id, new Set(deps));
  }

  // Check all referenced dependency IDs actually exist in the global registry.
  const allReferencedIds = new Set();
  for (const node of depBanks) {
    allReferencedIds.add(String(node.id || ""));
    for (const dep of node.dependsOn || []) {
      allReferencedIds.add(String(dep));
    }
  }

  for (const id of allReferencedIds) {
    if (!registryById.has(id)) {
      depErrors.push(`Dependency references unknown bank ID: ${id}`);
    }
  }

  // Also validate familyDependencies references.
  for (const fam of diDeps.familyDependencies || []) {
    for (const dep of fam.dependsOn || []) {
      if (!registryById.has(dep)) {
        depErrors.push(
          `Family dependency (prefix=${fam.idPrefix}) references unknown bank ID: ${dep}`,
        );
      }
    }
  }

  // Cycle detection using DFS.
  const visited = new Set();
  const inStack = new Set();
  let hasCycle = false;
  const cyclePath = [];

  function dfs(node) {
    if (hasCycle) return;
    if (inStack.has(node)) {
      hasCycle = true;
      cyclePath.push(node);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    const deps = adjList.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep);
        if (hasCycle) {
          cyclePath.push(node);
          return;
        }
      }
    }
    inStack.delete(node);
  }

  for (const id of adjList.keys()) {
    dfs(id);
    if (hasCycle) break;
  }

  if (hasCycle) {
    depErrors.push(`Circular dependency detected: ${cyclePath.reverse().join(" -> ")}`);
  }
}

if (depErrors.length) {
  fail(`Dependency issues (${depErrors.length}):`);
  for (const e of depErrors) console.log(`    - ${e}`);
} else if (diDeps) {
  pass("Dependencies valid (no missing refs, no cycles)");
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. ORPHAN DETECTION
// ══════════════════════════════════════════════════════════════════════════════

// Collect bank IDs from all non-entity-schema DI banks.
const allDiBankIds = new Set();
for (const { data, isEntitySchema, relPath } of parsedBanks) {
  if (isEntitySchema) continue;
  if (!shouldRequireRegistryEntry(relPath)) continue;
  const id = data?._meta?.id;
  if (id) allDiBankIds.add(String(id));
}

// Load orphan allowlist.
let allowlistedIds = new Set();
let allowlistedPrefixes = [];
let allowlistedPatterns = [];
try {
  if (fs.existsSync(orphanAllowlistPath)) {
    const allow = readJson(orphanAllowlistPath);
    allowlistedIds = new Set(
      (allow.allowlistedBankIds || []).map(String),
    );
    allowlistedPrefixes = (allow.allowlistedIdPrefixes || []).map(String);
    allowlistedPatterns = (allow.allowlistedIdPatterns || []).map((p) => {
      const re = new RegExp(p);
      if (!safeRegex(re)) {
        failures.push(`orphan_allowlist.allowlistedIdPatterns contains potentially unsafe regex (ReDoS risk): ${p}`);
      }
      return re;
    });
  }
} catch {
  // If we cannot load, proceed without allowlist.
}

function isAllowlisted(id) {
  if (allowlistedIds.has(id)) return true;
  if (allowlistedPrefixes.some((pfx) => id.startsWith(pfx))) return true;
  if (allowlistedPatterns.some((re) => re.test(id))) return true;
  return false;
}

let usageManifest = null;
try {
  if (fs.existsSync(usageManifestPath)) {
    usageManifest = readJson(usageManifestPath);
  }
} catch {
  // Ignore and continue with empty runtime consumption rules.
}

const consumedIds = new Set(
  ((usageManifest && usageManifest.consumedBankIds) || []).map((v) =>
    String(v || "").trim(),
  ),
);
const consumedPrefixes = ((usageManifest && usageManifest.consumedIdPrefixes) || [])
  .map((v) => String(v || "").trim())
  .filter(Boolean);
const consumedPatterns = ((usageManifest && usageManifest.consumedIdPatterns) || [])
  .map((pattern) => {
    try {
      const re = new RegExp(String(pattern || "").trim());
      if (!safeRegex(re)) {
        failures.push(`usage_manifest.consumedIdPatterns contains potentially unsafe regex (ReDoS risk): ${pattern}`);
      }
      return re;
    } catch {
      return null;
    }
  })
  .filter((re) => re != null);

const manifestFilesForUsage = [
  usageManifestPath,
  diDepsPath,
  path.join(diRoot, "manifest", "runtime_wiring_gates.any.json"),
  path.join(diRoot, "manifest", "bank_schema_registry.any.json"),
  globalDepsPath,
  path.join(dataBanksRoot, "semantics", "document_intelligence_bank_map.any.json"),
];
const manifestReferencedIds = new Set();
for (const mf of manifestFilesForUsage) {
  if (!mf || !fs.existsSync(mf)) continue;
  try {
    const payload = readJson(mf);
    const walk = (node) => {
      if (Array.isArray(node)) {
        for (const value of node) walk(value);
        return;
      }
      if (node && typeof node === "object") {
        for (const value of Object.values(node)) walk(value);
        return;
      }
      if (typeof node === "string") {
        const value = node.trim();
        if (value && registryById.has(value)) {
          manifestReferencedIds.add(value);
        }
      }
    };
    walk(payload);
  } catch {
    // Ignore individual manifest parse issues here; parser failures are caught elsewhere.
  }
}

function isConsumed(id) {
  if (consumedIds.has(id)) return true;
  if (consumedPrefixes.some((pfx) => id.startsWith(pfx))) return true;
  if (consumedPatterns.some((re) => re.test(id))) return true;
  if (manifestReferencedIds.has(id)) return true;
  return false;
}

const orphanBankIds = [];
for (const id of allDiBankIds) {
  if (isAllowlisted(id)) continue;
  if (!isConsumed(id)) {
    orphanBankIds.push(id);
  }
}

if (orphanBankIds.length) {
  warn(`Orphan banks not referenced by any consumer (${orphanBankIds.length}): ${orphanBankIds.join(", ")}`);
} else {
  pass("No orphan DI banks (all referenced or allowlisted)");
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. CROSS-DOMAIN CONSISTENCY
// ══════════════════════════════════════════════════════════════════════════════

const domainsDir = path.join(diRoot, "domains");
const domains = fs.existsSync(domainsDir)
  ? fs.readdirSync(domainsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

const coreBankFamilies = [
  "domain_profile",
  "domain_detection_rules",
  "answer_style_bank",
  "evidence_requirements",
  "reasoning_scaffolds",
  "retrieval_strategies",
];

const domainGaps = [];

for (const domain of domains) {
  const domainDir = path.join(domainsDir, domain);
  for (const family of coreBankFamilies) {
    const bankFile = path.join(domainDir, `${family}.any.json`);
    if (!fs.existsSync(bankFile)) {
      domainGaps.push(`${domain}: missing ${family}.any.json`);
    }
  }
}

if (domainGaps.length) {
  fail(`Cross-domain consistency gaps (${domainGaps.length}):`);
  for (const g of domainGaps) console.log(`    - ${g}`);
} else if (domains.length) {
  pass(`Cross-domain consistency OK (${domains.length} domains, ${coreBankFamilies.length} families each)`);
} else {
  warn("No domain directories found under document_intelligence/domains/");
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. DOMAIN TAXONOMY CONSISTENCY
// ══════════════════════════════════════════════════════════════════════════════

const domainConsistencyErrors = [];

function listUniqueStrings(values) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort();
}

function normalizeDomainWithAliases(domain, aliasMap) {
  let current = String(domain || "").trim();
  if (!current) return "";
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    if (seen.has(current)) break;
    seen.add(current);
    const next = aliasMap[current];
    if (!next || next === current) break;
    current = String(next).trim();
  }
  return current;
}

try {
  const domainOntology = readJson(
    path.join(diRoot, "semantics", "domain_ontology.any.json"),
  );
  const docTypeOntology = readJson(
    path.join(diRoot, "semantics", "doc_type_ontology.any.json"),
  );
  const sectionOntology = readJson(
    path.join(diRoot, "semantics", "section_ontology.any.json"),
  );
  const entityOntology = readJson(
    path.join(diRoot, "semantics", "entity_ontology.any.json"),
  );
  const metricOntology = readJson(
    path.join(diRoot, "semantics", "metric_ontology.any.json"),
  );
  const abbreviationGlobal = readJson(
    path.join(diRoot, "language", "abbreviation_global.any.json"),
  );
  const mapBank = readJson(
    path.join(dataBanksRoot, "semantics", "document_intelligence_bank_map.any.json"),
  );

  const canonicalDomains = listUniqueStrings(
    (domainOntology.domains || []).map((d) => d?.id),
  );
  const domainAliasMap =
    domainOntology?.config && typeof domainOntology.config === "object"
      ? Object.fromEntries(
          Object.entries(domainOntology.config.domainAliases || {}).map(([k, v]) => [
            String(k || "").trim(),
            String(v || "").trim(),
          ]),
        )
      : {};

  for (const canonical of Object.values(domainAliasMap)) {
    if (!canonicalDomains.includes(canonical)) {
      domainConsistencyErrors.push(
        `domain_ontology alias points to unknown canonical domain: ${canonical}`,
      );
    }
  }

  const collectedRefs = [];
  for (const item of docTypeOntology.docTypes || []) {
    if (item?.domainId) collectedRefs.push({ source: "doc_type_ontology.domainId", value: item.domainId });
  }
  for (const item of sectionOntology.sections || []) {
    for (const domain of item?.domains || []) {
      collectedRefs.push({ source: "section_ontology.domains", value: domain });
    }
  }
  for (const item of entityOntology.entityTypes || []) {
    if (item?.domain) collectedRefs.push({ source: "entity_ontology.domain", value: item.domain });
    for (const domain of item?.domains || []) {
      collectedRefs.push({ source: "entity_ontology.domains", value: domain });
    }
  }
  for (const item of metricOntology.metrics || []) {
    if (item?.domain) collectedRefs.push({ source: "metric_ontology.domain", value: item.domain });
  }
  for (const item of abbreviationGlobal.abbreviations || []) {
    if (item?.domain) collectedRefs.push({ source: "abbreviation_global.domain", value: item.domain });
  }
  for (const domain of mapBank?.domains || []) {
    collectedRefs.push({ source: "document_intelligence_bank_map.domains", value: domain });
  }
  for (const domain of mapBank?.extendedDomains || []) {
    collectedRefs.push({ source: "document_intelligence_bank_map.extendedDomains", value: domain });
  }

  const unknownRefs = [];
  for (const ref of collectedRefs) {
    const normalized = normalizeDomainWithAliases(ref.value, domainAliasMap);
    if (!canonicalDomains.includes(normalized)) {
      unknownRefs.push(`${ref.source}: ${ref.value}`);
    }
  }
  if (unknownRefs.length) {
    domainConsistencyErrors.push(
      `Unknown domain references (${unknownRefs.length}): ${unknownRefs.slice(0, 20).join(", ")}`,
    );
  }

  const mapDomains = listUniqueStrings(mapBank?.domains || []);
  const mapExtendedDomains = listUniqueStrings(mapBank?.extendedDomains || []);
  const mapUniverse = listUniqueStrings([...mapDomains, ...mapExtendedDomains]).map((d) =>
    normalizeDomainWithAliases(d, domainAliasMap),
  );
  const mapCoverageMissing = canonicalDomains.filter((d) => !mapUniverse.includes(d));
  if (mapCoverageMissing.length) {
    domainConsistencyErrors.push(
      `document_intelligence_bank_map missing canonical domains (domains + extendedDomains): ${mapCoverageMissing.join(", ")}`,
    );
  }

  const serviceSource = fs.existsSync(diBanksServicePath)
    ? fs.readFileSync(diBanksServicePath, "utf8")
    : "";
  if (!serviceSource) {
    domainConsistencyErrors.push(
      `Cannot read runtime domain source: ${path.relative(repoRoot, diBanksServicePath)}`,
    );
  } else {
    const extractDomainArrayLiterals = (constName) => {
      const marker = `const ${constName}: DocumentIntelligenceDomain[] = [`;
      const start = serviceSource.indexOf(marker);
      if (start < 0) return [];
      const bodyStart = start + marker.length;
      const end = serviceSource.indexOf("];", bodyStart);
      if (end < 0) return [];
      const body = serviceSource.slice(bodyStart, end);
      return [...body.matchAll(/\"([a-z_]+)\"/g)].map((m) => m[1]);
    };

    const coreDomains = extractDomainArrayLiterals("CORE_DOMAINS");
    const extendedDomains = extractDomainArrayLiterals("EXTENDED_DOMAINS");
    let serviceDomains = listUniqueStrings([...coreDomains, ...extendedDomains]);
    if (serviceDomains.length === 0) {
      serviceDomains = listUniqueStrings(extractDomainArrayLiterals("DOMAINS"));
    }

    if (serviceDomains.length === 0) {
      domainConsistencyErrors.push(
        "Could not parse service domain constants from DocumentIntelligenceBanksService",
      );
    } else {
      const onlyInService = serviceDomains.filter((d) => !canonicalDomains.includes(d));
      const onlyInOntology = canonicalDomains.filter((d) => !serviceDomains.includes(d));
      if (onlyInService.length || onlyInOntology.length) {
        domainConsistencyErrors.push(
          `Runtime DOMAINS mismatch with domain_ontology: onlyInService=[${onlyInService.join(", ")}] onlyInOntology=[${onlyInOntology.join(", ")}]`,
        );
      }
    }
  }

  const domainDirs = fs.existsSync(domainsDir)
    ? fs.readdirSync(domainsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  const dirNotInOntology = domainDirs.filter((d) => !canonicalDomains.includes(d));
  if (dirNotInOntology.length) {
    domainConsistencyErrors.push(
      `Domain directories missing from domain_ontology: ${dirNotInOntology.join(", ")}`,
    );
  }
} catch (err) {
  domainConsistencyErrors.push(
    `Failed to evaluate domain taxonomy consistency: ${err?.message || err}`,
  );
}

if (domainConsistencyErrors.length) {
  fail(`Domain taxonomy consistency issues (${domainConsistencyErrors.length}):`);
  for (const issue of domainConsistencyErrors) console.log(`    - ${issue}`);
} else {
  pass("Domain taxonomy consistency OK across ontology, map, runtime constants, and references");
}

// 8. DOC TYPE SSOT CONSISTENCY (taxonomy clusters vs domain catalogs)
const docTypeSsotErrors = [];

try {
  const taxonomy = readJson(
    path.join(dataBanksRoot, "semantics", "taxonomy", "doc_taxonomy.any.json"),
  );
  const clusters =
    taxonomy?.clusters && typeof taxonomy.clusters === "object"
      ? taxonomy.clusters
      : {};

  const legacyAliases = fs.existsSync(legacyDocTypeAliasesPath)
    ? readJson(legacyDocTypeAliasesPath)
    : {};

  const domainDirs = fs.existsSync(domainsDir)
    ? fs.readdirSync(domainsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

  const taxonomyDomains = Object.keys(clusters).map((d) => String(d || "").trim());
  const allDomains = [...new Set([...domainDirs, ...taxonomyDomains])]
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .sort();

  for (const domain of allDomains) {
    const canonicalSet = new Set(
      Array.isArray(clusters[domain])
        ? clusters[domain].map((v) => String(v || "").trim()).filter(Boolean)
        : [],
    );
    if (!canonicalSet.size) {
      docTypeSsotErrors.push(`doc_taxonomy.clusters missing or empty for domain: ${domain}`);
      continue;
    }

    const catalogPath = path.join(
      domainsDir,
      domain,
      "doc_types",
      "doc_type_catalog.any.json",
    );
    if (!fs.existsSync(catalogPath)) {
      docTypeSsotErrors.push(`missing doc_type_catalog.any.json for domain: ${domain}`);
      continue;
    }

    const catalog = readJson(catalogPath);
    const catalogIds = new Set(
      (Array.isArray(catalog?.docTypes) ? catalog.docTypes : [])
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
    );

    const aliasMapRaw =
      legacyAliases && typeof legacyAliases[domain] === "object"
        ? legacyAliases[domain]
        : {};
    const aliasMap = Object.fromEntries(
      Object.entries(aliasMapRaw || {}).map(([k, v]) => [
        String(k || "").trim(),
        String(v || "").trim(),
      ]),
    );

    const aliasKeys = new Set(Object.keys(aliasMap).filter(Boolean));
    const aliasTargets = new Set(Object.values(aliasMap).filter(Boolean));

    const invalidAliasTargets = [...aliasTargets]
      .filter((target) => !canonicalSet.has(target))
      .sort();
    if (invalidAliasTargets.length) {
      docTypeSsotErrors.push(
        `legacy aliases for ${domain} map to unknown canonical IDs: ${invalidAliasTargets.join(", ")}`,
      );
    }

    const undeclaredCatalogIds = [...catalogIds]
      .filter((id) => !canonicalSet.has(id) && !aliasKeys.has(id))
      .sort();
    if (undeclaredCatalogIds.length) {
      docTypeSsotErrors.push(
        `${domain} catalog has IDs not declared in taxonomy or legacy aliases: ${undeclaredCatalogIds.join(", ")}`,
      );
    }

    const missingCanonicalIds = [...canonicalSet]
      .filter((id) => !catalogIds.has(id) && !aliasTargets.has(id))
      .sort();
    if (missingCanonicalIds.length) {
      docTypeSsotErrors.push(
        `${domain} catalog missing canonical taxonomy IDs: ${missingCanonicalIds.join(", ")}`,
      );
    }

  }
} catch (err) {
  docTypeSsotErrors.push(
    `Failed to evaluate doc type SSOT consistency: ${err?.message || err}`,
  );
}

if (docTypeSsotErrors.length) {
  fail(`Doc type SSOT consistency issues (${docTypeSsotErrors.length}):`);
  for (const issue of docTypeSsotErrors) console.log(`    - ${issue}`);
} else {
  pass("Doc type SSOT consistency OK across taxonomy clusters, domain catalogs, and legacy aliases");
}

// ══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

function printSummary() {
  console.log("");
  console.log(`SUMMARY: ${passed} passed, ${warnings} warnings, ${errors} errors`);
}

printSummary();

if (errors > 0) {
  process.exit(1);
}
if (strict && warnings > 0) {
  console.log("(--strict mode: warnings treated as errors)");
  process.exit(1);
}

process.exit(0);
