#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");

const mapPath = path.join(
  dataBanksRoot,
  "semantics",
  "document_intelligence_bank_map.any.json",
);
const depsPath = path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json");
const registryPath = path.join(dataBanksRoot, "manifest", "bank_registry.any.json");
const outputPath = path.join(
  dataBanksRoot,
  "document_intelligence",
  "manifest",
  "dependency_graph.any.json",
);

const infraIds = [
  "document_intelligence_schema_registry",
  "document_intelligence_dependency_graph",
  "document_intelligence_usage_manifest",
  "document_intelligence_orphan_allowlist",
  "document_intelligence_runtime_wiring_gates",
  "document_intelligence_bank_map",
];

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

if (!fs.existsSync(mapPath) || !fs.existsSync(depsPath) || !fs.existsSync(registryPath)) {
  console.error("[docint-dependency-generator] missing one or more required input files");
  process.exit(1);
}

const map = readJson(mapPath);
const deps = readJson(depsPath);
const registry = readJson(registryPath);
const date = process.env.DOCINT_DATE || "2026-02-28";

const depsById = new Map(
  (Array.isArray(deps?.banks) ? deps.banks : [])
    .filter(Boolean)
    .map((entry) => [String(entry.id || "").trim(), list(entry.dependsOn)]),
);

const registryById = new Map(
  (Array.isArray(registry?.banks) ? registry.banks : [])
    .filter(Boolean)
    .map((entry) => [String(entry.id || "").trim(), list(entry.dependsOn)]),
);

const runtimeIds = uniqueSorted([
  ...list(map?.requiredCoreBankIds),
  ...list(map?.optionalBankIds),
  ...infraIds,
]);

const banks = runtimeIds
  .map((id) => {
    const dependsOn = uniqueSorted([
      ...(depsById.get(id) || []),
      ...(registryById.get(id) || []),
    ]);
    return { id, dependsOn };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const familyDependencies = [
  { idPrefix: "doc_archetypes_", dependsOn: ["doc_taxonomy"] },
  { idPrefix: "doc_aliases_", dependsOn: ["doc_taxonomy"] },
  { idPrefix: "table_header_ontology_", dependsOnIdPrefix: "doc_archetypes_" },
  { idPrefix: "operator_playbook_", dependsOnIdPrefix: "doc_archetypes_" },
  { idPrefix: "query_rewrites_", dependsOn: ["doc_taxonomy"] },
  { idPrefix: "boost_rules_", dependsOn: ["doc_taxonomy"] },
  { idPrefix: "section_priority_", dependsOn: ["doc_taxonomy"] },
  { idPrefix: "keyword_taxonomy_", dependsOnIdPrefix: "doc_archetypes_" },
  { idPrefix: "pain_points_", dependsOnIdPrefix: "keyword_taxonomy_" },
  { idPrefix: "legal_", dependsOn: ["legal_domain_profile"] },
  { idPrefix: "medical_", dependsOn: ["medical_domain_profile"] },
]
  .map((entry) => {
    const out = { ...entry };
    if (Array.isArray(entry.dependsOn)) {
      out.dependsOn = uniqueSorted(entry.dependsOn);
    }
    return out;
  })
  .sort((a, b) => String(a.idPrefix).localeCompare(String(b.idPrefix)));

const dependencyGraph = {
  _meta: {
    id: "document_intelligence_dependency_graph",
    version: "1.1.0",
    description:
      "Document intelligence dependency graph overlay used to enforce runtime wiring and prevent manifest drift.",
    languages: ["any"],
    lastUpdated: date,
  },
  config: {
    enabled: true,
    enforceAtBoot: true,
    failOnCycleInStrict: true,
    failOnMissingNodeInStrict: true,
  },
  banks,
  familyDependencies,
};

fs.writeFileSync(outputPath, `${JSON.stringify(dependencyGraph, null, 2)}\n`, "utf8");

console.log(
  `[docint-dependency-generator] wrote ${path.relative(repoRoot, outputPath)} with ${banks.length} nodes`,
);
