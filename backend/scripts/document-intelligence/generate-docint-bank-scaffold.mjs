#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dataBanksRoot = path.join(repoRoot, "src", "data_banks");
const registryPath = path.join(dataBanksRoot, "manifest", "bank_registry.any.json");
const depsPath = path.join(dataBanksRoot, "manifest", "bank_dependencies.any.json");
const aliasesPath = path.join(dataBanksRoot, "manifest", "bank_aliases.any.json");

const today = new Date().toISOString().slice(0, 10);
const domains = ["finance", "legal", "medical", "ops"];
const operators = [
  "navigate",
  "open",
  "extract",
  "summarize",
  "compare",
  "locate",
  "calculate",
  "evaluate",
  "validate",
  "advise",
  "monitor",
];

function envMap(value) {
  return {
    production: value,
    staging: value,
    dev: value,
    local: value,
  };
}

function mkMeta(id, description) {
  return {
    _meta: {
      id,
      version: "1.0.0",
      description,
      languages: ["any"],
      lastUpdated: today,
    },
  };
}

/** @type {Array<{id:string,category:string,path:string,description:string,dependsOn?:string[],required?:boolean,payload:(id:string)=>any,optional?:boolean}>} */
const defs = [];

function add(def) {
  defs.push(def);
}

add({
  id: "document_intelligence_bank_map",
  category: "semantics",
  path: "semantics/document_intelligence_bank_map.any.json",
  description:
    "Canonical map of all document-intelligence banks, required coverage, and domain/operator matrix.",
  dependsOn: ["bank_registry"],
  required: true,
  payload: () => {
    const coreIds = [];
    const optionalIds = [];
    for (const d of defs) {
      if (d.id === "document_intelligence_bank_map") continue;
      if (d.optional) optionalIds.push(d.id);
      else coreIds.push(d.id);
    }
    return {
      ...mkMeta(
        "document_intelligence_bank_map",
        "Canonical map of all document-intelligence banks, required coverage, and domain/operator matrix.",
      ),
      config: {
        enabled: true,
        enforceAtBoot: true,
        failStrictEnvsOnMissing: true,
        strictEnvs: ["production", "staging"],
      },
      domains,
      operators,
      requiredCoreBankIds: coreIds,
      optionalBankIds: optionalIds,
      groupedByArea: {
        taxonomy: defs
          .filter((d) => d.path.includes("/taxonomy/"))
          .map((d) => d.id),
        structure: defs
          .filter((d) => d.path.includes("/structure/"))
          .map((d) => d.id),
        entities: defs
          .filter((d) => d.path.includes("/entities/"))
          .map((d) => d.id),
        domain: defs
          .filter((d) => d.path.includes("/domain/"))
          .map((d) => d.id),
        operators: defs
          .filter((d) => d.path.includes("operators/playbooks/"))
          .map((d) => d.id),
        reasoning: defs
          .filter((d) => d.path.includes("policies/reasoning/"))
          .map((d) => d.id),
        quality: defs
          .filter((d) => d.path.includes("quality/document_intelligence/"))
          .map((d) => d.id),
        retrieval: defs
          .filter((d) => d.path.includes("retrieval/document_intelligence/"))
          .map((d) => d.id),
        marketing: defs
          .filter((d) => d.path.includes("probes/marketing/"))
          .map((d) => d.id),
      },
      tests: {
        cases: [
          {
            id: "DOCINT_0001_non_empty_core",
            assert: "requiredCoreBankIds.length > 0",
          },
          {
            id: "DOCINT_0002_domains_present",
            assert: "domains includes finance, legal, medical, ops",
          },
        ],
      },
    };
  },
});

add({
  id: "doc_taxonomy",
  category: "semantics",
  path: "semantics/taxonomy/doc_taxonomy.any.json",
  description:
    "Master taxonomy of document types across finance, legal, medical, and operations.",
  required: true,
  payload: () => ({
    ...mkMeta(
      "doc_taxonomy",
      "Master taxonomy of document types across finance, legal, medical, and operations.",
    ),
    config: { enabled: true, defaultLanguage: "any" },
    clusters: {
      finance: [
        "profit_and_loss",
        "balance_sheet",
        "cash_flow",
        "budget",
        "forecast",
        "board_pack",
        "covenant_report",
      ],
      legal: [
        "msa",
        "nda",
        "lease",
        "spa",
        "employment_agreement",
        "privacy_policy",
        "terms_and_conditions",
      ],
      medical: [
        "lab_report",
        "imaging_report",
        "discharge_summary",
        "prescription_list",
        "referral_letter",
      ],
      operations: [
        "sop",
        "runbook",
        "incident_report",
        "vendor_sla",
        "audit_checklist",
      ],
    },
    typeDefinitions: [],
  }),
});

for (const domain of domains) {
  add({
    id: `doc_archetypes_${domain}`,
    category: "semantics",
    path: `semantics/taxonomy/doc_archetypes/${domain}.any.json`,
    description: `Document archetype definitions for ${domain}.`,
    dependsOn: ["doc_taxonomy"],
    required: true,
    payload: () => ({
      ...mkMeta(
        `doc_archetypes_${domain}`,
        `Document archetype definitions for ${domain}.`,
      ),
      config: { enabled: true, domain },
      domain,
      archetypes: [
        {
          id: `${domain}_default_archetype`,
          label: `${domain} default archetype`,
          expectedSections: [],
          fieldFamilies: [],
          redFlags: [],
        },
      ],
    }),
  });

  add({
    id: `doc_aliases_${domain}`,
    category: "normalizers",
    path: `normalizers/doc_aliases/${domain}.any.json`,
    description: `User alias mapping for ${domain} documents.`,
    dependsOn: ["doc_taxonomy"],
    required: true,
    payload: () => ({
      ...mkMeta(`doc_aliases_${domain}`, `User alias mapping for ${domain} documents.`),
      config: { enabled: true, domain, caseInsensitive: true },
      domain,
      aliases: [
        {
          alias: `${domain} document`,
          docTypes: [],
          hints: {
            period: "unknown",
            owner: "unknown",
          },
        },
      ],
    }),
  });
}

add({
  id: "headings_map",
  category: "semantics",
  path: "semantics/structure/headings_map.any.json",
  description:
    "Canonical heading ontology with multilingual synonyms for structural section detection.",
  dependsOn: ["doc_taxonomy"],
  required: true,
  payload: () => ({
    ...mkMeta(
      "headings_map",
      "Canonical heading ontology with multilingual synonyms for structural section detection.",
    ),
    config: { enabled: true, languages: ["en", "pt"] },
    headings: [
      {
        canonical: "termination",
        synonyms: { en: ["termination"], pt: ["rescisao", "encerramento"] },
        domainTags: ["legal"],
      },
    ],
  }),
});

for (const domain of domains) {
  add({
    id: `table_header_ontology_${domain}`,
    category: "semantics",
    path: `semantics/structure/table_header_ontology.${domain}.any.json`,
    description: `Table header ontology for ${domain}.`,
    dependsOn: [`doc_archetypes_${domain}`],
    required: true,
    payload: () => ({
      ...mkMeta(
        `table_header_ontology_${domain}`,
        `Table header ontology for ${domain}.`,
      ),
      config: { enabled: true, domain },
      domain,
      headers: [
        {
          canonical: `${domain}_primary_header`,
          synonyms: [],
          related: [],
        },
      ],
    }),
  });
}

add({
  id: "sheetname_patterns",
  category: "semantics",
  path: "semantics/structure/sheetname_patterns.any.json",
  description: "Spreadsheet sheet-name pattern normalization and canonical mapping.",
  dependsOn: ["doc_taxonomy"],
  required: true,
  payload: () => ({
    ...mkMeta(
      "sheetname_patterns",
      "Spreadsheet sheet-name pattern normalization and canonical mapping.",
    ),
    config: { enabled: true },
    patterns: [
      { canonical: "profit_and_loss", synonyms: ["p&l", "income statement", "dre"] },
      { canonical: "budget", synonyms: ["budget", "forecast", "plan"] },
    ],
  }),
});

add({
  id: "layout_cues",
  category: "semantics",
  path: "semantics/structure/layout_cues.any.json",
  description: "Layout cues for signatures, footers, appendices, and pagination semantics.",
  dependsOn: ["doc_taxonomy"],
  required: true,
  payload: () => ({
    ...mkMeta(
      "layout_cues",
      "Layout cues for signatures, footers, appendices, and pagination semantics.",
    ),
    config: { enabled: true },
    cues: [
      {
        id: "signature_block",
        patterns: ["signed by", "signature", "assinatura"],
        meaning: "signature_block",
      },
    ],
  }),
});

for (const bank of [
  ["money_patterns", "Monetary extraction patterns including symbols, units, and accounting negatives."],
  ["date_patterns", "Date extraction patterns with multilingual normalization and fiscal period hints."],
  ["party_patterns", "Entity-role extraction patterns for counterparties, signatories, providers, and vendors."],
  ["identifier_patterns", "Document identifier patterns (invoice, claim, contract, policy, MRN, and related ids)."],
]) {
  const [id, description] = bank;
  add({
    id,
    category: "semantics",
    path: `semantics/entities/${id}.any.json`,
    description,
    dependsOn: ["doc_taxonomy"],
    required: true,
    payload: () => ({
      ...mkMeta(id, description),
      config: { enabled: true },
      rules: [
        {
          id: `${id}_rule_001`,
          pattern: "",
          notes: "Populate domain-specific extraction patterns.",
        },
      ],
    }),
  });
}

for (const [id, description, domain] of [
  ["finance_kpi_ontology", "Finance KPI ontology with definitions, formula metadata, and synonyms.", "finance"],
  ["accounting_rules", "Accounting interpretation policy: accrual/cash handling, recurring/non-recurring classification, and period logic.", "finance"],
  ["finance_doc_logic", "Finance document interpretation logic for budget-vs-actual-vs-forecast decisions.", "finance"],
  ["legal_clause_ontology", "Legal clause ontology and multilingual synonym mapping.", "legal"],
  ["legal_risk_heuristics", "Legal risk heuristics for high-risk clause detection and ambiguity prompts.", "legal"],
  ["legal_reference_rules", "Legal grounding rules requiring exact quote fidelity and location references.", "legal"],
  ["medical_report_ontology", "Medical report ontology with panels, abbreviations, and interpretation anchors.", "medical"],
  ["medical_safety_boundaries", "Medical safety boundary policy controlling caution language and escalation guidance.", "medical"],
  ["medical_explanation_templates", "Medical explanation templates for plain-language summaries with reference ranges.", "medical"],
]) {
  add({
    id,
    category: "semantics",
    path: `semantics/domain/${id}.any.json`,
    description,
    dependsOn: [domain ? `doc_archetypes_${domain}` : "doc_taxonomy"],
    required: true,
    payload: () => ({
      ...mkMeta(id, description),
      config: { enabled: true, domain },
      domain,
      definitions: [],
      rules: [],
    }),
  });
}

for (const operator of operators) {
  for (const domain of domains) {
    add({
      id: `operator_playbook_${operator}_${domain}`,
      category: "operators",
      path: `operators/playbooks/${operator}/${domain}.any.json`,
      description: `${operator} operator playbook for ${domain} documents.`,
      dependsOn: [`doc_archetypes_${domain}`, `doc_aliases_${domain}`, `operator_contracts`],
      required: true,
      payload: () => ({
        ...mkMeta(
          `operator_playbook_${operator}_${domain}`,
          `${operator} operator playbook for ${domain} documents.`,
        ),
        config: { enabled: true, operator, domain },
        operator,
        domain,
        lookFor: [],
        outputStructure: {
          requiredBlocks: [],
          optionalBlocks: [],
        },
        validationChecks: [],
        askQuestionWhen: [],
      }),
    });
  }
}

for (const domain of domains) {
  add({
    id: `explain_style_${domain}`,
    category: "policies",
    path: `policies/reasoning/explain_style.${domain}.any.json`,
    description: `Explanation style policy for ${domain} audiences and depth levels.`,
    dependsOn: [`doc_archetypes_${domain}`],
    required: true,
    payload: () => ({
      ...mkMeta(
        `explain_style_${domain}`,
        `Explanation style policy for ${domain} audiences and depth levels.`,
      ),
      config: { enabled: true, domain },
      domain,
      audienceStyles: [
        { audience: "expert", tone: "precise", defaultDepth: "detailed" },
        { audience: "general", tone: "clear", defaultDepth: "summary" },
      ],
      depthLadder: ["paragraph", "detailed", "executive_brief"],
    }),
  });

  add({
    id: `decision_support_${domain}`,
    category: "policies",
    path: `policies/reasoning/decision_support.${domain}.any.json`,
    description: `Decision-support policy for ${domain} recommendations with risks and evidence confidence framing.`,
    dependsOn: [`explain_style_${domain}`, "assumption_policy"],
    required: true,
    payload: () => ({
      ...mkMeta(
        `decision_support_${domain}`,
        `Decision-support policy for ${domain} recommendations with risks and evidence confidence framing.`,
      ),
      config: { enabled: true, domain },
      domain,
      framework: {
        requireOptions: true,
        requireRiskTradeoffs: true,
        requireEvidenceSummary: true,
        forbidFalseCertainty: true,
      },
      templates: [],
    }),
  });
}

add({
  id: "assumption_policy",
  category: "policies",
  path: "policies/reasoning/assumption_policy.any.json",
  description:
    "Assumption policy controlling when assumptions are allowed, when to ask clarifying questions, and how to label uncertainty.",
  dependsOn: ["clarification_policy"],
  required: true,
  payload: () => ({
    ...mkMeta(
      "assumption_policy",
      "Assumption policy controlling when assumptions are allowed, when to ask clarifying questions, and how to label uncertainty.",
    ),
    config: { enabled: true, maxAssumptionsPerAnswer: 2 },
    rules: [
      {
        id: "ASSUME_001",
        whenAllowed: ["low_risk_context", "explicit_user_permission"],
        whenForbidden: ["legal_high_risk", "medical_high_risk", "financial_commitment"],
        labelFormat: "Assumption: {text}",
      },
    ],
  }),
});

for (const [id, description] of [
  ["numeric_integrity", "Numeric integrity policy for currency/percent/unit consistency, period alignment, and non-truncation guarantees."],
  ["wrong_doc_lock", "Wrong-doc lock policy enforcing explicit filename/doc lock constraints and discovery exceptions."],
  ["source_policy", "Source rendering policy controlling citation/pills behavior per answer mode."],
  ["ambiguity_questions", "Single-question ambiguity templates and rules per domain for unresolved high-impact uncertainty."],
]) {
  add({
    id,
    category: "quality",
    path: `quality/document_intelligence/${id}.any.json`,
    description,
    dependsOn: ["quality_gates"],
    required: true,
    payload: () => ({
      ...mkMeta(id, description),
      config: { enabled: true },
      rules: [],
      templates: {
        finance: [],
        legal: [],
        medical: [],
        ops: [],
      },
    }),
  });
}

for (const domain of domains) {
  add({
    id: `query_rewrites_${domain}`,
    category: "retrieval",
    path: `retrieval/document_intelligence/query_rewrites.${domain}.any.json`,
    description: `Domain query rewrite rules for ${domain} retrieval intent expansion.`,
    dependsOn: [`doc_aliases_${domain}`],
    required: true,
    payload: () => ({
      ...mkMeta(
        `query_rewrites_${domain}`,
        `Domain query rewrite rules for ${domain} retrieval intent expansion.`,
      ),
      config: { enabled: true, domain, maxRewriteTerms: 8 },
      domain,
      rules: [
        {
          id: `${domain}_rewrite_001`,
          patterns: [],
          rewrites: [],
          priority: 100,
        },
      ],
    }),
  });

  add({
    id: `boost_rules_${domain}`,
    category: "retrieval",
    path: `retrieval/document_intelligence/boost_rules.${domain}.any.json`,
    description: `Domain boost rules for ${domain} retrieval ranking by intent and document type.`,
    dependsOn: [`doc_archetypes_${domain}`],
    required: true,
    payload: () => ({
      ...mkMeta(
        `boost_rules_${domain}`,
        `Domain boost rules for ${domain} retrieval ranking by intent and document type.`,
      ),
      config: { enabled: true, domain },
      domain,
      rules: [
        {
          id: `${domain}_boost_001`,
          intents: [],
          boostDocTypes: [],
          weight: 0.2,
        },
      ],
    }),
  });

  add({
    id: `section_priority_${domain}`,
    category: "retrieval",
    path: `retrieval/document_intelligence/section_priority.${domain}.any.json`,
    description: `Section-priority rules for ${domain} retrieval scanning order.`,
    dependsOn: [`doc_archetypes_${domain}`],
    required: true,
    payload: () => ({
      ...mkMeta(
        `section_priority_${domain}`,
        `Section-priority rules for ${domain} retrieval scanning order.`,
      ),
      config: { enabled: true, domain },
      domain,
      priorities: [
        {
          intent: "default",
          sections: [],
        },
      ],
    }),
  });
}

for (const domain of domains) {
  add({
    id: `keyword_taxonomy_${domain}`,
    category: "probes",
    path: `probes/marketing/keyword_taxonomy.${domain}.any.json`,
    description: `Marketing keyword taxonomy for ${domain} usage monitoring and product intelligence.`,
    dependsOn: [`doc_archetypes_${domain}`],
    required: false,
    optional: true,
    payload: () => ({
      ...mkMeta(
        `keyword_taxonomy_${domain}`,
        `Marketing keyword taxonomy for ${domain} usage monitoring and product intelligence.`,
      ),
      config: { enabled: true, domain, telemetryOnly: true },
      domain,
      clusters: [],
    }),
  });

  add({
    id: `pain_points_${domain}`,
    category: "probes",
    path: `probes/marketing/pain_points.${domain}.any.json`,
    description: `Pain-point signal library for ${domain} (re-ask, weak-evidence, fallback reasons).`,
    dependsOn: [`keyword_taxonomy_${domain}`],
    required: false,
    optional: true,
    payload: () => ({
      ...mkMeta(
        `pain_points_${domain}`,
        `Pain-point signal library for ${domain} (re-ask, weak-evidence, fallback reasons).`,
      ),
      config: { enabled: true, domain, telemetryOnly: true },
      domain,
      signals: [],
    }),
  });
}

add({
  id: "pattern_library",
  category: "probes",
  path: "probes/marketing/pattern_library.any.json",
  description: "Cross-domain query pattern library for monitoring and product direction.",
  dependsOn: ["document_intelligence_bank_map"],
  required: false,
  optional: true,
  payload: () => ({
    ...mkMeta(
      "pattern_library",
      "Cross-domain query pattern library for monitoring and product direction.",
    ),
    config: { enabled: true, telemetryOnly: true },
    patterns: [
      { id: "where_is_x", template: "where does it say {x}" },
      { id: "what_changed", template: "what changed between {a} and {b}" },
      { id: "extract_deadlines", template: "extract all obligations and deadlines" },
    ],
  }),
});

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

for (const def of defs) {
  const bank = def.payload(def.id);
  const filePath = path.join(dataBanksRoot, def.path);
  writeJson(filePath, bank);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const registryById = new Map((registry.banks || []).map((b) => [b.id, b]));

for (const def of defs) {
  const entry = {
    id: def.id,
    category: def.category,
    path: def.path,
    filename: path.basename(def.path),
    version: "1.0.0",
    contentType: def.category,
    schemaId: "bank_schema",
    dependsOn: Array.isArray(def.dependsOn) ? def.dependsOn : [],
    enabledByEnv: envMap(true),
    requiredByEnv: envMap(Boolean(def.required)),
    checksumSha256: "",
    lastUpdated: today,
  };

  if (registryById.has(def.id)) {
    Object.assign(registryById.get(def.id), entry);
  } else {
    registry.banks.push(entry);
    registryById.set(def.id, entry);
  }
}

registry._meta.lastUpdated = today;
writeJson(registryPath, registry);

const deps = JSON.parse(fs.readFileSync(depsPath, "utf8"));
const depsById = new Map((deps.banks || []).map((b) => [b.id, b]));
for (const def of defs) {
  const depEntry = {
    id: def.id,
    dependsOn: Array.isArray(def.dependsOn) ? def.dependsOn : [],
  };
  if (def.optional) depEntry.optional = true;
  if (depsById.has(def.id)) {
    const cur = depsById.get(def.id);
    cur.dependsOn = depEntry.dependsOn;
    if (def.optional) cur.optional = true;
  } else {
    deps.banks.push(depEntry);
    depsById.set(def.id, depEntry);
  }
}

deps._meta.lastUpdated = today;
writeJson(depsPath, deps);

const aliases = JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
const aliasList = Array.isArray(aliases.aliases) ? aliases.aliases : [];
const aliasSet = new Set(aliasList.map((a) => String(a.alias || "").trim().toLowerCase()));

for (const def of defs) {
  const prettyAlias = def.id.replace(/_/g, ".");
  const pairs = [
    { alias: def.id, canonicalId: def.id, reason: "Canonical doc intelligence bank id (self-alias)." },
    { alias: prettyAlias, canonicalId: def.id, reason: "Dot-notation compatibility alias for doc intelligence bank ids." },
  ];
  for (const item of pairs) {
    const key = String(item.alias).toLowerCase();
    if (aliasSet.has(key)) continue;
    aliasList.push({
      alias: item.alias,
      canonicalId: item.canonicalId,
      reason: item.reason,
      addedAt: today,
      expiresInDays: null,
    });
    aliasSet.add(key);
  }
}

aliases.aliases = aliasList;
aliases._meta.lastUpdated = today;
writeJson(aliasesPath, aliases);

console.log(`Generated/updated ${defs.length} document-intelligence banks and manifest wiring.`);
