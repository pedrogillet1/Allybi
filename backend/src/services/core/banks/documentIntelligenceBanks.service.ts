/* eslint-disable @typescript-eslint/no-explicit-any */

import { getBankLoaderInstance } from "./bankLoader.service";

export type DocumentIntelligenceDomain =
  | "finance"
  | "legal"
  | "medical"
  | "ops"
  | "accounting"
  | "banking"
  | "billing"
  | "education"
  | "housing"
  | "hr_payroll"
  | "identity"
  | "insurance"
  | "tax"
  | "travel";

export type DocumentIntelligenceOntologyType =
  | "doc_type"
  | "domain"
  | "entity"
  | "metric"
  | "section"
  | "unit_and_measurement";

export type DocumentIntelligenceDomainBankFamily =
  | "domain_profile"
  | "domain_detection_rules"
  | "answer_style_bank"
  | "evidence_requirements"
  | "reasoning_scaffolds"
  | "retrieval_strategies"
  | "disclaimer_policy"
  | "redaction_and_safety_rules"
  | "validation_policies";
export type DocumentIntelligenceOperator =
  | "navigate"
  | "open"
  | "extract"
  | "summarize"
  | "compare"
  | "locate"
  | "calculate"
  | "evaluate"
  | "validate"
  | "advise"
  | "monitor";

export type DocumentIntelligenceQualityGateType =
  | "ambiguity_questions"
  | "numeric_integrity"
  | "source_policy"
  | "wrong_doc_lock";

export type DocumentIntelligenceEntityPatternType =
  | "money_patterns"
  | "date_patterns"
  | "party_patterns"
  | "identifier_patterns";

export type DocumentIntelligenceStructurePatternType =
  | "sheetname_patterns"
  | "headings_map"
  | "layout_cues";

export type DocxHeadingLang = "en" | "pt";

export interface DocAliasThresholds {
  minAliasConfidence: number;
  autopickConfidence: number;
  autopickGap: number;
}

export interface MergedDocAliasesBank {
  _meta: {
    id: string;
    version: string;
    lastUpdated: string;
  };
  config: {
    enabled: boolean;
    minAliasConfidence: number;
    actionsContract: {
      thresholds: {
        minAliasConfidence: number;
        autopickConfidence: number;
        autopickGap: number;
      };
    };
  };
  aliases: Array<Record<string, unknown>>;
}

export interface DocumentIntelligenceBankDiagnostics {
  loadedBankIds: string[];
  lastReloadAt: string;
  versions: Record<string, string>;
  updatedAt: Record<string, string>;
  counts: Record<string, number>;
  validationWarnings: string[];
  documentIntelligenceFamilyCounts: Record<string, number>;
}

interface BankLoaderLike {
  getBank<T = any>(bankId: string): T;
  getOptionalBank?<T = any>(bankId: string): T | null;
  listLoaded(): string[];
}

const CORE_DOMAINS: DocumentIntelligenceDomain[] = [
  "accounting",
  "finance",
  "legal",
  "medical",
  "ops",
];

const EXTENDED_DOMAINS: DocumentIntelligenceDomain[] = [
  "banking",
  "billing",
  "education",
  "housing",
  "hr_payroll",
  "identity",
  "insurance",
  "tax",
  "travel",
];

const DOMAINS: DocumentIntelligenceDomain[] = [
  ...CORE_DOMAINS,
  ...EXTENDED_DOMAINS,
];

const OPERATORS: DocumentIntelligenceOperator[] = [
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

const MISSING = Symbol("document_intelligence_bank_missing");

const DOMAIN_ALIASES: Record<string, DocumentIntelligenceDomain> = {
  operations: "ops",
};

function isDocumentIntelligenceDomain(
  value: unknown,
): value is DocumentIntelligenceDomain {
  return DOMAINS.includes(value as DocumentIntelligenceDomain);
}

export function normalizeDocumentIntelligenceDomain(
  value: unknown,
): DocumentIntelligenceDomain | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const mapped = DOMAIN_ALIASES[raw] ?? raw;
  return isDocumentIntelligenceDomain(mapped) ? mapped : null;
}

const DI_DOMAIN_FAMILIES: DocumentIntelligenceDomainBankFamily[] = [
  "domain_profile",
  "domain_detection_rules",
  "answer_style_bank",
  "evidence_requirements",
  "reasoning_scaffolds",
  "retrieval_strategies",
  "disclaimer_policy",
  "redaction_and_safety_rules",
  "validation_policies",
];

// Domain-pack families currently exist for domain folders under
// data_banks/document_intelligence/domains/* and intentionally exclude "ops".
const DI_DOMAIN_PACKED_DOMAINS: DocumentIntelligenceDomain[] = DOMAINS.filter(
  (domain) => domain !== "ops",
);

const DI_ONTOLOGY_TYPES: DocumentIntelligenceOntologyType[] = [
  "doc_type",
  "domain",
  "entity",
  "metric",
  "section",
  "unit_and_measurement",
];

function domainBankPrefix(domain: DocumentIntelligenceDomain): string {
  // Legacy bank IDs for legal/medical are prefix-less; all others are di_<domain>.
  if (domain === "legal" || domain === "medical") return domain;
  return `di_${domain}`;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(
    new Set(values.map((v) => String(v || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
}

function lower(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getArrayCount(bank: any): number {
  if (!bank || typeof bank !== "object") return 0;

  const candidateArrayKeys = [
    "rules",
    "aliases",
    "priorities",
    "typeDefinitions",
    "templates",
    "questions",
    "frameworks",
    "entries",
    "patterns",
  ];

  for (const key of candidateArrayKeys) {
    if (Array.isArray(bank[key])) return bank[key].length;
  }

  if (bank.entries && typeof bank.entries === "object") {
    return Object.keys(bank.entries).length;
  }

  return 0;
}

export class DocumentIntelligenceBanksService {
  private readonly cache = new Map<string, unknown | typeof MISSING>();

  constructor(
    private readonly bankLoader: BankLoaderLike = getBankLoaderInstance(),
  ) {}

  invalidateCache(): void {
    this.cache.clear();
  }

  private getCachedRequired<T = any>(bankId: string): T {
    if (this.cache.has(bankId)) {
      const cached = this.cache.get(bankId);
      if (cached === MISSING) {
        throw new Error(`Required bank missing: ${bankId}`);
      }
      return cached as T;
    }

    const bank = this.bankLoader.getBank<T>(bankId);
    this.cache.set(bankId, bank as unknown);
    return bank;
  }

  private getCachedOptional<T = any>(bankId: string): T | null {
    if (this.cache.has(bankId)) {
      const cached = this.cache.get(bankId);
      return cached === MISSING ? null : (cached as T);
    }

    const bank =
      typeof this.bankLoader.getOptionalBank === "function"
        ? this.bankLoader.getOptionalBank<T>(bankId)
        : (() => {
            try {
              return this.bankLoader.getBank<T>(bankId);
            } catch {
              return null;
            }
          })();
    if (!bank) {
      this.cache.set(bankId, MISSING);
      return null;
    }

    this.cache.set(bankId, bank as unknown);
    return bank;
  }

  getDocumentIntelligenceMap(): any | null {
    return this.getCachedOptional<any>("document_intelligence_bank_map");
  }

  getDocumentIntelligenceDomains(): DocumentIntelligenceDomain[] {
    const fromMap = this.getDocumentIntelligenceMap();
    const configuredCore = Array.isArray(fromMap?.domains)
      ? fromMap.domains
          .map((value: unknown) => normalizeDocumentIntelligenceDomain(value))
          .filter((value): value is DocumentIntelligenceDomain =>
            Boolean(value),
          )
      : [];
    const configuredExtended = Array.isArray(fromMap?.extendedDomains)
      ? fromMap.extendedDomains
          .map((value: unknown) => normalizeDocumentIntelligenceDomain(value))
          .filter((value): value is DocumentIntelligenceDomain =>
            Boolean(value),
          )
      : [];
    const configured = [...configuredCore, ...configuredExtended];
    const merged = uniqueSorted(configured.length ? configured : DOMAINS);
    return merged.filter((domain): domain is DocumentIntelligenceDomain =>
      DOMAINS.includes(domain as DocumentIntelligenceDomain),
    );
  }

  private normalizeDomainOrThrow(
    domain: unknown,
    context: string,
  ): DocumentIntelligenceDomain {
    const normalized = normalizeDocumentIntelligenceDomain(domain);
    if (!normalized) {
      throw new Error(`Unsupported document intelligence domain for ${context}`);
    }
    return normalized;
  }

  getDocTaxonomy(): any {
    return this.getCachedRequired<any>("doc_taxonomy");
  }

  getDocArchetypes(domain: DocumentIntelligenceDomain): any {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocArchetypes");
    return this.getCachedRequired<any>(`doc_archetypes_${normalized}`);
  }

  getDocAliases(domain: DocumentIntelligenceDomain): any {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocAliases");
    return this.getCachedRequired<any>(`doc_aliases_${normalized}`);
  }

  getLegacyDocAliases(): any | null {
    return this.getCachedOptional<any>("doc_aliases");
  }

  getDocAliasThresholds(): DocAliasThresholds {
    const legacy = this.getLegacyDocAliases();

    const legacyMinAlias = asNumber(
      legacy?.config?.actionsContract?.thresholds?.minAliasConfidence,
    );
    const legacyAutopickConfidence = asNumber(
      legacy?.config?.actionsContract?.thresholds?.autopickConfidence,
    );
    const legacyAutopickGap = asNumber(
      legacy?.config?.actionsContract?.thresholds?.autopickGap,
    );

    const domainAliasMins = DOMAINS.map((domain) => {
      const bank = this.getCachedOptional<any>(`doc_aliases_${domain}`);
      return asNumber(bank?.config?.minAliasConfidence);
    }).filter((v): v is number => v != null);

    const minAliasConfidence =
      legacyMinAlias ??
      (domainAliasMins.length > 0 ? Math.min(...domainAliasMins) : null) ??
      0.75;

    return {
      minAliasConfidence,
      autopickConfidence: legacyAutopickConfidence ?? 0.88,
      autopickGap: legacyAutopickGap ?? 0.25,
    };
  }

  getMergedDocAliasesBank(): MergedDocAliasesBank {
    const thresholds = this.getDocAliasThresholds();
    const aliases: Array<Record<string, unknown>> = [];

    for (const domain of DOMAINS) {
      const bank = this.getCachedOptional<any>(`doc_aliases_${domain}`);
      if (!bank) continue;
      const bankAliases = Array.isArray(bank.aliases) ? bank.aliases : [];
      for (const entry of bankAliases) {
        if (!entry || typeof entry !== "object") continue;
        aliases.push(entry as Record<string, unknown>);
      }
    }

    return {
      _meta: {
        id: "doc_aliases_merged",
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
      },
      config: {
        enabled: true,
        minAliasConfidence: thresholds.minAliasConfidence,
        actionsContract: {
          thresholds: {
            minAliasConfidence: thresholds.minAliasConfidence,
            autopickConfidence: thresholds.autopickConfidence,
            autopickGap: thresholds.autopickGap,
          },
        },
      },
      aliases,
    };
  }

  getDocAliasPhrases(): string[] {
    const phrases: string[] = [];

    for (const domain of DOMAINS) {
      const bank = this.getCachedOptional<any>(`doc_aliases_${domain}`);
      if (!bank) continue;
      const aliases = Array.isArray(bank.aliases) ? bank.aliases : [];
      for (const entry of aliases) {
        if (!entry || typeof entry !== "object") continue;
        const phrase = lower((entry as any).phrase ?? (entry as any).alias);
        const normalized = lower((entry as any).normalized);
        if (phrase) phrases.push(phrase);
        if (normalized) phrases.push(normalized);
      }
    }

    return uniqueSorted(phrases);
  }

  getOperatorPlaybook(
    operator: DocumentIntelligenceOperator,
    domain: DocumentIntelligenceDomain,
  ): any {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getOperatorPlaybook",
    );
    return this.getCachedRequired<any>(
      `operator_playbook_${operator}_${normalized}`,
    );
  }

  getFileActionOperators(): any | null {
    return this.getCachedOptional<any>("file_action_operators");
  }

  getRetrievalBoostRules(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRetrievalBoostRules",
    );
    return this.getCachedOptional<any>(`boost_rules_${normalized}`);
  }

  getQueryRewriteRules(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getQueryRewriteRules",
    );
    return this.getCachedOptional<any>(`query_rewrites_${normalized}`);
  }

  getSectionPriorityRules(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getSectionPriorityRules",
    );
    return this.getCachedOptional<any>(`section_priority_${normalized}`);
  }

  getCrossDocGroundingPolicy(): any | null {
    return this.getCachedOptional<any>("allybi_crossdoc_grounding");
  }

  getQualityGateBank(type: DocumentIntelligenceQualityGateType): any | null {
    return this.getCachedOptional<any>(type);
  }

  getEntityPatterns(type: DocumentIntelligenceEntityPatternType): any {
    return this.getCachedRequired<any>(type);
  }

  getStructurePatterns(type: DocumentIntelligenceStructurePatternType): any {
    return this.getCachedRequired<any>(type);
  }

  getExcelNumberFormats(): any {
    return this.getCachedRequired<any>("excel_number_formats");
  }

  getDocxHeadingLevels(lang: DocxHeadingLang): any {
    return this.getCachedRequired<any>(`docx_heading_levels_${lang}`);
  }

  getMarketingKeywordTaxonomy(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getMarketingKeywordTaxonomy",
    );
    return this.getCachedOptional<any>(`keyword_taxonomy_${normalized}`);
  }

  getMarketingPainPoints(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getMarketingPainPoints",
    );
    return this.getCachedOptional<any>(`pain_points_${normalized}`);
  }

  getMarketingPatternLibrary(): any | null {
    return this.getCachedOptional<any>("pattern_library");
  }

  getRoutingPriority(): any | null {
    return this.getCachedOptional<any>("routing_priority");
  }

  getRoutingBank(bankId: "connectors_routing" | "email_routing"): any | null {
    return this.getCachedOptional<any>(bankId);
  }

  // ── Document Intelligence Domain Banks ──────────────────────────────

  getDomainProfile(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDomainProfile");
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_domain_profile`,
    );
  }

  getDomainDetectionRules(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDomainDetectionRules",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_domain_detection_rules`,
    );
  }

  getAnswerStyleBank(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getAnswerStyleBank",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_answer_style_bank`,
    );
  }

  getEvidenceRequirements(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getEvidenceRequirements",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_evidence_requirements`,
    );
  }

  getReasoningScaffolds(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getReasoningScaffolds",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_reasoning_scaffolds`,
    );
  }

  getRetrievalStrategies(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRetrievalStrategies",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_retrieval_strategies`,
    );
  }

  getDisclaimerPolicy(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDisclaimerPolicy",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_disclaimer_policy`,
    );
  }

  getRedactionAndSafetyRules(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRedactionAndSafetyRules",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_redaction_and_safety_rules`,
    );
  }

  getValidationPolicies(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getValidationPolicies",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_validation_policies`,
    );
  }

  getDomainLexicon(
    domain: DocumentIntelligenceDomain,
    locale: "en" | "pt",
  ): any | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDomainLexicon");
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_lexicon_${locale}`,
    );
  }

  getDomainAbbreviations(
    domain: DocumentIntelligenceDomain,
    locale: "en" | "pt",
  ): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDomainAbbreviations",
    );
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_abbreviations_${locale}`,
    );
  }

  getDocTypeCatalog(domain: DocumentIntelligenceDomain): any | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocTypeCatalog");
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_doc_type_catalog`,
    );
  }

  getDocTypeSections(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): any | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocTypeSections");
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_${lookupDocType}_sections`,
    );
  }

  getDocTypeExtractionHints(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): any | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDocTypeExtractionHints",
    );
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_${lookupDocType}_extraction_hints`,
    );
  }

  getDocTypeTables(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): any | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocTypeTables");
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getCachedOptional<any>(
      `${domainBankPrefix(normalized)}_${lookupDocType}_tables`,
    );
  }

  private resolveDocTypeLookupKey(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): string {
    const normalizedDocType = String(docType || "")
      .trim()
      .toLowerCase();
    if (!normalizedDocType) return "";
    if (domain === "legal" && normalizedDocType.startsWith("legal_")) {
      return normalizedDocType.slice("legal_".length);
    }
    return normalizedDocType;
  }

  // ── Document Intelligence Ontology Banks ────────────────────────────

  getDiOntology(type: DocumentIntelligenceOntologyType): any | null {
    return this.getCachedOptional<any>(`di_${type}_ontology`);
  }

  getDiNormalizationRules(): any | null {
    return this.getCachedOptional<any>("di_normalization_rules");
  }

  getDiAbbreviationGlobal(): any | null {
    return this.getCachedOptional<any>("di_abbreviation_global");
  }

  // ── Document Intelligence Manifest Banks ────────────────────────────

  getDiSchemaRegistry(): any | null {
    return this.getCachedOptional<any>("document_intelligence_schema_registry");
  }

  getDiOrphanAllowlist(): any | null {
    return this.getCachedOptional<any>(
      "document_intelligence_orphan_allowlist",
    );
  }

  getDiDependencyGraph(): any | null {
    return this.getCachedOptional<any>(
      "document_intelligence_dependency_graph",
    );
  }

  getDiUsageManifest(): any | null {
    return this.getCachedOptional<any>("document_intelligence_usage_manifest");
  }

  getDiRuntimeWiringGates(): any | null {
    return this.getCachedOptional<any>(
      "document_intelligence_runtime_wiring_gates",
    );
  }

  listDiagnostics(): DocumentIntelligenceBankDiagnostics {
    const mapBank = this.getDocumentIntelligenceMap();
    const requiredIds = Array.isArray(mapBank?.requiredCoreBankIds)
      ? mapBank.requiredCoreBankIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      : [];
    const optionalIds = Array.isArray(mapBank?.optionalBankIds)
      ? mapBank.optionalBankIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      : [];

    const extraRuntimeIds = [
      "document_intelligence_schema_registry",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_runtime_wiring_gates",
      "file_action_operators",
      "docx_heading_levels_en",
      "docx_heading_levels_pt",
      "excel_number_formats",
      "routing_priority",
      "connectors_routing",
      "email_routing",
      ...DOMAINS.map((domain) => `keyword_taxonomy_${domain}`),
      ...DOMAINS.map((domain) => `pain_points_${domain}`),
      ...DOMAINS.map((domain) => `doc_aliases_${domain}`),
      ...DOMAINS.map((domain) => `doc_archetypes_${domain}`),
      ...DOMAINS.map((domain) => `boost_rules_${domain}`),
      ...DOMAINS.map((domain) => `query_rewrites_${domain}`),
      ...DOMAINS.map((domain) => `section_priority_${domain}`),
      ...DOMAINS.flatMap((domain) =>
        OPERATORS.map((operator) => `operator_playbook_${operator}_${domain}`),
      ),
      // Document intelligence domain banks
      ...DI_DOMAIN_PACKED_DOMAINS.flatMap((domain) =>
        DI_DOMAIN_FAMILIES.map(
          (family) => `${domainBankPrefix(domain)}_${family}`,
        ),
      ),
      // Document intelligence ontology banks
      ...DI_ONTOLOGY_TYPES.map((type) => `di_${type}_ontology`),
      // Document intelligence language banks
      "di_normalization_rules",
      "di_abbreviation_global",
      // Document intelligence manifest banks
      "document_intelligence_schema_registry",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_runtime_wiring_gates",
    ];

    const bankIds = uniqueSorted([
      ...requiredIds,
      ...optionalIds,
      ...extraRuntimeIds,
    ]);

    const versions: Record<string, string> = {};
    const updatedAt: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const validationWarnings: string[] = [];

    for (const bankId of bankIds) {
      const bank = this.getCachedOptional<any>(bankId);
      if (!bank) {
        if (requiredIds.includes(bankId)) {
          validationWarnings.push(`Missing required bank: ${bankId}`);
        }
        continue;
      }

      const version = String(bank?._meta?.version || "").trim();
      const updated = String(
        bank?._meta?.lastUpdated || bank?._meta?.updatedAt || "",
      ).trim();
      if (version) versions[bankId] = version;
      if (updated) updatedAt[bankId] = updated;
      counts[bankId] = getArrayCount(bank);

      if (requiredIds.includes(bankId) && counts[bankId] === 0) {
        validationWarnings.push(`Critical bank has no entries: ${bankId}`);
      }
    }

    const loadedSet = new Set(this.bankLoader.listLoaded());
    const loadedBankIds = bankIds.filter((id) => loadedSet.has(id));

    // Build per-family counts for document intelligence banks
    const documentIntelligenceFamilyCounts: Record<string, number> = {};
    for (const domain of DI_DOMAIN_PACKED_DOMAINS) {
      const prefix = domainBankPrefix(domain);
      let domainCount = 0;
      for (const family of DI_DOMAIN_FAMILIES) {
        if (loadedSet.has(`${prefix}_${family}`)) domainCount++;
      }
      documentIntelligenceFamilyCounts[`domain:${domain}`] = domainCount;
    }
    documentIntelligenceFamilyCounts["domain:ops"] = 0;
    let ontologyCount = 0;
    for (const type of DI_ONTOLOGY_TYPES) {
      if (loadedSet.has(`di_${type}_ontology`)) ontologyCount++;
    }
    documentIntelligenceFamilyCounts["ontologies"] = ontologyCount;
    documentIntelligenceFamilyCounts["language"] =
      (loadedSet.has("di_normalization_rules") ? 1 : 0) +
      (loadedSet.has("di_abbreviation_global") ? 1 : 0);
    documentIntelligenceFamilyCounts["manifest"] = [
      "document_intelligence_schema_registry",
      "document_intelligence_orphan_allowlist",
      "document_intelligence_dependency_graph",
      "document_intelligence_usage_manifest",
      "document_intelligence_runtime_wiring_gates",
    ].filter((id) => loadedSet.has(id)).length;

    return {
      loadedBankIds,
      lastReloadAt: new Date().toISOString(),
      versions,
      updatedAt,
      counts,
      validationWarnings,
      documentIntelligenceFamilyCounts,
    };
  }
}

let singleton: DocumentIntelligenceBanksService | null = null;

export function getDocumentIntelligenceBanksInstance(): DocumentIntelligenceBanksService {
  if (!singleton) {
    singleton = new DocumentIntelligenceBanksService(getBankLoaderInstance());
  }
  return singleton;
}
