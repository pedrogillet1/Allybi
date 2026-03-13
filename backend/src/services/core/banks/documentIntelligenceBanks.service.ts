import { getBankLoaderInstance } from "./bankLoader.service";
import {
  asNumber,
  getArrayCount,
  lower,
  uniqueSorted,
} from "./documentIntelligenceBanks.helpers";

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
  | "travel"
  | "everyday"
  | "compliance"
  | "education_research"
  | "procurement";

export type DocumentIntelligenceOntologyType =
  | "doc_type"
  | "domain"
  | "entity"
  | "metric"
  | "section"
  | "table"
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
  | "claim_strength_matrix"
  | "conflict_resolution_rules"
  | "fact_type_requirements"
  | "field_exactness_rules"
  | "high_stakes_response_rules"
  | "medical_safety_boundaries"
  | "numeric_integrity"
  | "numeric_reconciliation_rules"
  | "pii_patterns"
  | "privacy_minimal"
  | "redaction_actions"
  | "source_policy"
  | "table_integrity_rules"
  | "unsafe_inference_rules"
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
  aliases: Array<Record<string, any>>;
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

type LocaleCode = "en" | "pt" | "es";

interface BankLoaderLike {
  getBank<T = unknown>(bankId: string): T;
  getOptionalBank?<T = unknown>(bankId: string): T | null;
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
  "everyday",
  "compliance",
  "education_research",
  "procurement",
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

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
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
  "table",
  "unit_and_measurement",
];

interface DiDomainOntologyEntry {
  id: string;
  label?: string;
  labelPt?: string;
  crossDomainLinks?: string[];
}

interface DiDocTypeOntologyEntry {
  id: string;
  domainId?: string;
  label?: string;
  labelPt?: string;
  aliases?: Record<string, string[]>;
  packRefs?: {
    sections?: string[];
    entities?: string[];
    tables?: string[];
    extraction?: string[];
  };
}

interface DiSectionOntologyEntry {
  id: string;
  label?: string;
  labelPt?: string;
  headerVariants?: Record<string, string[]>;
  families?: string[];
  domains?: string[];
}

interface DiMetricOntologyEntry {
  id: string;
  label?: string;
  labelPt?: string;
  domain?: string;
  unitId?: string;
  aliases?: Record<string, string[]>;
  typicalTableHeaders?: Record<string, string[]>;
}

interface DiUnitOntologyEntry {
  id: string;
  familyId?: string;
  label?: string;
  labelPt?: string;
  symbols?: string[];
  aliases?: Record<string, string[]>;
}

function domainBankPrefix(domain: DocumentIntelligenceDomain): string {
  // Legacy bank IDs for legal/medical are prefix-less; all others are di_<domain>.
  if (domain === "legal" || domain === "medical") return domain;
  return `di_${domain}`;
}

export class DocumentIntelligenceBanksService {
  private readonly cache = new Map<string, unknown | typeof MISSING>();

  constructor(
    private readonly bankLoader: BankLoaderLike = getBankLoaderInstance(),
  ) {}

  invalidateCache(): void {
    this.cache.clear();
  }

  private getCachedRequired<T = unknown>(bankId: string): T {
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

  private getCachedOptional<T = unknown>(bankId: string): T | null {
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

  private getFirstAvailableBank<T = unknown>(bankIds: string[]): T | null {
    for (const bankId of bankIds) {
      const bank = this.getCachedOptional<T>(bankId);
      if (bank) {
        return bank;
      }
    }
    return null;
  }

  private getDomainFamilyBankIds(
    domain: DocumentIntelligenceDomain,
    family: string,
  ): string[] {
    const normalizedDomain = this.normalizeDomainOrThrow(domain, "domain family lookup");
    const prefix = domainBankPrefix(normalizedDomain);
    const normalizedFamily = String(family || "").trim().replace(/\s+/g, "_");
    return uniqueSorted([
      `${prefix}_${normalizedFamily}`,
      `${prefix}_${normalizedFamily}_v2`,
    ]);
  }

  private getDomainFamilyLocaleBankIds(
    domain: DocumentIntelligenceDomain,
    family: string,
    locale: "en" | "pt",
  ): string[] {
    const normalizedDomain = this.normalizeDomainOrThrow(
      domain,
      "domain family locale lookup",
    );
    const prefix = domainBankPrefix(normalizedDomain);
    const normalizedFamily = String(family || "").trim().replace(/\s+/g, "_");
    return uniqueSorted([
      `${prefix}_${normalizedFamily}_${locale}`,
      `${prefix}_${normalizedFamily}_${locale}_v2`,
    ]);
  }

  private getDomainDocTypeBankIds(
    domain: DocumentIntelligenceDomain,
    docType: string,
    suffix: "sections" | "extraction_hints" | "tables",
  ): string[] {
    const normalizedDocType = this.resolveDocTypeLookupKey(
      this.normalizeDomainOrThrow(domain, "doc-type lookup"),
      docType,
    );
    if (!normalizedDocType) return [];

    const normalizedDomain = this.normalizeDomainOrThrow(
      domain,
      "doc type family lookup",
    );
    const prefix = domainBankPrefix(normalizedDomain);
    const candidates = uniqueSorted([
      `${prefix}_${normalizedDocType}_${suffix}`,
      `${prefix}_${suffix}_${normalizedDocType}`,
    ]);
    if (suffix === "extraction_hints") {
      candidates.push(`${prefix}_extraction_${normalizedDocType}`);
    }
    return uniqueSorted(candidates);
  }

  getDocumentIntelligenceMap(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("document_intelligence_bank_map");
  }

  getDocumentIntelligenceDomains(): DocumentIntelligenceDomain[] {
    const fromMap = this.getDocumentIntelligenceMap();
    const configuredCore = Array.isArray(fromMap?.domains)
      ? fromMap.domains
          .map((value: unknown) => normalizeDocumentIntelligenceDomain(value))
          .filter((value: unknown): value is DocumentIntelligenceDomain =>
            Boolean(value),
          )
      : [];
    const configuredExtended = Array.isArray(fromMap?.extendedDomains)
      ? fromMap.extendedDomains
          .map((value: unknown) => normalizeDocumentIntelligenceDomain(value))
          .filter((value: unknown): value is DocumentIntelligenceDomain =>
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
      throw new Error(
        `Unsupported document intelligence domain for ${context}`,
      );
    }
    return normalized;
  }

  getDocTaxonomy(): Record<string, any> {
    return this.getCachedRequired<Record<string, any>>("doc_taxonomy");
  }

  getDocArchetypes(domain: DocumentIntelligenceDomain): Record<string, any> {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocArchetypes");
    return this.getCachedRequired<Record<string, any>>(`doc_archetypes_${normalized}`);
  }

  getDocAliases(domain: DocumentIntelligenceDomain): Record<string, any> {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocAliases");
    return this.getCachedRequired<Record<string, any>>(`doc_aliases_${normalized}`);
  }

  getLegacyDocAliases(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("doc_aliases");
  }

  getDocAliasThresholds(): DocAliasThresholds {
    const legacy = this.getLegacyDocAliases();
    const legacyConfig = asObject(legacy?.config);
    const legacyActionsContract = asObject(legacyConfig.actionsContract);
    const legacyThresholds = asObject(legacyActionsContract.thresholds);

    const legacyMinAlias = asNumber(
      legacyThresholds.minAliasConfidence,
    );
    const legacyAutopickConfidence = asNumber(
      legacyThresholds.autopickConfidence,
    );
    const legacyAutopickGap = asNumber(
      legacyThresholds.autopickGap,
    );

    const domainAliasMins = DOMAINS.map((domain) => {
      const bank = this.getCachedOptional<Record<string, any>>(`doc_aliases_${domain}`);
      return asNumber(asObject(bank?.config).minAliasConfidence);
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
    const aliases: Array<Record<string, any>> = [];

    for (const domain of DOMAINS) {
      const bank = this.getCachedOptional<Record<string, any>>(`doc_aliases_${domain}`);
      if (!bank) continue;
      const bankAliases = Array.isArray(bank.aliases) ? bank.aliases : [];
      for (const entry of bankAliases) {
        if (!entry || typeof entry !== "object") continue;
        aliases.push(entry as Record<string, any>);
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
      const bank = this.getCachedOptional<Record<string, any>>(`doc_aliases_${domain}`);
      if (!bank) continue;
      const aliases = Array.isArray(bank.aliases) ? bank.aliases : [];
      for (const entry of aliases) {
        if (!entry || typeof entry !== "object") continue;
        const entryRecord = entry as Record<string, any>;
        const phrase = lower(entryRecord.phrase ?? entryRecord.alias);
        const normalized = lower(entryRecord.normalized);
        if (phrase) phrases.push(phrase);
        if (normalized) phrases.push(normalized);
      }
    }

    return uniqueSorted(phrases);
  }

  getOperatorPlaybook(
    operator: DocumentIntelligenceOperator,
    domain: DocumentIntelligenceDomain,
  ): Record<string, any> {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getOperatorPlaybook",
    );
    return this.getCachedRequired<Record<string, any>>(
      `operator_playbook_${operator}_${normalized}`,
    );
  }

  getFileActionOperators(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("file_action_operators");
  }

  getRetrievalBoostRules(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRetrievalBoostRules",
    );
    return this.getCachedOptional<Record<string, any>>(`boost_rules_${normalized}`);
  }

  getQueryRewriteRules(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getQueryRewriteRules",
    );
    return this.getCachedOptional<Record<string, any>>(`query_rewrites_${normalized}`);
  }

  getSectionPriorityRules(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getSectionPriorityRules",
    );
    return this.getCachedOptional<Record<string, any>>(`section_priority_${normalized}`);
  }

  getCrossDocGroundingPolicy(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("allybi_crossdoc_grounding");
  }

  getRetrievalRankerConfig(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "ranker_config",
      "retrieval_ranker_config",
    ]);
  }

  getRetrievalQueryRewritePolicy(
    domain?: DocumentIntelligenceDomain | null,
  ): Record<string, any> | null {
    const candidates = ["query_rewrite_policies"];
    if (domain) {
      const normalized = this.normalizeDomainOrThrow(
        domain,
        "getRetrievalQueryRewritePolicy",
      );
      candidates.push(`query_rewrites_${normalized}`);
    }
    return this.getFirstAvailableBank<Record<string, any>>(candidates);
  }

  getRetrievalSectionBoostRules(
    domain?: DocumentIntelligenceDomain | null,
  ): Record<string, any> | null {
    const candidates = ["section_boost_rules"];
    if (domain) {
      const normalized = this.normalizeDomainOrThrow(
        domain,
        "getRetrievalSectionBoostRules",
      );
      candidates.push(`section_priority_${normalized}`);
    }
    return this.getFirstAvailableBank<Record<string, any>>(candidates);
  }

  getRetrievalTableBoostRules(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>(["table_boost_rules"]);
  }

  getFieldLockPatterns(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "field_lock_patterns",
      "doc_lock_policy",
    ]);
  }

  getQuoteSpanRules(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "quote_span_rules",
      "snippet_compression_policy",
    ]);
  }

  getEvidenceBindingContract(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "evidence_binding_contract",
      "evidence_packaging_policy",
      "evidence_packaging",
    ]);
  }

  getCrossDocSynthesisRules(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "cross_doc_synthesis_rules",
      "crossdoc_alignment_rules",
      "allybi_crossdoc_grounding",
    ]);
  }

  getEvidencePackagingStrategies(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "evidence_packaging_strategies",
      "evidence_packaging_policy",
      "evidence_packaging",
    ]);
  }

  getNegativeRetrievalPatterns(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "negative_retrieval_patterns",
      "retrieval_negatives",
    ]);
  }

  getQualityGateBank(type: DocumentIntelligenceQualityGateType): Record<string, any> | null {
    const candidateIds: Record<DocumentIntelligenceQualityGateType, string[]> = {
      ambiguity_questions: ["ambiguity_questions"],
      claim_strength_matrix: ["claim_strength_matrix"],
      conflict_resolution_rules: ["conflict_resolution_rules", "contradiction_policy"],
      fact_type_requirements: ["fact_type_requirements"],
      field_exactness_rules: ["field_exactness_rules", "table_cell_evidence_rules"],
      high_stakes_response_rules: ["high_stakes_response_rules", "domain_sensitive_content"],
      medical_safety_boundaries: ["medical_safety_boundaries"],
      numeric_integrity: ["numeric_integrity"],
      numeric_reconciliation_rules: [
        "numeric_reconciliation_rules",
        "numeric_integrity",
      ],
      pii_patterns: ["pii_patterns"],
      privacy_minimal: ["privacy_minimal", "privacy_minimal_rules"],
      redaction_actions: ["redaction_actions"],
      source_policy: ["source_policy"],
      table_integrity_rules: ["table_integrity_rules", "table_cell_evidence_rules"],
      unsafe_inference_rules: ["unsafe_inference_rules"],
      wrong_doc_lock: ["wrong_doc_lock"],
    };

    return this.getFirstAvailableBank<Record<string, any>>(candidateIds[type]);
  }

  getEntityPatterns(type: DocumentIntelligenceEntityPatternType): Record<string, any> {
    return this.getCachedRequired<Record<string, any>>(type);
  }

  getStructurePatterns(type: DocumentIntelligenceStructurePatternType): Record<string, any> {
    return this.getCachedRequired<Record<string, any>>(type);
  }

  getExcelNumberFormats(): Record<string, any> {
    return this.getCachedRequired<Record<string, any>>("excel_number_formats");
  }

  getDocxHeadingLevels(lang: DocxHeadingLang): Record<string, any> {
    return this.getCachedRequired<Record<string, any>>(`docx_heading_levels_${lang}`);
  }

  getMarketingKeywordTaxonomy(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getMarketingKeywordTaxonomy",
    );
    return this.getCachedOptional<Record<string, any>>(`keyword_taxonomy_${normalized}`);
  }

  getMarketingPainPoints(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getMarketingPainPoints",
    );
    return this.getCachedOptional<Record<string, any>>(`pain_points_${normalized}`);
  }

  getMarketingPatternLibrary(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("pattern_library");
  }

  getRoutingPriority(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("routing_priority");
  }

  getRoutingBank(bankId: "connectors_routing" | "email_routing"): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(bankId);
  }

  // ── Document Intelligence Domain Banks ──────────────────────────────

  getDomainProfile(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDomainProfile");
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "domain_profile"),
    );
  }

  getDomainDetectionRules(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDomainDetectionRules",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "domain_detection_rules"),
    );
  }

  getAnswerStyleBank(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getAnswerStyleBank",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "answer_style_bank"),
    );
  }

  getEvidenceRequirements(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getEvidenceRequirements",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "evidence_requirements"),
    );
  }

  getReasoningScaffolds(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getReasoningScaffolds",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "reasoning_scaffolds"),
    );
  }

  getRetrievalStrategies(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRetrievalStrategies",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "retrieval_strategies"),
    );
  }

  getDisclaimerPolicy(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDisclaimerPolicy",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "disclaimer_policy"),
    );
  }

  getRedactionAndSafetyRules(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getRedactionAndSafetyRules",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "redaction_and_safety_rules"),
    );
  }

  getValidationPolicies(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getValidationPolicies",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyBankIds(normalized, "validation_policies"),
    );
  }

  getDomainLexicon(
    domain: DocumentIntelligenceDomain,
    locale: "en" | "pt",
  ): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDomainLexicon");
    const prefix = domainBankPrefix(normalized);
    return this.getFirstAvailableBank<Record<string, any>>([
      `${prefix}_lexicon_${locale}`,
      `${prefix}_lexicon_${locale}_v2`,
    ]);
  }

  getDomainAbbreviations(
    domain: DocumentIntelligenceDomain,
    locale: "en" | "pt",
  ): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDomainAbbreviations",
    );
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainFamilyLocaleBankIds(normalized, "abbreviations", locale),
    );
  }

  getDocTypeCatalog(domain: DocumentIntelligenceDomain): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocTypeCatalog");
    return this.getFirstAvailableBank<Record<string, any>>(
      [
        `${domainBankPrefix(normalized)}_doc_type_catalog`,
        `${domainBankPrefix(normalized)}_doc_type_catalog_v2`,
      ],
    );
  }

  getDocTypeSections(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDocTypeSections",
    );
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainDocTypeBankIds(normalized, lookupDocType, "sections"),
    );
  }

  getDocTypeExtractionHints(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(
      domain,
      "getDocTypeExtractionHints",
    );
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainDocTypeBankIds(normalized, lookupDocType, "extraction_hints"),
    );
  }

  getDocTypeTables(
    domain: DocumentIntelligenceDomain,
    docType: string,
  ): Record<string, any> | null {
    const normalized = this.normalizeDomainOrThrow(domain, "getDocTypeTables");
    const lookupDocType = this.resolveDocTypeLookupKey(normalized, docType);
    if (!lookupDocType) return null;
    return this.getFirstAvailableBank<Record<string, any>>(
      this.getDomainDocTypeBankIds(normalized, lookupDocType, "tables"),
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

  getDiOntology(type: DocumentIntelligenceOntologyType): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(`di_${type}_ontology`);
  }

  getFieldRoleOntology(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("field_role_ontology");
  }

  getDiDomains(): DiDomainOntologyEntry[] {
    const ontology = this.getDiOntology("domain");
    return Array.isArray(ontology?.domains)
      ? (ontology?.domains as DiDomainOntologyEntry[])
      : [];
  }

  getDiDocTypes(): DiDocTypeOntologyEntry[] {
    const ontology = this.getDiOntology("doc_type");
    return Array.isArray(ontology?.docTypes)
      ? (ontology?.docTypes as DiDocTypeOntologyEntry[])
      : [];
  }

  getDiSections(): DiSectionOntologyEntry[] {
    const ontology = this.getDiOntology("section");
    return Array.isArray(ontology?.sections)
      ? (ontology?.sections as DiSectionOntologyEntry[])
      : [];
  }

  getDiMetrics(): DiMetricOntologyEntry[] {
    const ontology = this.getDiOntology("metric");
    return Array.isArray(ontology?.metrics)
      ? (ontology?.metrics as DiMetricOntologyEntry[])
      : [];
  }

  getDiUnits(): DiUnitOntologyEntry[] {
    const ontology = this.getDiOntology("unit_and_measurement");
    return Array.isArray(ontology?.units)
      ? (ontology?.units as DiUnitOntologyEntry[])
      : [];
  }

  getDiNormalizationRules(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("di_normalization_rules");
  }

  getDiAbbreviationGlobal(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("di_abbreviation_global");
  }

  getIdentityBank(
    bankId:
      | "system_base"
      | "assistant_identity"
      | "mission_and_non_goals"
      | "behavioral_contract"
      | "confidence_calibration"
      | "help_and_capabilities",
  ): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(bankId);
  }

  getLanguageIndicators(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "language_indicators",
    ]);
  }

  getSynonymExpansion(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "synonym_expansion",
    ]);
  }

  getLanguageBank(
    bankId:
      | "abbreviation_global"
      | "locale_number_formats"
      | "date_locale_rules"
      | "language_indicators"
      | "synonym_expansion"
      | "entity_aliases"
      | "colloquial_phrasing"
      | "misspelling_and_variant_map"
      | "doc_aliases",
  ): Record<string, any> | null {
    const candidates: Record<string, string[]> = {
      abbreviation_global: ["di_abbreviation_global", "abbreviation_global"],
      locale_number_formats: ["locale_number_formats"],
      date_locale_rules: ["date_locale_rules"],
      language_indicators: ["language_indicators"],
      synonym_expansion: ["synonym_expansion"],
      entity_aliases: ["entity_aliases"],
      colloquial_phrasing: ["colloquial_phrasing"],
      misspelling_and_variant_map: ["misspelling_and_variant_map"],
      doc_aliases: ["doc_aliases"],
    };
    return this.getFirstAvailableBank<Record<string, any>>(candidates[bankId] || []);
  }

  getRoutingIntentPatterns(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "intent_patterns",
      "query_intent_patterns",
    ]);
  }

  getQueryFamilyCatalog(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("query_family_catalog");
  }

  getCalcIntents(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("calc_intents");
  }

  getEditingIntents(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("editing_intents");
  }

  getIntegrationIntents(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("integration_intents");
  }

  getNavigationIntents(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("navigation_intents");
  }

  getFollowupPolicy(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "followup_policy",
      "followup_indicators",
    ]);
  }

  getOneBestQuestionPolicy(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("one_best_question_policy");
  }

  getScopeResolutionRules(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "scope_resolution_rules",
      "scope_resolution",
    ]);
  }

  getDocLockPolicy(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("doc_lock_policy");
  }

  getFolderScopePatterns(): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "folder_scope_patterns",
      "patterns_doc_refs_folder_scope_patterns",
    ]);
  }

  getContextContainerProfiles(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
      "context_container_profiles",
    );
  }

  getConversationStateCarryover(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
      "conversation_state_carryover",
    );
  }

  getMultiDocCompareRules(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
      "multi_doc_compare_rules",
    );
  }

  getProjectMemoryPolicy(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("project_memory_policy");
  }

  getModeSwitch(locale: LocaleCode): Record<string, any> | null {
    return this.getFirstAvailableBank<Record<string, any>>([
      "mode_switch",
      `mode_switch_${locale}`,
      `patterns_modes_mode_switch_${locale}`,
      locale === "en" ? "patterns_modes_mode_switch_en" : "",
      locale === "pt" ? "patterns_modes_mode_switch_pt" : "",
    ].filter(Boolean));
  }

  // ── Document Intelligence Manifest Banks ────────────────────────────

  getDiSchemaRegistry(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("document_intelligence_schema_registry");
  }

  getDiOrphanAllowlist(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
      "document_intelligence_orphan_allowlist",
    );
  }

  getDiDependencyGraph(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
      "document_intelligence_dependency_graph",
    );
  }

  getDiUsageManifest(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>("document_intelligence_usage_manifest");
  }

  getDiRuntimeWiringGates(): Record<string, any> | null {
    return this.getCachedOptional<Record<string, any>>(
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
      const bank = this.getCachedOptional<Record<string, any>>(bankId);
      if (!bank) {
        if (requiredIds.includes(bankId)) {
          validationWarnings.push(`Missing required bank: ${bankId}`);
        }
        continue;
      }

      const bankMeta = asObject(bank?._meta);
      const version = String(bankMeta.version || "").trim();
      const updated = String(bankMeta.lastUpdated || bankMeta.updatedAt || "").trim();
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
