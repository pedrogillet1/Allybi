#!/usr/bin/env node
import fs from "fs";
import path from "path";

const repoRoot = path.resolve(process.cwd());
const root = path.join(repoRoot, "src", "data_banks");
const strict = process.argv.includes("--strict");

function load(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function sorted(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

function setDiff(a, b) {
  return sorted([...a].filter((v) => !b.has(v)));
}

function normalizeAlias(alias, config) {
  let out = String(alias || "").trim();
  if (!out) return "";
  if (config?.collapseWhitespace !== false) out = out.replace(/\s+/g, " ");
  if (config?.stripDiacritics) out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (config?.caseSensitive !== true) out = out.toLowerCase();
  return out;
}

const manifest = load("manifest/bank_manifest.any.json");
const registry = load("manifest/bank_registry.any.json");
const deps = load("manifest/bank_dependencies.any.json");
const aliases = load("manifest/bank_aliases.any.json");
const checksums = load("manifest/bank_checksums.any.json");
const versioning = load("manifest/versioning.any.json");
const diDep = load("document_intelligence/manifest/dependency_graph.any.json");
const diUsage = load("document_intelligence/manifest/usage_manifest.any.json");

const failures = [];
const warnings = [];

const banks = Array.isArray(registry?.banks) ? registry.banks : [];
const registryIds = new Set(banks.map((b) => String(b?.id || "").trim()).filter(Boolean));
const registryPaths = new Set(banks.map((b) => String(b?.path || "").trim()).filter(Boolean));
const registryCategories = new Set(
  banks.map((b) => String(b?.category || "").trim()).filter(Boolean),
);

const manifestCategories = new Set(
  Array.isArray(manifest?.allowedCategoryIds)
    ? manifest.allowedCategoryIds.map((c) => String(c || "").trim()).filter(Boolean)
    : [],
);
const depsCategories = new Set(
  Object.keys(deps?.categories || {})
    .map((k) => String(k || "").trim())
    .filter((k) => k && !k.startsWith("_")),
);
const versionCategories = new Set(
  (Array.isArray(versioning?.categoryCompatibility)
    ? versioning.categoryCompatibility
    : []
  )
    .map((entry) => String(entry?.category || "").trim())
    .filter(Boolean),
);

const missingInManifest = setDiff(registryCategories, manifestCategories);
const extraInManifest = setDiff(manifestCategories, registryCategories);
if (missingInManifest.length > 0) {
  failures.push(`manifest.allowedCategoryIds missing: ${missingInManifest.join(", ")}`);
}
if (extraInManifest.length > 0) {
  warnings.push(`manifest.allowedCategoryIds extra (not in registry): ${extraInManifest.join(", ")}`);
}

const missingInDepsCategories = setDiff(registryCategories, depsCategories);
if (missingInDepsCategories.length > 0) {
  failures.push(`bank_dependencies.categories missing: ${missingInDepsCategories.join(", ")}`);
}

const missingInVersioningCategories = setDiff(registryCategories, versionCategories);
if (missingInVersioningCategories.length > 0) {
  failures.push(`versioning.categoryCompatibility missing: ${missingInVersioningCategories.join(", ")}`);
}

const depNodes = Array.isArray(deps?.banks) ? deps.banks : [];
const depNodeIds = new Set(depNodes.map((n) => String(n?.id || "").trim()).filter(Boolean));
const depNodesMissing = setDiff(registryIds, depNodeIds);
const depUnknownIds = setDiff(depNodeIds, registryIds);
if (depNodesMissing.length > 0) {
  failures.push(`bank_dependencies missing nodes for registry ids: ${depNodesMissing.length}`);
}
if (depUnknownIds.length > 0) {
  failures.push(`bank_dependencies contains unknown node ids: ${depUnknownIds.join(", ")}`);
}

for (const entry of banks) {
  const id = String(entry?.id || "").trim();
  const depsOn = Array.isArray(entry?.dependsOn)
    ? entry.dependsOn.map((dep) => String(dep || "").trim()).filter(Boolean)
    : [];
  for (const dep of depsOn) {
    if (!registryIds.has(dep)) {
      failures.push(`bank_registry unresolved dependency: ${id} -> ${dep}`);
    }
  }
}

for (const node of depNodes) {
  const id = String(node?.id || "").trim();
  const depsOn = Array.isArray(node?.dependsOn)
    ? node.dependsOn.map((dep) => String(dep || "").trim()).filter(Boolean)
    : [];
  for (const dep of depsOn) {
    if (!registryIds.has(dep)) {
      failures.push(`bank_dependencies unresolved dependency: ${id} -> ${dep}`);
    }
  }
}

const aliasEntries = Array.isArray(aliases?.aliases)
  ? aliases.aliases
  : Object.entries(aliases?.aliases || {}).map(([alias, canonicalId]) => ({ alias, canonicalId }));
const aliasConfig = aliases?.config || {};
for (const aliasEntry of aliasEntries) {
  const canonicalId = String(aliasEntry?.canonicalId || "").trim();
  if (!canonicalId || !registryIds.has(canonicalId)) {
    failures.push(`bank_aliases dangling canonicalId: ${canonicalId || "<empty>"}`);
  }
}
const normalizedAliasMap = new Map();
for (const aliasEntry of aliasEntries) {
  const alias = String(aliasEntry?.alias || "").trim();
  const canonicalId = String(aliasEntry?.canonicalId || "").trim();
  if (!alias || !canonicalId) continue;
  const normalized = normalizeAlias(alias, aliasConfig);
  if (!normalized) continue;
  const existing = normalizedAliasMap.get(normalized);
  if (existing && existing !== canonicalId) {
    failures.push(`bank_aliases normalized collision: ${alias} -> ${canonicalId} conflicts with ${existing}`);
  } else {
    normalizedAliasMap.set(normalized, canonicalId);
  }
}
for (const id of registryIds) {
  const normalized = normalizeAlias(id, aliasConfig);
  const canonical = normalizedAliasMap.get(normalized);
  if (canonical !== id) {
    failures.push(`bank_aliases missing self-alias for ${id}`);
  }
}

const checksumEntries = checksums?.checksums || {};
const checksumPaths = new Set(Object.keys(checksumEntries));
const checksumMissingRegistry = setDiff(registryPaths, checksumPaths);
const checksumExtra = setDiff(checksumPaths, registryPaths);
if (checksumMissingRegistry.length > 0) {
  failures.push(`bank_checksums missing registry paths: ${checksumMissingRegistry.length}`);
}
if (checksumExtra.length > 0) {
  warnings.push(`bank_checksums has extra paths: ${checksumExtra.join(", ")}`);
}
for (const [relPath, entry] of Object.entries(checksumEntries)) {
  const required = Boolean(entry?.required);
  const sha = String(entry?.sha256 || "").trim();
  if (required && !sha) {
    failures.push(`bank_checksums required sha256 empty: ${relPath}`);
  }
}

const allowlist = Array.isArray(versioning?.bankAllowlist?.ranges)
  ? versioning.bankAllowlist.ranges
  : [];
for (const range of allowlist) {
  const id = String(range?.id || "").trim();
  const reg = banks.find((b) => String(b?.id || "").trim() === id);
  if (!reg) {
    failures.push(`versioning allowlist missing registry bank: ${id}`);
    continue;
  }
  const version = String(reg?.version || "").trim();
  const majorMatch = version.match(/^(\d+)\./);
  if (!majorMatch) {
    failures.push(`registry bank has invalid semver: ${id}@${version}`);
    continue;
  }
  const major = Number(majorMatch[1]);
  const allowed = (Array.isArray(range?.allowedVersions) ? range.allowedVersions : []).some((raw) => {
    const match = String(raw || "").match(/^(\d+)\.0\.0\s*-\s*(\d+)\.9\.9$/);
    if (!match) return false;
    const min = Number(match[1]);
    const max = Number(match[2]);
    return major >= min && major <= max;
  });
  if (!allowed) {
    failures.push(`versioning allowlist mismatch: ${id}@${version}`);
  }
}

const diNodes = Array.isArray(diDep?.banks) ? diDep.banks : [];
for (const node of diNodes) {
  const id = String(node?.id || "").trim();
  if (!id) continue;
  if (!registryIds.has(id) && !id.startsWith("document_intelligence_")) {
    failures.push(`di dependency_graph node missing in registry: ${id}`);
  }
}

const usageConsumedIds = new Set(
  (Array.isArray(diUsage?.consumedBankIds) ? diUsage.consumedBankIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean),
);
for (const id of usageConsumedIds) {
  if (!registryIds.has(id)) {
    failures.push(`di usage_manifest consumedBankIds missing in registry: ${id}`);
  }
}

const report = {
  strict,
  failures: failures.length,
  warnings: warnings.length,
  failureSample: failures.slice(0, 30),
  warningSample: warnings.slice(0, 30),
};

if (failures.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
if (strict && warnings.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
