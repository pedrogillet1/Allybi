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
const outputPath = path.join(
  dataBanksRoot,
  "document_intelligence",
  "manifest",
  "usage_manifest.any.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function list(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function matches(id, consumedIds, prefixes, patterns) {
  if (consumedIds.has(id)) return true;
  if (prefixes.some((prefix) => id.startsWith(prefix))) return true;
  return patterns.some((regex) => regex.test(id));
}

if (!fs.existsSync(mapPath)) {
  console.error(`[docint-usage-generator] missing map: ${mapPath}`);
  process.exit(1);
}

const map = readJson(mapPath);
const date = process.env.DOCINT_DATE || "2026-02-28";

const runtimeConsumers = [
  {
    id: "document_intelligence_banks_service",
    path: "src/services/core/banks/documentIntelligenceBanks.service.ts",
    uses: [
      "doc_aliases_*",
      "doc_archetypes_*",
      "boost_rules_*",
      "query_rewrites_*",
      "section_priority_*",
      "operator_playbook_*",
      "legal_*",
      "medical_*",
      "di_*_ontology",
      "di_normalization_rules",
      "di_abbreviation_global",
      "document_intelligence_*",
    ],
  },
  {
    id: "document_intelligence_integrity",
    path: "src/services/core/banks/documentIntelligenceIntegrity.service.ts",
    uses: [
      "document_intelligence_bank_map",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_runtime_wiring_gates",
      "document_intelligence_schema_registry",
    ],
  },
  {
    id: "quality_gate_runner",
    path: "src/services/core/enforcement/qualityGateRunner.service.ts",
    uses: [
      "numeric_integrity",
      "wrong_doc_lock",
      "source_policy",
      "ambiguity_questions",
    ],
  },
  {
    id: "retrieval_engine",
    path: "src/services/core/retrieval/retrievalEngine.service.ts",
    uses: ["query_rewrites_*", "boost_rules_*", "section_priority_*"],
  },
  {
    id: "scope_gate",
    path: "src/services/core/scope/scopeGate.service.ts",
    uses: ["doc_taxonomy", "doc_aliases_*"],
  },
  {
    id: "document_reference_resolver",
    path: "src/services/core/scope/documentReferenceResolver.service.ts",
    uses: ["doc_aliases_*"],
  },
  {
    id: "turn_route_policy",
    path: "src/services/chat/turnRoutePolicy.service.ts",
    uses: ["connectors_routing", "email_routing"],
  },
  {
    id: "turn_router",
    path: "src/services/chat/turnRouter.service.ts",
    uses: ["file_action_operators"],
  },
]
  .map((consumer) => ({
    ...consumer,
    uses: uniqueSorted(consumer.uses),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const consumedIdPrefixes = uniqueSorted([
  "doc_aliases_",
  "doc_archetypes_",
  "table_header_ontology_",
  "operator_playbook_",
  "query_rewrites_",
  "boost_rules_",
  "section_priority_",
  "keyword_taxonomy_",
  "pain_points_",
  "explain_style_",
  "decision_support_",
  "di_finance_",
  "di_accounting_",
  "di_doc_type_",
  "di_domain_",
  "di_entity_",
  "di_metric_",
  "di_section_",
  "di_unit_and_measurement_",
  "legal_",
  "medical_",
]);

const consumedIdPatterns = uniqueSorted([
  "^document_intelligence_(schema_registry|dependency_graph|usage_manifest|orphan_allowlist|runtime_wiring_gates)$",
  "^(money_patterns|date_patterns|party_patterns|identifier_patterns)$",
  "^pattern_library$",
]);

const baseConsumedIds = uniqueSorted([
  "document_intelligence_bank_map",
  "document_intelligence_schema_registry",
  "document_intelligence_dependency_graph",
  "document_intelligence_usage_manifest",
  "document_intelligence_orphan_allowlist",
  "document_intelligence_runtime_wiring_gates",
  "doc_taxonomy",
  "headings_map",
  "sheetname_patterns",
  "layout_cues",
  "assumption_policy",
  "numeric_integrity",
  "wrong_doc_lock",
  "source_policy",
  "ambiguity_questions",
  "finance_kpi_ontology",
  "accounting_rules",
  "finance_doc_logic",
  "legal_clause_ontology",
  "legal_risk_heuristics",
  "legal_reference_rules",
  "medical_report_ontology",
  "medical_safety_boundaries",
  "medical_explanation_templates",
  "ops_kpi_ontology",
  "ops_doc_logic",
]);

const runtimeIds = uniqueSorted([
  ...list(map?.requiredCoreBankIds),
  ...list(map?.optionalBankIds),
]);
const consumedIdsSet = new Set(baseConsumedIds);
const compiledPatterns = consumedIdPatterns.map((pattern) => new RegExp(pattern));
for (const id of runtimeIds) {
  if (!matches(id, consumedIdsSet, consumedIdPrefixes, compiledPatterns)) {
    consumedIdsSet.add(id);
  }
}

const usageManifest = {
  _meta: {
    id: "document_intelligence_usage_manifest",
    version: "1.1.0",
    description:
      "Runtime usage manifest for document intelligence banks. Declares consumer wiring and coverage rules used to prevent orphan runtime banks.",
    languages: ["any"],
    lastUpdated: date,
  },
  config: {
    enabled: true,
    enforceAtBoot: true,
    failOnOrphanInStrict: true,
    enforceFacadeOnly: true,
  },
  runtimeConsumers,
  consumedBankIds: uniqueSorted([...consumedIdsSet]),
  consumedIdPrefixes,
  consumedIdPatterns,
};

fs.writeFileSync(outputPath, `${JSON.stringify(usageManifest, null, 2)}\n`, "utf8");

console.log(
  `[docint-usage-generator] wrote ${path.relative(repoRoot, outputPath)} with ${usageManifest.consumedBankIds.length} consumed ids`,
);
