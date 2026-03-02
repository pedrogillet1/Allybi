#!/usr/bin/env node

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const strict = process.argv.includes("--strict");

const paths = {
  registry: path.join(dataBanksRoot, "manifest", "bank_registry.any.json"),
  aliases: path.join(dataBanksRoot, "manifest", "bank_aliases.any.json"),
  dependencies: path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json"),
  map: path.join(dataBanksRoot, "semantics", "document_intelligence_bank_map.any.json"),
  usage: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "usage_manifest.any.json",
  ),
  orphan: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "orphan_allowlist.any.json",
  ),
  gates: path.join(
    dataBanksRoot,
    "document_intelligence",
    "manifest",
    "runtime_wiring_gates.any.json",
  ),
};

const infraIds = [
  "document_intelligence_bank_map",
  "document_intelligence_schema_registry",
  "document_intelligence_dependency_graph",
  "document_intelligence_usage_manifest",
  "document_intelligence_orphan_allowlist",
  "document_intelligence_runtime_wiring_gates",
];

const generatedChecksumCategories = new Set(["manifest"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function list(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function matchesCoverage(id, prefixes, patterns, exactIds) {
  if (exactIds.has(id)) return true;
  if (prefixes.some((prefix) => id.startsWith(prefix))) return true;
  return patterns.some((regex) => regex.test(id));
}

function compileRegexList(values, failures, label) {
  const out = [];
  for (const raw of values) {
    try {
      out.push(new RegExp(raw));
    } catch {
      failures.push(`${label} contains invalid regex: ${raw}`);
    }
  }
  return out;
}

for (const [key, filePath] of Object.entries(paths)) {
  if (!fs.existsSync(filePath)) {
    console.error(`[docint-registry] missing file for ${key}: ${filePath}`);
    process.exit(1);
  }
}

const registry = readJson(paths.registry);
const aliases = readJson(paths.aliases);
const dependencies = readJson(paths.dependencies);
const map = readJson(paths.map);
const usage = readJson(paths.usage);
const orphan = readJson(paths.orphan);
const gates = readJson(paths.gates);

const failures = [];
const warnings = [];

const registryBanks = Array.isArray(registry?.banks) ? registry.banks : [];
const depsBanks = Array.isArray(dependencies?.banks) ? dependencies.banks : [];
const aliasEntries = Array.isArray(aliases?.aliases) ? aliases.aliases : [];
const gatesList = Array.isArray(gates?.gates) ? gates.gates : [];

const ids = registryBanks.map((entry) => String(entry?.id || "").trim());
const idSet = new Set();
const duplicateIds = [];
for (const id of ids) {
  if (!id) continue;
  if (idSet.has(id)) duplicateIds.push(id);
  idSet.add(id);
}
if (duplicateIds.length > 0) {
  failures.push(`Duplicate bank ids in registry: ${uniqueSorted(duplicateIds).join(", ")}`);
}

const registryById = new Map(
  registryBanks
    .map((entry) => [String(entry?.id || "").trim(), entry])
    .filter(([id]) => id),
);
const depIds = new Set(
  depsBanks.map((entry) => String(entry?.id || "").trim()).filter(Boolean),
);
const selfAliases = new Set(
  aliasEntries
    .map((entry) => [String(entry?.alias || "").trim(), String(entry?.canonicalId || "").trim()])
    .filter(([alias, canonical]) => alias && canonical && alias === canonical)
    .map(([alias]) => alias),
);

const usageConsumedIds = new Set(list(usage?.consumedBankIds));
const usagePrefixes = list(usage?.consumedIdPrefixes);
const usagePatterns = compileRegexList(
  list(usage?.consumedIdPatterns),
  failures,
  "usage_manifest.consumedIdPatterns",
);

const allowlistedIds = new Set(list(orphan?.allowlistedBankIds));
const allowlistedPrefixes = list(orphan?.allowlistedIdPrefixes);
const allowlistedPatterns = compileRegexList(
  list(orphan?.allowlistedIdPatterns),
  failures,
  "orphan_allowlist.allowlistedIdPatterns",
);

const allProofTests = uniqueSorted(
  gatesList.flatMap((gate) => list(gate?.proofTests)),
);
for (const relPath of allProofTests) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Proof test missing on disk: ${relPath}`);
  }
}

const familyRules = gatesList.flatMap((gate) => {
  const families = Array.isArray(gate?.requiredFamilies)
    ? gate.requiredFamilies
    : [];
  return families.map((family) => ({
    id: String(family?.id || "").trim(),
    sampleBankIds: new Set(list(family?.sampleBankIds)),
    prefixes: list(family?.bankIdPrefixes),
    patterns: compileRegexList(
      list(family?.bankIdPatterns),
      failures,
      `runtime_wiring_gates.requiredFamilies(${String(family?.id || "")}).bankIdPatterns`,
    ),
    proofTests: list(family?.proofTests),
  }));
});

for (const family of familyRules) {
  if (family.proofTests.length === 0) {
    failures.push(`requiredFamilies entry has no proofTests: ${family.id || "<unknown>"}`);
  }
}

const runtimeIds = uniqueSorted([
  ...list(map?.requiredCoreBankIds),
  ...list(map?.optionalBankIds),
  ...infraIds,
]);

for (const id of runtimeIds) {
  const reg = registryById.get(id);
  if (!reg) {
    failures.push(`Runtime bank missing in registry: ${id}`);
    continue;
  }

  if (!depIds.has(id)) {
    failures.push(`Runtime bank missing in bank_dependencies: ${id}`);
  }

  if (!selfAliases.has(id)) {
    failures.push(`Runtime bank missing self-alias in bank_aliases: ${id}`);
  }

  const consumed = matchesCoverage(
    id,
    usagePrefixes,
    usagePatterns,
    usageConsumedIds,
  );
  const allowlisted = matchesCoverage(
    id,
    allowlistedPrefixes,
    allowlistedPatterns,
    allowlistedIds,
  );
  if (!consumed && !allowlisted) {
    failures.push(`Runtime bank has no usage coverage and is not allowlisted: ${id}`);
  }

  if (!allowlisted) {
    const familyCovered = familyRules.some((family) =>
      matchesCoverage(id, family.prefixes, family.patterns, family.sampleBankIds),
    );
    if (!familyCovered) {
      failures.push(`Runtime bank has no family proof coverage rule: ${id}`);
    }
  }
}

for (const entry of registryBanks) {
  const id = String(entry?.id || "").trim();
  const relPath = String(entry?.path || "").trim();
  if (!id || !relPath) continue;
  if (id === "bank_registry" && relPath === "manifest/bank_registry.any.json") {
    // Self-referential checksum entry; validated via banks:checksum flow.
    continue;
  }
  if (id === "bank_checksums" && relPath === "manifest/bank_checksums.any.json") {
    // Self-referential checksum entry; checksum content changes as checksums are regenerated.
    continue;
  }

  const fullPath = path.join(dataBanksRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Registry path missing on disk: ${id} -> ${relPath}`);
    continue;
  }

  const expected = String(entry?.checksumSha256 || "").trim().toLowerCase();
  if (!expected) continue;
  const actual = sha256File(fullPath);
  if (actual === expected) continue;

  const category = String(entry?.category || "").trim().toLowerCase();
  const isGeneratedLike =
    generatedChecksumCategories.has(category) ||
    relPath.includes("document_intelligence/manifest/") ||
    id.startsWith("document_intelligence_");
  if (isGeneratedLike) {
    warnings.push(
      `Checksum mismatch flagged as generated/governance bank: ${id} (${relPath})`,
    );
  } else {
    failures.push(`Checksum mismatch: ${id} (${relPath})`);
  }
}

const summary = {
  strict,
  runtimeBankCount: runtimeIds.length,
  registryBankCount: registryBanks.length,
  dependencyNodeCount: depsBanks.length,
  familyRuleCount: familyRules.length,
  proofTestCount: allProofTests.length,
  failures: failures.length,
  warnings: warnings.length,
};

if (failures.length > 0) {
  console.error(`[docint-registry] failed with ${failures.length} issue(s)`);
  for (const issue of failures) {
    console.error(` - ${issue}`);
  }
  if (warnings.length > 0) {
    console.error(`[docint-registry] warnings (${warnings.length})`);
    for (const warning of warnings) {
      console.error(` - ${warning}`);
    }
  }
  process.exit(1);
}

if (strict && warnings.length > 0) {
  console.error(
    `[docint-registry] strict mode failed due to warnings (${warnings.length})`,
  );
  for (const warning of warnings) {
    console.error(` - ${warning}`);
  }
  process.exit(1);
}

console.log(`[docint-registry] ok ${JSON.stringify(summary)}`);
if (warnings.length > 0) {
  console.log(`[docint-registry] warnings (${warnings.length})`);
  for (const warning of warnings) {
    console.log(` - ${warning}`);
  }
}
