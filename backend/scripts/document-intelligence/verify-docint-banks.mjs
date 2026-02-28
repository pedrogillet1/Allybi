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

// ── paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const diRoot = path.join(dataBanksRoot, "document_intelligence");
const registryPath = path.join(dataBanksRoot, "manifest", "bank_registry.any.json");
const globalDepsPath = path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json");
const diDepsPath = path.join(diRoot, "manifest", "dependency_graph.any.json");
const orphanAllowlistPath = path.join(diRoot, "manifest", "orphan_allowlist.any.json");

const strict = process.argv.includes("--strict");

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  const relPath = path.relative(dataBanksRoot, filePath);
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
  if (b.path) registryByPath.set(String(b.path), b);
  if (b.id) registryById.set(String(b.id), b);
}

// Only non-entity-schema DI banks need registry entries.
const diBanksForRegistry = parsedBanks.filter((b) => !b.isEntitySchema);

const missingInRegistry = [];
for (const { relPath } of diBanksForRegistry) {
  if (!registryByPath.has(relPath)) {
    missingInRegistry.push(relPath);
  }
}

// Registry entries pointing to DI paths that have no file on disk.
const diRegistryPaths = [...registryByPath.entries()]
  .filter(([p]) => p.startsWith("document_intelligence/"))
  .map(([p]) => p);
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
for (const { data, isEntitySchema } of parsedBanks) {
  if (isEntitySchema) continue;
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
    allowlistedPatterns = (allow.allowlistedIdPatterns || []).map(
      (p) => new RegExp(p),
    );
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

// Scan TS/MJS source files for bank ID references.
const srcDirs = [
  path.join(repoRoot, "src", "services"),
  path.join(repoRoot, "src", "modules"),
  path.join(repoRoot, "src", "controllers"),
  path.join(repoRoot, "src", "bootstrap"),
  path.join(repoRoot, "src", "entrypoints"),
  path.join(repoRoot, "src", "queues"),
  path.join(repoRoot, "src", "workers"),
];

function collectSourceFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          walk(full);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs") || entry.name.endsWith(".js"))
        ) {
          files.push(full);
        }
      }
    };
    walk(dir);
  }
  return files;
}

const sourceFiles = collectSourceFiles(srcDirs);
const sourceContents = sourceFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

// Also scan data_banks JSON files that consume other banks (e.g. usage_manifest, dependency_graph,
// bank_dependencies, etc.) so that manifest-level references count as usage.
const manifestFiles = [
  orphanAllowlistPath,
  diDepsPath,
  path.join(diRoot, "manifest", "usage_manifest.any.json"),
  path.join(diRoot, "manifest", "runtime_wiring_gates.any.json"),
  path.join(diRoot, "manifest", "bank_schema_registry.any.json"),
  globalDepsPath,
];
let manifestContents = "";
for (const mf of manifestFiles) {
  try {
    if (fs.existsSync(mf)) manifestContents += fs.readFileSync(mf, "utf8") + "\n";
  } catch {
    // skip
  }
}

const combinedSearchCorpus = sourceContents + "\n" + manifestContents;

const orphanBankIds = [];
for (const id of allDiBankIds) {
  if (isAllowlisted(id)) continue;
  // Check if the exact ID string appears somewhere in source or manifest files.
  if (!combinedSearchCorpus.includes(id)) {
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
