import crypto from "crypto";

// retrievalEngine.service.ts

/**
 * Koda Retrieval Engine (ChatGPT-parity)
 * -------------------------------------
 * This service is deliberately "policy-driven": it reads your data banks and executes a deterministic
 * retrieval pipeline with guardrails:
 *  - scope/lock correctness (never wrong-doc when explicit lock/ref exists)
 *  - expansion gating (no expansion for literals: quotes/filenames; only when allowed)
 *  - hybrid retrieval phases (semantic + lexical rescue + structural anchors)
 *  - negative constraints (hard blocks + soft penalties)
 *  - boosts (keyword/title/type/recency) with caps
 *  - diversification (doc + section spread + near-dup control)
 *  - evidence packaging (strict provenance; no raw dumps)
 *
 * It does NOT generate answers. It only returns an EvidencePack for the composer.
 *
 * NOTE: This file is designed to be drop-in and "engine-ready". You will still need to wire actual
 * indexes (embedding + lexical) to match your storage.
 */

import { logger } from "../../../utils/logger";
import {
  resolveDocScopeLockFromSignals,
  type DocScopeLock,
} from "./docScopeLock";
import {
  applyBoostScoring,
  applyQueryRewrites,
  enforceCrossDocPolicy,
  type MatchedBoostRule,
  matchBoostRules,
  selectSectionScanPlan,
  summarizeBoostRuleApplications,
  type BoostRule,
  type QueryVariant,
  type RewriteRule,
  type RuleMatchContext,
  type SectionPriorityRule,
} from "../../retrieval/document_intelligence/ruleInterpreter";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
  type DocumentIntelligenceDomain,
} from "../banks/documentIntelligenceBanks.service";
import type { RetrievalPlan } from "./retrievalPlanParser.service";
import { BankRuntimeCache } from "../cache/bankRuntimeCache.service";
import {
  clamp01,
  isProductionEnv,
  safeNumber,
  sha256,
  stableLocationKey,
} from "./retrievalEngine.utils";

type EnvName = "production" | "staging" | "dev" | "local";
type AnswerMode =
  | "nav_pills"
  | "doc_grounded_single"
  | "doc_grounded_multi"
  | "doc_grounded_quote"
  | "doc_grounded_table"
  | "general_answer"
  | "help_steps"
  | "rank_disambiguate"
  | "rank_autopick"
  | "no_docs"
  | "scoped_not_found"
  | "refusal";

type CandidateType = "text" | "table" | "image";
type CandidateSource = "semantic" | "lexical" | "structural";

const queryRewriteCache = new BankRuntimeCache<{
  variants: QueryVariant[];
  ruleIds: string[];
}>({
  maxEntries: Number(process.env.BANK_REWRITE_CACHE_MAX || 1000),
  ttlMs: Number(process.env.BANK_REWRITE_CACHE_TTL_MS || 5 * 60 * 1000),
});

const retrievalResultCache = new BankRuntimeCache<EvidencePack>({
  maxEntries: Number(process.env.BANK_RETRIEVAL_CACHE_MAX || 800),
  ttlMs: Number(process.env.BANK_RETRIEVAL_CACHE_TTL_MS || 5 * 60 * 1000),
});

export interface RetrievalRequest {
  query: string;
  env: EnvName;

  // Conversation/scope signals (usually from state + overlays)
  signals: {
    intentFamily?: string | null; // e.g. "documents", "doc_discovery", "file_actions"
    operator?: string | null; // e.g. "summarize", "extract", "locate_docs"
    answerMode?: AnswerMode | null;

    // Scope controls
    docScopeLock?: DocScopeLock | null;
    allowedDocumentIds?: string[] | null;
    explicitDocLock?: boolean; // hard lock active
    activeDocId?: string | null; // locked/active doc id
    explicitDocRef?: boolean; // explicit filename/title reference in this turn
    resolvedDocId?: string | null; // if explicit doc ref resolved

    hardScopeActive?: boolean; // any hard constraints applied
    singleDocIntent?: boolean; // user intent is clearly single doc
    allowExpansion?: boolean; // explicitly allowed by upstream logic
    hasQuotedText?: boolean;
    hasFilename?: boolean;

    // Format cues (downstream composer uses these too; retrieval may use them lightly)
    userAskedForTable?: boolean;
    userAskedForQuote?: boolean;

    // Spreadsheet/PDF hints
    sheetHintPresent?: boolean;
    resolvedSheetName?: string | null;
    rangeExplicit?: boolean;
    resolvedRangeA1?: string | null;

    // Time constraints (recency scaling)
    timeConstraintsPresent?: boolean;
    explicitYearOrQuarterComparison?: boolean;

    // Table expectations
    tableExpected?: boolean;

    // Optional domain hint for document-intelligence retrieval banks.
    domainHint?: string | null;
    queryFamily?: string | null;
    languageHint?: string | null;
    explicitDocTypes?: string[] | null;
    explicitDocIds?: string[] | null;
    explicitDocDomains?: string[] | null;
    requiredBankIds?: string[] | null;
    selectedBankVersionMap?: Record<string, string> | null;

    // Discovery mode can ignore doc lock for corpus search
    corpusSearchAllowed?: boolean;

    // Safety gate (retrieval should not proceed if unsafe gate is set upstream)
    unsafeGate?: boolean;

    // Slot extraction signals (from slotResolver)
    slotContract?: import("./slotResolver.service").SlotContract | null;
    isExtractionQuery?: boolean;
  };

  // Optional: if you store recent fallback history/anti-repetition
  retrievalPlan?: Partial<RetrievalPlan> | null;

  // Optional: if you store recent fallback history/anti-repetition
  history?: {
    recentFallbacks?: Array<{
      reasonCode: string;
      fallbackType: string;
      strategy: string;
      turnId: number;
    }>;
  };

  // Optional: override retrieval preferences (rare; tests/diagnostics)
  overrides?: Partial<RetrievalOverrides>;
}

export interface RetrievalOverrides {
  maxCandidateDocsSoft: number;
  maxCandidateDocsHard: number;
  maxChunksSoft: number;
  maxChunksHard: number;
  disableExpansion: boolean;
  disableDiversification: boolean;
  numericStrict: boolean;
  quoteStrict: boolean;
}

export interface DocMeta {
  docId: string;
  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sizeBytes?: number | null;

  // Optional container fields for spreadsheets/slides
  sheets?: string[] | null;
  slideCount?: number | null;
  pageCount?: number | null;
}

export interface ChunkLocation {
  page?: number | null;
  sheet?: string | null;
  slide?: number | null;
  sectionKey?: string | null;
  versionId?: string | null;
  rootDocumentId?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
}

export interface CandidateChunk {
  candidateId: string;
  type: CandidateType;
  source: CandidateSource;

  docId: string;
  docType?: string | null;
  title?: string | null;
  filename?: string | null;

  location: ChunkLocation;
  locationKey: string;

  // Content
  snippet: string; // short extracted snippet (for composer)
  rawText?: string | null; // optional (avoid in user-visible; safe in engine)
  table?: {
    header?: string[];
    rows?: Array<Array<string | number | null>>;
    structureScore?: number;
    numericIntegrityScore?: number;
    warnings?: string[];
    unitAnnotation?: { unitRaw: string; unitNormalized: string } | null;
    scaleFactor?: string | null;
    footnotes?: string[] | null;
  } | null;

  // Scoring components (0..1)
  scores: {
    semantic?: number;
    lexical?: number;
    structural?: number;
    titleBoost?: number;
    keywordBoost?: number;
    typeBoost?: number;
    recencyBoost?: number;
    documentIntelligenceBoost?: number;
    routingPriorityBoost?: number;
    penalties?: number;
    final?: number;
  };

  // Signals computed during pipeline
  signals: {
    isScopedMatch?: boolean;
    isAnchorMatch?: boolean;
    headerFooterCandidate?: boolean;
    scopeViolation?: boolean;
    lowRelevanceChunk?: boolean;
    tableValidated?: boolean;
    tocCandidate?: boolean;
  };

  // Provenance constraints
  provenanceOk: boolean;
}

export interface EvidenceItem {
  evidenceType: CandidateType;
  docId: string;
  title?: string | null;
  filename?: string | null;
  location: ChunkLocation;
  locationKey: string;

  snippet?: string; // text evidence
  table?: CandidateChunk["table"];
  imageRef?: string | null; // if you store images separately

  score: {
    finalScore: number;
    semanticScore?: number;
    lexicalScore?: number;
    structuralScore?: number;
    boosts?: Record<string, number>;
    penalties?: Record<string, number>;
  };

  warnings?: string[];
  extractionHints?: Array<Record<string, any>>;
}

export type RetrievalRuntimeStatus = "ok" | "degraded" | "failed";

export interface RetrievalRuntimeError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, any>;
}

export interface EvidencePack {
  runtimeStatus?: RetrievalRuntimeStatus;
  runtimeError?: RetrievalRuntimeError;

  query: {
    original: string;
    normalized: string;
    expanded?: string[]; // optional; expansion terms actually used
  };

  scope: {
    activeDocId?: string | null;
    explicitDocLock?: boolean;
    candidateDocIds: string[];
    hardScopeActive?: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  };

  stats: {
    candidatesConsidered: number;
    candidatesAfterNegatives: number;
    candidatesAfterBoosts: number;
    candidatesAfterDiversification: number;
    scopeCandidatesDropped: number;
    scopeViolationsDetected: number;
    scopeViolationsThrown: number;
    evidenceItems: number;
    uniqueDocsInEvidence: number;
    topScore: number | null;
    scoreGap: number | null;
    docLevelScores?: Record<string, number>;
  };

  evidence: EvidenceItem[];

  conflicts?: Array<{
    metric: string;
    docA: string;
    valueA: number;
    docB: string;
    valueB: number;
  }>;

  // Debug is *engine-side only*. Never print to user.
  debug?: {
    phases: Array<{ phaseId: string; candidates: number; note?: string }>;
    reasonCodes: string[];
    conflicts?: Array<{
      metric: string;
      docA: string;
      valueA: number;
      docB: string;
      valueB: number;
    }>;
  };

  telemetry?: {
    ruleEvents: RetrievalRuleTelemetryEvent[];
    summary: {
      matchedBoostRuleIds: string[];
      appliedBoostRuleIds: string[];
      rewriteRuleIds: string[];
      selectedSectionRuleId: string | null;
      crossDocGatedReason: string | null;
      classifiedDomain: string | null;
      classifiedDocTypeId: string | null;
      classificationReasons: string[];
    };
  };
}

export type RetrievalRuleTelemetryEventName =
  | "retrieval.boost_rule_hit"
  | "retrieval.boost_rule_applied"
  | "retrieval.rewrite_applied"
  | "retrieval.section_plan_selected"
  | "retrieval.crossdoc_gated";

export interface RetrievalRuleTelemetryEvent {
  event: RetrievalRuleTelemetryEventName;
  payload: Record<string, any>;
}

interface DocumentClassificationResult {
  domain: DocumentIntelligenceDomain | null;
  docTypeId: string | null;
  confidence: number;
  reasons: string[];
  matchedDomainRuleIds: string[];
}

interface DocTypeBoostPlan {
  domain: DocumentIntelligenceDomain;
  docTypeId: string;
  sectionAnchors: string[];
  tableAnchors: string[];
  reasons: string[];
}

interface RetrievalPhaseCounts {
  considered: number;
  afterNegatives: number;
  afterBoosts: number;
  afterDiversification: number;
}

interface RetrievalQueryVariant {
  text: string;
  weight: number;
  sourceRuleId: string;
  reason: string;
}

interface RetrievalPhaseResult {
  phaseId: string;
  source: CandidateSource;
  hits: unknown[];
  status: "ok" | "failed" | "timed_out";
  failureCode?: string;
  note?: string;
}

type ScopeInvariantStage =
  | "post_negatives"
  | "post_diversification"
  | "post_packaging";

export interface RetrievalScopeViolationDetails {
  stage: ScopeInvariantStage;
  allowedDocIds: string[];
  violatingDocIds: string[];
  hardScopeActive: boolean;
  explicitDocLock: boolean;
  explicitDocRef: boolean;
  singleDocIntent: boolean;
  intentFamily?: string | null;
}

export class RetrievalScopeViolationError extends Error {
  readonly code = "RETRIEVAL_SCOPE_VIOLATION";
  readonly details: RetrievalScopeViolationDetails;

  constructor(details: RetrievalScopeViolationDetails) {
    super(
      `Retrieval scope violation at ${details.stage}: ${details.violatingDocIds.join(", ")}`,
    );
    this.name = "RetrievalScopeViolationError";
    this.details = details;
  }
}

export class RetrievalScopeLockConfigurationError extends Error {
  readonly code = "RETRIEVAL_SCOPE_LOCK_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "RetrievalScopeLockConfigurationError";
  }
}

interface RetrievalScopeMetrics {
  scopeCandidatesDropped: number;
  scopeViolationsDetected: number;
  scopeViolationsThrown: number;
}

/**
 * Bank loader interface:
 * You can wire your existing bankLoader.service.ts here.
 */
export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
}

/**
 * Index interfaces (wire to your actual storage).
 * - SemanticIndex: embedding vector search
 * - LexicalIndex: keyword/BM25-like search
 * - StructuralIndex: headings/table headers/TOC anchor signals
 */
export interface SemanticIndex {
  search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface LexicalIndex {
  search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface StructuralIndex {
  search(opts: {
    query: string;
    docIds?: string[];
    k: number;
    anchors: string[];
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface DocStore {
  listDocs(): Promise<DocMeta[]>;
  getDocMeta(docId: string): Promise<DocMeta | null>;
}

/**
 * Optional: a normalizer that applies your tokenization/stopwords/etc.
 * If you don't have one, the engine will still run with basic normalization.
 */
export interface QueryNormalizer {
  normalize(
    query: string,
    langHint?: string,
  ): Promise<{
    normalized: string;
    hasQuotedText: boolean;
    hasFilename: boolean;
  }>;
}

/**
 * Utility: stable hash for dedupe keys.
 */
/**
 * Main Service
 */
export class RetrievalEngineService {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly docStore: DocStore,
    private readonly semanticIndex: SemanticIndex,
    private readonly lexicalIndex: LexicalIndex,
    private readonly structuralIndex: StructuralIndex,
    private readonly queryNormalizer?: QueryNormalizer,
    private readonly documentIntelligenceBanks: Pick<
      DocumentIntelligenceBanksService,
      | "getCrossDocGroundingPolicy"
      | "getDocumentIntelligenceDomains"
      | "getDocTypeCatalog"
      | "getDocTypeSections"
      | "getDocTypeTables"
      | "getDomainDetectionRules"
      | "getRetrievalBoostRules"
      | "getQueryRewriteRules"
      | "getSectionPriorityRules"
    > &
      Partial<
        Pick<DocumentIntelligenceBanksService, "getDocTypeExtractionHints">
      > = getDocumentIntelligenceBanksInstance(),
  ) {}

  /**
   * Detect whether the system is running in encrypted-only mode.
   * In this mode lexical and structural indexes return 0 results
   * because chunk `text` is null.
   */
  private isEncryptedOnlyMode(): boolean {
    const raw = String(process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY || "").trim().toLowerCase();
    if (!raw) return true; // default is encrypted-only
    return ["1", "true", "yes", "on"].includes(raw);
  }

  /**
   * Primary entrypoint: run full retrieval pipeline and return EvidencePack.
   */
  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    // 0) Safety gate: retrieval should not proceed if upstream flagged unsafeGate.
    if (req.signals.unsafeGate) {
      return this.emptyPack(req, {
        reasonCodes: ["unsafe_gate"],
        note: "Retrieval bypassed due to unsafeGate signal.",
      });
    }

    // 1) Load banks (single source of truth)
    const semanticCfg = this.getRequiredBank<any>("semantic_search_config");
    const rankerCfg = this.getRequiredBank<any>("retrieval_ranker_config");
    const boostsKeyword = this.safeGetBank<Record<string, any>>("keyword_boost_rules");
    const boostsTitle = this.safeGetBank<Record<string, any>>("doc_title_boost_rules");
    const boostsType = this.safeGetBank<Record<string, any>>("doc_type_boost_rules");
    const boostsRecency = this.safeGetBank<Record<string, any>>("recency_boost_rules");
    const routingPriority = this.safeGetBank<Record<string, any>>("routing_priority");
    const diversification = this.getRequiredBank<any>("diversification_rules");
    const negatives = this.getRequiredBank<any>("retrieval_negatives");
    const packaging = this.getRequiredBank<any>("evidence_packaging");
    const crossDocGrounding =
      this.documentIntelligenceBanks.getCrossDocGroundingPolicy();

    // 2) Normalize query (bank-driven normalization should happen upstream, but we support it here too)
    const norm = await this.normalizeQuery(req);
    const queryOriginal = req.query;
    const queryNormalized = norm.normalized;

    // Merge detected literals into signals if upstream didn’t set them
    const signals = {
      ...req.signals,
      hasQuotedText: req.signals.hasQuotedText ?? norm.hasQuotedText,
      hasFilename: req.signals.hasFilename ?? norm.hasFilename,
    };
    const allDocs = await this.docStore.listDocs();
    const docMetaById = new Map<string, DocMeta>();
    for (const doc of allDocs) {
      const docId = String(doc?.docId || "").trim();
      if (!docId) continue;
      docMetaById.set(docId, doc);
    }

    // 3) Determine scope docIds (strict on explicit doc locks/refs)
    let scope = await this.resolveScope(req, signals, semanticCfg, allDocs);
    if (scope.hardScopeActive && scope.candidateDocIds.length === 0) {
      const reasonCode = signals.explicitDocRef
        ? "explicit_doc_not_found"
        : "scope_hard_constraints_empty";
      return this.emptyPack(req, {
        reasonCodes: [reasonCode],
        note: "Hard scope active but no candidate documents resolved.",
      });
    }

    const hintedDomain = this.normalizeDomainHint(signals.domainHint);
    const explicitDocIds = this.resolveExplicitDocIds(signals);
    const explicitDocTypes = this.resolveExplicitDocTypes(signals);
    const explicitDocDomains = this.resolveExplicitDocDomains(signals);
    const classification = this.classifyDocumentContext({
      query: queryOriginal,
      normalizedQuery: queryNormalized,
      hintedDomain,
      explicitDocTypes,
      explicitDocDomains,
    });
    const domain = hintedDomain ?? classification.domain;
    const resolvedDocTypes = explicitDocTypes.length
      ? explicitDocTypes
      : classification.docTypeId
        ? [classification.docTypeId]
        : [];
    const resolvedDocDomains = explicitDocDomains.length
      ? explicitDocDomains
      : domain
        ? [domain]
        : [];
    const ruleCtx: RuleMatchContext = {
      query: queryOriginal,
      normalizedQuery: queryNormalized,
      intent: signals.queryFamily ?? signals.intentFamily ?? null,
      operator: signals.operator ?? null,
      domain: domain || null,
      docLock: this.isDocLockActive(signals),
      explicitDocsCount: explicitDocIds.length,
      explicitDocIds,
      explicitDocTypes: resolvedDocTypes,
      explicitDocDomains: resolvedDocDomains,
      language: this.resolveLanguageHint(signals),
    };
    const retrievalRuleEvents: RetrievalRuleTelemetryEvent[] = [];
    const matchedBoostRuleIds: string[] = [];
    const appliedBoostRuleIds: string[] = [];
    const rewriteRuleIds: string[] = [];
    let selectedSectionRuleId: string | null = null;
    let crossDocGatedReason: string | null = null;
    const emitRuleEvent = (
      event: RetrievalRuleTelemetryEventName,
      payload: Record<string, any>,
    ) => {
      retrievalRuleEvents.push({ event, payload });
    };

    const compareIntent = this.isCompareIntent(signals, queryNormalized);
    const crossDocDecision = enforceCrossDocPolicy(
      {
        ...ruleCtx,
        candidateDocIds: scope.candidateDocIds,
        isCompareIntent: compareIntent,
      },
      crossDocGrounding,
    );
    if (!crossDocDecision.allow) {
      crossDocGatedReason = crossDocDecision.reasonCode || "cross_doc_blocked";
      emitRuleEvent("retrieval.crossdoc_gated", {
        reason: crossDocGatedReason,
        requiredExplicitDocs: crossDocDecision.requiredExplicitDocs,
        actualExplicitDocs: crossDocDecision.actualExplicitDocs,
      });
      return this.emptyPack(
        req,
        {
          reasonCodes: [crossDocGatedReason],
          note: crossDocDecision.askDisambiguation
            ? "Cross-document retrieval requires explicit disambiguation."
            : "Cross-document retrieval blocked by policy.",
        },
        this.buildTelemetryDiagnostics({
          ruleEvents: retrievalRuleEvents,
          matchedBoostRuleIds,
          appliedBoostRuleIds,
          rewriteRuleIds,
          selectedSectionRuleId,
          crossDocGatedReason,
          classification,
        }),
      );
    }
    scope = {
      ...scope,
      candidateDocIds: crossDocDecision.allowedCandidateDocIds,
    };

    const retrievalCacheEnabled =
      process.env.BANK_MULTI_LEVEL_CACHE_ENABLED === "true";
    const retrievalCacheModelVersion =
      process.env.RETRIEVAL_MODEL_VERSION ||
      process.env.OPENAI_MODEL ||
      process.env.LLM_MODEL_ID ||
      "unknown";
    let retrievalCacheKey: string | null = null;
    if (retrievalCacheEnabled) {
      retrievalCacheKey = this.buildRetrievalCacheKey({
        queryNormalized,
        scopeDocIds: scope.candidateDocIds,
        domain,
        resolvedDocTypes,
        resolvedDocDomains,
        signals,
        retrievalPlan: req.retrievalPlan || null,
        overrides: req.overrides || null,
        env: req.env,
        modelVersion: retrievalCacheModelVersion,
      });
      const cachedPack = retrievalResultCache.get(retrievalCacheKey);
      if (cachedPack) {
        const clonedCached = this.cloneEvidencePack(cachedPack);
        if (clonedCached.debug) {
          const reasons = Array.isArray(clonedCached.debug.reasonCodes)
            ? clonedCached.debug.reasonCodes
            : [];
          if (!reasons.includes("retrieval_cache_hit")) {
            reasons.push("retrieval_cache_hit");
          }
          clonedCached.debug.reasonCodes = reasons;
        }
        return clonedCached;
      }
    }

    const requiredBankSet =
      Array.isArray(signals.requiredBankIds) &&
      signals.requiredBankIds.length > 0
        ? new Set(
            signals.requiredBankIds
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          )
        : null;
    const includeBank = (bankId: string): boolean =>
      !requiredBankSet || requiredBankSet.has(bankId);
    const domainBoostBank =
      domain && includeBank(`boost_rules_${domain}`)
        ? this.documentIntelligenceBanks.getRetrievalBoostRules(domain)
        : null;
    const domainRewriteBank =
      domain && includeBank(`query_rewrites_${domain}`)
        ? this.documentIntelligenceBanks.getQueryRewriteRules(domain)
        : null;
    const sectionPriorityBank =
      domain && includeBank(`section_priority_${domain}`)
        ? this.documentIntelligenceBanks.getSectionPriorityRules(domain)
        : null;
    const boostRules = Array.isArray(domainBoostBank?.rules)
      ? (domainBoostBank.rules as BoostRule[])
      : [];
    const matchedBoostRules = matchBoostRules(
      {
        ...ruleCtx,
        maxMatchedBoostRules: safeNumber(
          domainBoostBank?.config?.maxMatchedRules,
          3,
        ),
        maxDocumentIntelligenceBoost: safeNumber(
          domainBoostBank?.config?.maxDocumentIntelligenceBoost,
          0.45,
        ),
      },
      boostRules,
    );
    let runtimeBoostRules: MatchedBoostRule[] = [...matchedBoostRules];
    const docTypeBoostPlan =
      domain && resolvedDocTypes.length > 0
        ? this.buildDocTypeBoostPlan(domain, resolvedDocTypes[0])
        : null;
    const syntheticDocTypeRule = docTypeBoostPlan
      ? this.buildDocTypeMatchedRule(docTypeBoostPlan)
      : null;
    if (syntheticDocTypeRule) {
      runtimeBoostRules.push(syntheticDocTypeRule);
    }
    runtimeBoostRules = runtimeBoostRules.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });
    for (const rule of runtimeBoostRules) {
      matchedBoostRuleIds.push(rule.id);
      emitRuleEvent("retrieval.boost_rule_hit", {
        ruleId: rule.id,
        domain: domain || "unknown",
        operator: signals.operator ?? "unknown",
        intent: signals.intentFamily ?? "unknown",
      });
    }

    // 4) Expansion gating (never expand literals; only when allowed)
    const expansion = this.computeExpansionPolicy(req, signals, semanticCfg);
    const expansionDisabledByOverride = Boolean(
      req.overrides?.disableExpansion,
    );
    const expandedQueries = expansion.enabled
      ? expansionDisabledByOverride
        ? []
        : this.expandQuery(queryNormalized, signals)
      : [];
    const rewriteRules = Array.isArray(domainRewriteBank?.rules)
      ? (domainRewriteBank.rules as RewriteRule[])
      : [];
    const rewriteCacheEnabled =
      process.env.BANK_MULTI_LEVEL_CACHE_ENABLED === "true";
    const rewriteCacheKeyBase = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          queryNormalized,
          domain: domain || "unknown",
          intentFamily: signals.queryFamily ?? signals.intentFamily ?? "any",
          locale: this.resolveLanguageHint(signals),
          rewriteRuleCount: rewriteRules.length,
          bankVersion: signals.selectedBankVersionMap || null,
        }),
        "utf8",
      )
      .digest("hex");
    const rewriteCacheKey = `rewrite:${rewriteCacheKeyBase}`;
    const cachedRewrite = rewriteCacheEnabled
      ? queryRewriteCache.get(rewriteCacheKey)
      : null;
    const domainRewriteVariants = cachedRewrite
      ? cachedRewrite.variants
      : applyQueryRewrites(
          {
            ...ruleCtx,
            contextText: queryNormalized,
            maxQueryVariants: safeNumber(
              domainRewriteBank?.config?.maxRewriteTerms,
              12,
            ),
          },
          rewriteRules,
        );
    if (!cachedRewrite && rewriteCacheEnabled) {
      queryRewriteCache.set(rewriteCacheKey, {
        variants: domainRewriteVariants,
        ruleIds: Array.from(
          new Set(
            domainRewriteVariants
              .map((variant) => String(variant.sourceRuleId || "").trim())
              .filter(Boolean),
          ),
        ),
      });
    }
    const rewriteVariantCounts = new Map<string, number>();
    for (const variant of domainRewriteVariants) {
      const ruleId = String(variant.sourceRuleId || "").trim();
      if (!ruleId) continue;
      rewriteVariantCounts.set(
        ruleId,
        (rewriteVariantCounts.get(ruleId) || 0) + 1,
      );
    }
    const sortedRewriteCounts = Array.from(rewriteVariantCounts.entries()).sort(
      (a, b) => a[0].localeCompare(b[0]),
    );
    for (const [ruleId, variantCount] of sortedRewriteCounts) {
      rewriteRuleIds.push(ruleId);
      emitRuleEvent("retrieval.rewrite_applied", {
        ruleId,
        variantCount,
      });
    }
    const queryVariants = this.buildQueryVariants({
      baseQuery: queryNormalized,
      expandedQueries,
      rewriteVariants: domainRewriteVariants,
      plannerQueryVariants: Array.isArray(req.retrievalPlan?.queryVariants)
        ? (req.retrievalPlan?.queryVariants as string[])
        : [],
      requiredTerms: Array.isArray(req.retrievalPlan?.requiredTerms)
        ? (req.retrievalPlan?.requiredTerms as string[])
        : [],
      maxVariants: safeNumber(domainRewriteBank?.config?.maxRewriteTerms, 12),
    });
    const sectionRules = Array.isArray(sectionPriorityBank?.priorities)
      ? (sectionPriorityBank.priorities as SectionPriorityRule[])
      : [];
    const sectionScanPlan = selectSectionScanPlan(ruleCtx, sectionRules);
    selectedSectionRuleId = sectionScanPlan.selectedRuleId;
    if (selectedSectionRuleId) {
      emitRuleEvent("retrieval.section_plan_selected", {
        ruleId: selectedSectionRuleId,
        anchorsCount: sectionScanPlan.sections.length,
      });
    }
    const additionalStructuralAnchors = Array.from(
      new Set([
        ...sectionScanPlan.sections,
        ...(docTypeBoostPlan?.sectionAnchors || []),
        ...(docTypeBoostPlan?.tableAnchors || []),
      ]),
    );

    // 5) Execute hybrid retrieval phases (semantic + lexical rescue + structural anchors)
    const phaseResults = await this.runPhases({
      queryVariants,
      scopeDocIds: scope.candidateDocIds,
      semanticCfg,
      additionalStructuralAnchors,
    });

    // 6) Merge into CandidateChunks with provenance + stable ids
    let candidates = this.mergePhaseCandidates(phaseResults, scope, req);
    const exploratoryMode = this.isExploratoryRetrievalRequest({
      compareIntent,
      queryNormalized,
      signals,
      classification,
      resolvedDocTypes,
    });
    candidates = this.applyNonComparePurityPreRank(candidates, {
      compareIntent,
      classification,
      resolvedDocTypes,
      signals,
      exploratoryMode,
    });
    const scopeMetrics: RetrievalScopeMetrics = {
      scopeCandidatesDropped: 0,
      scopeViolationsDetected: 0,
      scopeViolationsThrown: 0,
    };
    const phaseCounts: RetrievalPhaseCounts = {
      considered: candidates.length,
      afterNegatives: candidates.length,
      afterBoosts: candidates.length,
      afterDiversification: candidates.length,
    };

    // 7) Apply retrieval negatives (hard blocks + soft penalties) deterministically
    candidates = this.applyRetrievalNegatives(
      candidates,
      req,
      signals,
      scope,
      negatives,
      scopeMetrics,
    );
    phaseCounts.afterNegatives = candidates.length;
    this.enforceScopeInvariant(
      candidates.map((candidate) => candidate.docId),
      scope,
      signals,
      "post_negatives",
      scopeMetrics,
    );

    // 8) Apply boosts (keyword/title/type/recency), with caps and guards
    candidates = this.applyBoosts(
      candidates,
      req,
      signals,
      {
        boostsKeyword,
        boostsTitle,
        boostsType,
        boostsRecency,
      },
      docMetaById,
    );
    const documentIntelligenceBoostCtx: RuleMatchContext = {
      ...ruleCtx,
      maxMatchedBoostRules: safeNumber(
        domainBoostBank?.config?.maxMatchedRules,
        3,
      ),
      maxDocumentIntelligenceBoost: safeNumber(
        domainBoostBank?.config?.maxDocumentIntelligenceBoost,
        0.45,
      ),
    };
    const boostDeltaSummaries = summarizeBoostRuleApplications(
      documentIntelligenceBoostCtx,
      candidates,
      runtimeBoostRules,
    );
    for (const summary of boostDeltaSummaries) {
      appliedBoostRuleIds.push(summary.ruleId);
      emitRuleEvent("retrieval.boost_rule_applied", {
        ruleId: summary.ruleId,
        scoreDeltaSummary: {
          candidateHits: summary.candidateHits,
          totalDelta: summary.totalDelta,
          averageDelta: summary.averageDelta,
          maxDelta: summary.maxDelta,
        },
      });
    }
    candidates = applyBoostScoring(
      documentIntelligenceBoostCtx,
      candidates,
      runtimeBoostRules,
    ) as CandidateChunk[];
    candidates = this.applyRetrievalPlanHints(candidates, req.retrievalPlan);
    phaseCounts.afterBoosts = candidates.length;

    // 9) Rank candidates using ranker config (weights + normalization + tie-breakers)
    candidates = this.rankCandidates(
      candidates,
      req,
      signals,
      rankerCfg,
      routingPriority || undefined,
    );

    // 10) Diversify (doc/section spread + near-dup control) unless disabled by overrides/lock policy
    if (!req.overrides?.disableDiversification) {
      candidates = this.applyDiversification(
        candidates,
        req,
        signals,
        diversification,
      );
    }
    phaseCounts.afterDiversification = candidates.length;
    this.enforceScopeInvariant(
      candidates.map((candidate) => candidate.docId),
      scope,
      signals,
      "post_diversification",
      scopeMetrics,
    );

    // 11) Package evidence (strict provenance + caps) into EvidencePack
    const pack = this.packageEvidence(candidates, req, signals, packaging, {
      queryOriginal,
      queryNormalized,
      expandedQueries: queryVariants
        .map((variant) => variant.text)
        .filter((text) => text !== queryNormalized),
      scope,
      compareIntent,
      exploratoryMode,
      classification,
      resolvedDocTypes,
      phaseCounts,
      scopeMetrics,
    });
    pack.telemetry = this.buildTelemetryDiagnostics({
      ruleEvents: retrievalRuleEvents,
      matchedBoostRuleIds,
      appliedBoostRuleIds,
      rewriteRuleIds,
      selectedSectionRuleId,
      crossDocGatedReason,
      classification,
    });
    const phaseFailureReasonCodes = Array.from(
      new Set(
        phaseResults
          .map((phase) => phase.failureCode)
          .filter((code): code is string => Boolean(code)),
      ),
    );
    const phaseFailureNotes = phaseResults
      .filter((phase) => phase.status !== "ok")
      .map((phase) => ({
        phaseId: phase.phaseId,
        candidates: phase.hits.length,
        note: phase.note,
      }));
    if (phaseFailureReasonCodes.length > 0 || phaseFailureNotes.length > 0) {
      if (!pack.debug) {
        pack.debug = { phases: [], reasonCodes: [] };
      }
      for (const reasonCode of phaseFailureReasonCodes) {
        if (!pack.debug.reasonCodes.includes(reasonCode)) {
          pack.debug.reasonCodes.push(reasonCode);
        }
      }
      const seenPhaseIds = new Set(pack.debug.phases.map((phase) => phase.phaseId));
      for (const phase of phaseFailureNotes) {
        if (seenPhaseIds.has(phase.phaseId)) continue;
        pack.debug.phases.push(phase);
        seenPhaseIds.add(phase.phaseId);
      }
    }
    this.enforceScopeInvariant(
      pack.evidence.map((evidence) => evidence.docId),
      scope,
      signals,
      "post_packaging",
      scopeMetrics,
    );

    // 12) Final safety: never include raw debug in production (still keep internal stats)
    if (pack.evidence.length === 0 && scope.hardScopeActive) {
      const reasonCode =
        signals.explicitDocRef && !signals.resolvedDocId
          ? "explicit_doc_not_found"
          : "scope_hard_constraints_empty";
      if (!pack.debug) {
        pack.debug = { phases: [], reasonCodes: [reasonCode] };
      } else if (!pack.debug.reasonCodes.includes(reasonCode)) {
        pack.debug.reasonCodes.push(reasonCode);
      }
    }

    if (isProductionEnv(req.env)) {
      delete pack.debug;
    }

    if (retrievalCacheEnabled && retrievalCacheKey) {
      retrievalResultCache.set(retrievalCacheKey, this.cloneEvidencePack(pack));
    }

    return pack;
  }

  // -----------------------------
  // Normalization
  // -----------------------------

  private async normalizeQuery(req: RetrievalRequest): Promise<{
    normalized: string;
    hasQuotedText: boolean;
    hasFilename: boolean;
  }> {
    if (this.queryNormalizer) {
      return this.queryNormalizer.normalize(
        req.query,
        req.signals?.intentFamily ?? "any",
      );
    }

    // Fallback normalization (non-destructive)
    const q = (req.query ?? "").trim().replace(/\s+/g, " ");
    const hasQuotedText = /"[^"]{2,}"/.test(q);
    const hasFilename =
      /\b\w[\w\-_. ]{0,160}\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\b/i.test(
        q,
      );

    // Light casefold for matching; do not remove punctuation aggressively
    const normalized = q.toLowerCase();
    return { normalized, hasQuotedText, hasFilename };
  }

  // -----------------------------
  // Scope resolution (docIds)
  // -----------------------------

  private async resolveScope(
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    semanticCfg: Record<string, any>,
    docsInput?: DocMeta[],
  ): Promise<{
    candidateDocIds: string[];
    hardScopeActive: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  }> {
    const docs =
      Array.isArray(docsInput) && docsInput.length
        ? docsInput
        : await this.docStore.listDocs();
    const allDocIds = Array.from(
      new Set(docs.map((d) => String(d.docId || "").trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    const overrideCap = Number(req.overrides?.maxCandidateDocsHard);
    const maxCandidateDocsHard =
      Number.isFinite(overrideCap) && overrideCap > 0
        ? Math.floor(overrideCap)
        : 0;
    const allDocIdsCapped =
      maxCandidateDocsHard > 0
        ? allDocIds.slice(0, maxCandidateDocsHard)
        : allDocIds;

    const explicitDocId = signals.resolvedDocId ?? null;
    const activeDocId = signals.activeDocId ?? null;
    const docScopeLock = resolveDocScopeLockFromSignals(signals);

    const isDiscovery = (signals.intentFamily ?? null) === "doc_discovery";
    const corpusAllowed = signals.corpusSearchAllowed ?? isDiscovery;

    // Canonical scope lock owner:
    // - single_doc: strict one-doc lock
    // - docset: strict multi-doc lock
    if (docScopeLock.mode === "single_doc" && !corpusAllowed) {
      const singleDocId =
        String(docScopeLock.activeDocumentId || "").trim() ||
        docScopeLock.allowedDocumentIds[0] ||
        "";
      if (!singleDocId) {
        return {
          candidateDocIds: [],
          hardScopeActive: true,
          sheetName: signals.resolvedSheetName ?? null,
          rangeA1: signals.resolvedRangeA1 ?? null,
        };
      }
      return {
        candidateDocIds: [singleDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    if (docScopeLock.mode === "docset" && !corpusAllowed) {
      if (docScopeLock.allowedDocumentIds.length === 0) {
        throw new RetrievalScopeLockConfigurationError(
          "docScopeLock.mode=docset requires non-empty allowedDocumentIds.",
        );
      }
      const allowedSet = new Set(docScopeLock.allowedDocumentIds);
      // IMPORTANT: never apply corpus-wide max-candidate caps before enforcing
      // an explicit docset lock. Attached-doc scope is the user's hard source
      // of truth and must remain intact even when > maxCandidateDocsHard.
      const scopedDocIds = allDocIds.filter((docId) => allowedSet.has(docId));
      return {
        candidateDocIds: scopedDocIds,
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Legacy explicit doc ref always wins (hard lock candidate)
    if (signals.explicitDocRef) {
      if (!explicitDocId) {
        return {
          candidateDocIds: [],
          hardScopeActive: true,
          sheetName: signals.resolvedSheetName ?? null,
          rangeA1: signals.resolvedRangeA1 ?? null,
        };
      }
      return {
        candidateDocIds: [explicitDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Legacy explicit doc lock: restrict to active doc unless discovery mode
    if (signals.explicitDocLock && activeDocId && !corpusAllowed) {
      return {
        candidateDocIds: [activeDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Legacy single-doc intent: prefer active doc if exists; else fall back to corpus
    if (signals.singleDocIntent && activeDocId && !corpusAllowed) {
      return {
        candidateDocIds: [activeDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Otherwise corpus-wide candidates (later doc selection/ranker will narrow)
    // Note: semantic_search_config may cap candidate docs; keep all here, cap later.
    return {
      candidateDocIds: allDocIdsCapped,
      hardScopeActive: Boolean(signals.hardScopeActive),
      sheetName: signals.resolvedSheetName ?? null,
      rangeA1: signals.resolvedRangeA1 ?? null,
    };
  }

  // -----------------------------
  // Expansion
  // -----------------------------

  private computeExpansionPolicy(
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    semanticCfg: Record<string, any>,
  ): { enabled: boolean } {
    const policy = semanticCfg?.config?.queryExpansionPolicy;
    const enabledByBank = Boolean(policy?.enabled);

    // Global never-expand literals
    if (signals.hasQuotedText || signals.hasFilename) return { enabled: false };
    if (signals.userAskedForQuote) return { enabled: false };

    // Bank gating
    if (!enabledByBank) return { enabled: false };

    // Must be explicitly allowed upstream OR discovery mode (optional)
    const allowExpansion = Boolean(signals.allowExpansion);
    if (!allowExpansion) return { enabled: false };

    return { enabled: true };
  }

  /**
   * Query expansion using synonym_expansion bank.
   *
   * NOTE: Cross-lingual retrieval is handled by multilingual embeddings (text-embedding-3-small).
   * This expansion is ONLY for:
   *   - Acronyms (ROI, NOI, DRE, EBITDA)
   *   - Domain jargon and abbreviations
   *   - Brazil-specific tokens (NF-e, DARF, NFSe)
   *   - Legal shorthand (NDA, MSA, SOW)
   *
   * Do NOT add general translation terms here - embeddings handle that automatically.
   */
  private expandQuery(
    normalizedQuery: string,
    signals: RetrievalRequest["signals"],
  ): string[] {
    const synonymBank = this.safeGetBank<Record<string, any>>("synonym_expansion");
    if (!synonymBank?.config?.enabled || !synonymBank?.groups) {
      return [normalizedQuery];
    }

    const cfg = synonymBank.config;
    const maxExpansionsTotal = safeNumber(cfg.policy?.maxExpansionsTotal, 12);
    const maxExpansionsPerTerm = safeNumber(
      cfg.policy?.maxExpansionsPerTerm,
      4,
    );

    const queryTokens = this.simpleTokens(normalizedQuery);
    const expansions = new Set<string>([normalizedQuery]);

    // Build lookup map from all groups: variant -> canonical and canonical -> variants
    const variantToCanonical = new Map<string, string>();
    const canonicalToVariants = new Map<string, string[]>();

    for (const group of synonymBank.groups) {
      if (!group.synonyms) continue;
      for (const entry of group.synonyms) {
        const canonical = (entry.canonical ?? "").toLowerCase().trim();
        if (!canonical) continue;

        const variants = (entry.variants ?? [])
          .map((v: string) => v.toLowerCase().trim())
          .filter(Boolean);

        // Map canonical to all variants (for expansion)
        const existing = canonicalToVariants.get(canonical) || [];
        const merged = existing.concat(variants);
        canonicalToVariants.set(canonical, Array.from(new Set(merged)));

        // Map each variant to canonical (for lookup)
        for (const v of variants) {
          variantToCanonical.set(v, canonical);
        }
        // Also map canonical to itself
        variantToCanonical.set(canonical, canonical);
      }
    }

    // For each query token, check if it matches a canonical or variant
    for (const token of queryTokens) {
      if (expansions.size >= maxExpansionsTotal) break;

      // Check if token is a variant -> get canonical
      const canonical = variantToCanonical.get(token);
      if (canonical) {
        // Add canonical if different from token
        if (canonical !== token) {
          expansions.add(
            normalizedQuery.replace(
              new RegExp(`\\b${this.escapeRegex(token)}\\b`, "gi"),
              canonical,
            ),
          );
        }

        // Add other variants of the same concept
        const variants = canonicalToVariants.get(canonical) || [];
        let addedForTerm = 0;
        for (const variant of variants) {
          if (addedForTerm >= maxExpansionsPerTerm) break;
          if (variant !== token && expansions.size < maxExpansionsTotal) {
            expansions.add(
              normalizedQuery.replace(
                new RegExp(`\\b${this.escapeRegex(token)}\\b`, "gi"),
                variant,
              ),
            );
            addedForTerm++;
          }
        }
      }
    }

    return Array.from(expansions);
  }

  private normalizeDomainHint(
    domainHint: string | null | undefined,
  ): DocumentIntelligenceDomain | null {
    const normalized = String(domainHint || "")
      .trim()
      .toLowerCase();
    if (!normalized) return null;

    const aliasMap: Record<string, DocumentIntelligenceDomain> = {
      accounting: "accounting",
      banking: "banking",
      billing: "billing",
      education: "education",
      finance: "finance",
      housing: "housing",
      hr: "hr_payroll",
      "hr-payroll": "hr_payroll",
      hr_payroll: "hr_payroll",
      "human-resources": "hr_payroll",
      human_resources: "hr_payroll",
      identity: "identity",
      insurance: "insurance",
      legal: "legal",
      medical: "medical",
      ops: "ops",
      operations: "ops",
      tax: "tax",
      taxation: "tax",
      travel: "travel",
    };

    return aliasMap[normalized] || null;
  }

  private resolveExplicitDocIds(
    signals: RetrievalRequest["signals"],
  ): string[] {
    const docScopeLock = resolveDocScopeLockFromSignals(signals);
    const out = [
      ...(Array.isArray(signals.explicitDocIds) ? signals.explicitDocIds : []),
      ...(Array.isArray(signals.allowedDocumentIds)
        ? signals.allowedDocumentIds
        : []),
      ...(Array.isArray(docScopeLock.allowedDocumentIds)
        ? docScopeLock.allowedDocumentIds
        : []),
      signals.resolvedDocId ?? "",
      signals.activeDocId ?? "",
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return Array.from(new Set(out));
  }

  private resolveExplicitDocTypes(
    signals: RetrievalRequest["signals"],
  ): string[] {
    if (!Array.isArray(signals.explicitDocTypes)) return [];
    return Array.from(
      new Set(
        signals.explicitDocTypes
          .map((value) => this.normalizeDocType(value))
          .filter(Boolean) as string[],
      ),
    );
  }

  private resolveExplicitDocDomains(
    signals: RetrievalRequest["signals"],
  ): string[] {
    if (!Array.isArray(signals.explicitDocDomains)) return [];
    const out = signals.explicitDocDomains
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    return Array.from(new Set(out));
  }

  private isDocLockActive(signals: RetrievalRequest["signals"]): boolean {
    const docScopeLock = resolveDocScopeLockFromSignals(signals);
    return (
      docScopeLock.mode !== "none" ||
      Boolean(signals.explicitDocLock || signals.explicitDocRef)
    );
  }

  private resolveLanguageHint(signals: RetrievalRequest["signals"]): string {
    return String(signals.languageHint || "any")
      .trim()
      .toLowerCase();
  }

  private isCompareIntent(
    signals: RetrievalRequest["signals"],
    normalizedQuery: string,
  ): boolean {
    const intent = String(signals.intentFamily || "").toLowerCase();
    const operator = String(signals.operator || "").toLowerCase();
    if (intent.includes("compare")) return true;
    if (operator.includes("compare")) return true;
    return /\b(compare|comparison|vs\.?|versus|difference|differ|between|contrast|comparar|diferenca|diferença|entre)\b/i.test(
      normalizedQuery,
    );
  }

  private normalizeDocType(value: unknown): string | null {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized || null;
  }

  private listClassificationDomains(): DocumentIntelligenceDomain[] {
    const fallback: DocumentIntelligenceDomain[] = [
      "accounting",
      "banking",
      "billing",
      "education",
      "finance",
      "housing",
      "hr_payroll",
      "identity",
      "insurance",
      "legal",
      "medical",
      "ops",
      "tax",
      "travel",
    ];
    try {
      const provider = this.documentIntelligenceBanks as Record<string, any>;
      const domains =
        typeof provider.getDocumentIntelligenceDomains === "function"
          ? provider.getDocumentIntelligenceDomains()
          : null;
      return Array.isArray(domains) && domains.length ? domains : fallback;
    } catch {
      return fallback;
    }
  }

  private regexMatches(input: string, pattern: string): boolean {
    try {
      return new RegExp(pattern, "i").test(input);
    } catch {
      return false;
    }
  }

  private classifyDocTypeForDomain(
    domain: DocumentIntelligenceDomain,
    normalizedQuery: string,
  ): {
    docTypeId: string;
    score: number;
    reasons: string[];
  } | null {
    const provider = this.documentIntelligenceBanks as Record<string, any>;
    const catalog =
      typeof provider.getDocTypeCatalog === "function"
        ? provider.getDocTypeCatalog(domain)
        : null;
    const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
    const matches: Array<{
      docTypeId: string;
      score: number;
      reasons: string[];
    }> = [];

    for (const docType of docTypes) {
      const docTypeId = this.normalizeDocType(docType?.id);
      if (!docTypeId) continue;
      const patterns = Array.isArray(docType?.detectionPatterns)
        ? docType.detectionPatterns
            .map((value: unknown) => String(value || "").trim())
            .filter(Boolean)
        : [];
      let hitCount = 0;
      const reasons: string[] = [];
      for (const pattern of patterns) {
        if (!this.regexMatches(normalizedQuery, pattern)) continue;
        hitCount += 1;
        reasons.push(`doc_type_pattern:${pattern}`);
      }
      if (!hitCount) continue;
      const priority = safeNumber(docType?.priority, 0);
      const score = hitCount + Math.max(0, priority) / 100;
      matches.push({
        docTypeId,
        score,
        reasons: reasons.slice(0, 6),
      });
    }

    if (!matches.length) return null;
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.docTypeId.localeCompare(b.docTypeId);
    });
    return matches[0];
  }

  private classifyDocumentContext(params: {
    query: string;
    normalizedQuery: string;
    hintedDomain: DocumentIntelligenceDomain | null;
    explicitDocTypes: string[];
    explicitDocDomains: string[];
  }): DocumentClassificationResult {
    const reasons: string[] = [];
    const matchedDomainRuleIds: string[] = [];
    const domains = this.listClassificationDomains();

    let domain = params.hintedDomain;
    if (domain) {
      reasons.push(`domain_hint:${domain}`);
    }

    if (!domain && params.explicitDocDomains.length > 0) {
      const resolved = this.normalizeDomainHint(params.explicitDocDomains[0]);
      if (resolved) {
        domain = resolved;
        reasons.push(`explicit_doc_domain:${resolved}`);
      }
    }

    if (!domain) {
      const candidates: Array<{
        domain: DocumentIntelligenceDomain;
        score: number;
        matchedRuleIds: string[];
        reasons: string[];
      }> = [];

      for (const candidateDomain of domains) {
        const provider = this.documentIntelligenceBanks as Record<string, any>;
        const bank =
          typeof provider.getDomainDetectionRules === "function"
            ? provider.getDomainDetectionRules(candidateDomain)
            : null;
        const rules = Array.isArray(bank?.rules) ? bank.rules : [];
        let score = 0;
        const ruleIds: string[] = [];
        const domainReasons: string[] = [];

        for (const rule of rules) {
          const ruleId = String(rule?.id || "").trim();
          const patterns = Array.isArray(rule?.patterns)
            ? rule.patterns
                .map((value: unknown) => String(value || "").trim())
                .filter(Boolean)
            : [];
          if (!patterns.length) continue;
          const hasMatch = patterns.some((pattern: string) =>
            this.regexMatches(params.normalizedQuery, pattern),
          );
          if (!hasMatch) continue;

          const weight = safeNumber(
            rule?.weight,
            String(rule?.ruleType || "").toLowerCase() === "negative" ? -1 : 1,
          );
          score += weight;
          if (ruleId) ruleIds.push(ruleId);
          domainReasons.push(
            `${ruleId || "rule"}:${weight > 0 ? "positive" : "negative"}`,
          );
        }

        if (!ruleIds.length) continue;
        candidates.push({
          domain: candidateDomain,
          score,
          matchedRuleIds: ruleIds,
          reasons: domainReasons,
        });
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.matchedRuleIds.length !== a.matchedRuleIds.length) {
            return b.matchedRuleIds.length - a.matchedRuleIds.length;
          }
          return a.domain.localeCompare(b.domain);
        });
        if (candidates[0].score > 0) {
          domain = candidates[0].domain;
          matchedDomainRuleIds.push(
            ...Array.from(new Set(candidates[0].matchedRuleIds)),
          );
          reasons.push(...candidates[0].reasons.slice(0, 8));
        }
      }
    }

    let docTypeId: string | null = null;
    if (params.explicitDocTypes.length > 0) {
      docTypeId = this.normalizeDocType(params.explicitDocTypes[0]);
      if (docTypeId) reasons.push(`explicit_doc_type:${docTypeId}`);
    }

    if (!docTypeId && domain) {
      const docTypeMatch = this.classifyDocTypeForDomain(
        domain,
        params.normalizedQuery,
      );
      if (docTypeMatch) {
        docTypeId = docTypeMatch.docTypeId;
        reasons.push(...docTypeMatch.reasons.slice(0, 6));
      }
    }

    // Fallback: infer domain from doc type if domain score was inconclusive.
    if (!domain && docTypeId) {
      for (const candidateDomain of domains) {
        const provider = this.documentIntelligenceBanks as Record<string, any>;
        const catalog =
          typeof provider.getDocTypeCatalog === "function"
            ? provider.getDocTypeCatalog(candidateDomain)
            : null;
        const docTypes = Array.isArray(catalog?.docTypes)
          ? catalog.docTypes
          : [];
        const hasDocType = docTypes.some(
          (entry: unknown) => this.normalizeDocType((entry as Record<string, any>)?.id) === docTypeId,
        );
        if (hasDocType) {
          domain = candidateDomain;
          reasons.push(`doc_type_implied_domain:${candidateDomain}`);
          break;
        }
      }
    }

    const confidence = clamp01(
      (domain ? 0.45 : 0) +
        (docTypeId ? 0.35 : 0) +
        Math.min(0.2, matchedDomainRuleIds.length * 0.03),
    );

    return {
      domain: domain || null,
      docTypeId: docTypeId || null,
      confidence,
      reasons: Array.from(new Set(reasons)).slice(0, 12),
      matchedDomainRuleIds: Array.from(new Set(matchedDomainRuleIds)).slice(
        0,
        12,
      ),
    };
  }

  private buildDocTypeBoostPlan(
    domain: DocumentIntelligenceDomain,
    docTypeId: string,
  ): DocTypeBoostPlan | null {
    const normalizedDocType = this.normalizeDocType(docTypeId);
    if (!normalizedDocType) return null;

    const provider = this.documentIntelligenceBanks as Record<string, any>;
    const sectionsBank =
      typeof provider.getDocTypeSections === "function"
        ? provider.getDocTypeSections(domain, normalizedDocType)
        : null;
    const tablesBank =
      typeof provider.getDocTypeTables === "function"
        ? provider.getDocTypeTables(domain, normalizedDocType)
        : null;
    const sections = Array.isArray(sectionsBank?.sections)
      ? sectionsBank.sections
      : [];
    const tableMappings = Array.isArray(tablesBank?.tableHeaderMappings)
      ? tablesBank.tableHeaderMappings
      : [];
    const tables = Array.isArray(tablesBank?.tables) ? tablesBank.tables : [];

    const sectionAnchors: string[] = sections
      .map((section: unknown): { order: number; values: string[] } => {
        const sec = section as Record<string, any>;
        const order = safeNumber(sec?.order, 9999);
        const sectionId = String(sec?.id || "")
          .trim()
          .toLowerCase();
        const nameRecord = sec?.name as Record<string, any> | undefined;
        const en = String(nameRecord?.en || "")
          .trim()
          .toLowerCase();
        const pt = String(nameRecord?.pt || "")
          .trim()
          .toLowerCase();
        return {
          order,
          values: [sectionId, en, pt].filter(Boolean),
        };
      })
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
      .flatMap((entry: { values: string[] }) => entry.values);

    const tableAnchors: string[] = [
      ...tableMappings.flatMap((mapping: unknown) => {
        const m = mapping as Record<string, any>;
        return [
          String(m?.canonicalHeader || "")
            .trim()
            .toLowerCase(),
          ...(Array.isArray(m?.synonyms)
            ? (m.synonyms as unknown[]).map((value: unknown) =>
                String(value || "")
                  .trim()
                  .toLowerCase(),
              )
            : []),
        ];
      }),
      ...tables.flatMap((table: any) => [
        String(table?.id || "")
          .trim()
          .toLowerCase(),
        String(table?.name?.en || "")
          .trim()
          .toLowerCase(),
        String(table?.name?.pt || "")
          .trim()
          .toLowerCase(),
        ...(Array.isArray(table?.expectedColumns)
          ? table.expectedColumns.map((value: unknown) =>
              String(value || "")
                .trim()
                .toLowerCase(),
            )
          : []),
      ]),
    ].filter((value): value is string => Boolean(value));

    const normalizedSectionAnchors = Array.from(new Set(sectionAnchors)).slice(
      0,
      16,
    );
    const normalizedTableAnchors = Array.from(new Set(tableAnchors)).slice(
      0,
      16,
    );

    return {
      domain,
      docTypeId: normalizedDocType,
      sectionAnchors: normalizedSectionAnchors,
      tableAnchors: normalizedTableAnchors,
      reasons: [
        `doc_type_sections:${normalizedSectionAnchors.length}`,
        `doc_type_tables:${normalizedTableAnchors.length}`,
      ],
    };
  }

  private buildDocTypeMatchedRule(
    plan: DocTypeBoostPlan,
  ): MatchedBoostRule | null {
    const docType = this.normalizeDocType(plan.docTypeId);
    if (!docType) return null;
    const sectionWeights: Record<string, number> = {};
    for (let i = 0; i < plan.sectionAnchors.length; i += 1) {
      const section = this.normalizeDocType(plan.sectionAnchors[i]);
      if (!section) continue;
      sectionWeights[section] = Math.max(1, 3 - i * 0.08);
    }
    return {
      id: `doc_type_pack_${docType}`,
      priority: 999,
      weight: 1,
      docTypeWeights: {
        [docType]: 3,
      },
      sectionWeights,
    };
  }

  private buildQueryVariants(opts: {
    baseQuery: string;
    expandedQueries: string[];
    rewriteVariants: QueryVariant[];
    plannerQueryVariants: string[];
    requiredTerms: string[];
    maxVariants: number;
  }): RetrievalQueryVariant[] {
    const requestedMaxVariants = Math.max(
      1,
      Math.floor(Number(opts.maxVariants || 6)),
    );
    const runtimeMaxVariants = Math.max(
      1,
      Math.floor(safeNumber(process.env.RETRIEVAL_MAX_QUERY_VARIANTS, 6)),
    );
    const maxVariants = Math.min(requestedMaxVariants, runtimeMaxVariants);
    const base: RetrievalQueryVariant = {
      text: opts.baseQuery,
      weight: 1,
      sourceRuleId: "base_query",
      reason: "normalized query",
    };

    const expansionVariants: RetrievalQueryVariant[] = opts.expandedQueries
      .map((query) =>
        String(query || "")
          .trim()
          .toLowerCase(),
      )
      .filter((query) => query && query !== opts.baseQuery)
      .map((query, index) => ({
        text: query,
        weight: 0.85,
        sourceRuleId: `synonym_expansion_${index + 1}`,
        reason: "synonym expansion",
      }));

    const rewriteVariants: RetrievalQueryVariant[] = (
      opts.rewriteVariants || []
    )
      .map((variant) => ({
        text: String(variant.text || "")
          .trim()
          .toLowerCase(),
        weight: Math.max(0.1, Math.min(safeNumber(variant.weight, 1), 3)),
        sourceRuleId: String(variant.sourceRuleId || "rewrite_rule"),
        reason: String(variant.reason || "rewrite rule"),
      }))
      .filter((variant) => variant.text && variant.text !== opts.baseQuery);

    const plannerVariants: RetrievalQueryVariant[] = (opts.plannerQueryVariants || [])
      .map((query, index) => ({
        text: String(query || "")
          .trim()
          .toLowerCase(),
        weight: 0.95,
        sourceRuleId: `planner_variant_${index + 1}`,
        reason: "retrieval planner variant",
      }))
      .filter((variant) => variant.text && variant.text !== opts.baseQuery);

    const requiredTermVariants: RetrievalQueryVariant[] = (
      opts.requiredTerms || []
    )
      .map((term, index) => ({
        text: String(term || "")
          .trim()
          .toLowerCase(),
        weight: 0.72,
        sourceRuleId: `planner_required_term_${index + 1}`,
        reason: "required term hint",
      }))
      .filter((variant) => variant.text && variant.text !== opts.baseQuery);

    const extras = [
      ...plannerVariants,
      ...rewriteVariants,
      ...requiredTermVariants,
      ...expansionVariants,
    ];
    extras.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (a.sourceRuleId !== b.sourceRuleId)
        return a.sourceRuleId.localeCompare(b.sourceRuleId);
      return a.text.localeCompare(b.text);
    });

    const out: RetrievalQueryVariant[] = [base];
    const seen = new Set<string>([opts.baseQuery.toLowerCase()]);
    for (const variant of extras) {
      const key = variant.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(variant);
      if (out.length >= maxVariants) break;
    }

    return out;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // -----------------------------
  // Retrieval phases
  // -----------------------------

  private async runPhases(opts: {
    queryVariants: RetrievalQueryVariant[];
    scopeDocIds: string[];
    semanticCfg: Record<string, any>;
    additionalStructuralAnchors?: string[];
  }): Promise<RetrievalPhaseResult[]> {
    const phases = opts.semanticCfg?.config?.hybridPhases ?? [];
    const results: RetrievalPhaseResult[] = [];

    const variants =
      Array.isArray(opts.queryVariants) && opts.queryVariants.length
        ? opts.queryVariants
        : [
            {
              text: "",
              weight: 1,
              sourceRuleId: "base_query",
              reason: "default",
            },
          ];
    const perCallTimeoutMs = Math.max(
      1000,
      Math.floor(
        safeNumber(process.env.RETRIEVAL_PHASE_CALL_TIMEOUT_MS, 8000),
      ),
    );
    const totalPhaseBudgetMs = Math.max(
      3000,
      Math.floor(safeNumber(process.env.RETRIEVAL_PHASE_BUDGET_MS, 25000)),
    );
    const extraVariantStrategy = String(
      process.env.RETRIEVAL_EXTRA_VARIANT_PHASES || "semantic_and_lexical",
    )
      .trim()
      .toLowerCase();
    const runWithTimeout = async <T>(
      operation: Promise<T>,
      fallback: T,
      label: string,
    ): Promise<{
      output: T;
      status: "ok" | "failed" | "timed_out";
      note?: string;
    }> => {
      let timer: NodeJS.Timeout | null = null;
      const guarded = operation
        .then((value) => ({
          output: value,
          status: "ok" as const,
        }))
        .catch((err) => {
          const errorMessage =
            err instanceof Error ? err.message : String(err || "unknown_error");
          logger.warn("[retrieval-engine] retrieval phase failed", {
            label,
            error: errorMessage,
          });
          return {
            output: fallback,
            status: "failed" as const,
            note: `${label} failed: ${errorMessage}`,
          };
        });
      const timed = new Promise<{
        output: T;
        status: "ok" | "failed" | "timed_out";
        note?: string;
      }>((resolve) => {
        timer = setTimeout(() => {
          logger.warn("[retrieval-engine] retrieval phase timed out", {
            label,
            timeoutMs: perCallTimeoutMs,
          });
          resolve({
            output: fallback,
            status: "timed_out",
            note: `${label} timed out after ${perCallTimeoutMs}ms`,
          });
        }, perCallTimeoutMs);
      });
      const output = await Promise.race([guarded, timed]);
      if (timer) clearTimeout(timer);
      return output;
    };
    const retrievalStartedAt = Date.now();

    for (let variantIdx = 0; variantIdx < variants.length; variantIdx += 1) {
      const variant = variants[variantIdx];
      const isBaseVariant =
        variantIdx === 0 || variant.sourceRuleId === "base_query";

      if (Date.now() - retrievalStartedAt >= totalPhaseBudgetMs) {
        return results;
      }

      // Build phase tasks, then run them in parallel within each variant.
      const normalizeHits = (
        rawHits: unknown[],
        weight: number,
      ): Array<Record<string, unknown>> =>
        rawHits.map((hit) => {
          const normalizedHit =
            hit && typeof hit === "object"
              ? (hit as Record<string, unknown>)
              : {};
          return {
            ...normalizedHit,
            score: clamp01(
              safeNumber(normalizedHit.score, 0) * weight,
            ),
          };
        });

      type PhaseTask = {
        promise: Promise<{ output: unknown[]; status: "ok" | "failed" | "timed_out"; note?: string }>;
        phaseId: string;
        source: CandidateSource;
        timedOutCode: string;
        failedCode: string;
      };
      const phaseTasks: PhaseTask[] = [];

      for (const phase of phases) {
        if (!phase?.enabled) continue;
        if (
          !isBaseVariant &&
          extraVariantStrategy !== "all" &&
          !(extraVariantStrategy === "semantic_and_lexical" &&
            (phase.type === "semantic" || phase.type === "lexical")) &&
          phase.type !== "semantic"
        ) {
          continue;
        }

        if (phase.type === "semantic") {
          const k = safeNumber(phase.k, 80);
          phaseTasks.push({
            promise: runWithTimeout<unknown[]>(
              this.semanticIndex.search({
                query: variant.text,
                docIds: opts.scopeDocIds,
                k,
              }),
              [],
              "semantic_search",
            ),
            phaseId: `${phase.id ?? "phase_semantic"}::${variant.sourceRuleId}`,
            source: "semantic" as CandidateSource,
            timedOutCode: "semantic_search_timed_out",
            failedCode: "semantic_search_failed",
          });
        } else if (phase.type === "lexical") {
          const k = safeNumber(phase.k, 120);
          phaseTasks.push({
            promise: runWithTimeout<unknown[]>(
              this.lexicalIndex.search({
                query: variant.text,
                docIds: opts.scopeDocIds,
                k,
              }),
              [],
              "lexical_search",
            ),
            phaseId: `${phase.id ?? "phase_lexical"}::${variant.sourceRuleId}`,
            source: "lexical" as CandidateSource,
            timedOutCode: "lexical_search_timed_out",
            failedCode: "lexical_search_failed",
          });
        } else if (phase.type === "structural") {
          const k = safeNumber(phase.k, 60);
          const phaseAnchors = Array.isArray(phase.anchors)
            ? phase.anchors
            : ["headings", "table_headers"];
          const anchors = Array.from(
            new Set([
              ...phaseAnchors,
              ...(Array.isArray(opts.additionalStructuralAnchors)
                ? opts.additionalStructuralAnchors
                : []),
            ]),
          ).slice(0, 24);
          phaseTasks.push({
            promise: runWithTimeout<unknown[]>(
              this.structuralIndex.search({
                query: variant.text,
                docIds: opts.scopeDocIds,
                k,
                anchors,
              }),
              [],
              "structural_search",
            ),
            phaseId: `${phase.id ?? "phase_structural"}::${variant.sourceRuleId}`,
            source: "structural" as CandidateSource,
            timedOutCode: "structural_search_timed_out",
            failedCode: "structural_search_failed",
          });
        }
      }

      // Run all phases for this variant in parallel.
      const settled = await Promise.all(
        phaseTasks.map((t) => t.promise),
      );

      for (let pi = 0; pi < phaseTasks.length; pi++) {
        const task = phaseTasks[pi];
        const phaseResult = settled[pi];
        results.push({
          phaseId: task.phaseId,
          source: task.source,
          status: phaseResult.status,
          failureCode:
            phaseResult.status === "ok"
              ? undefined
              : phaseResult.status === "timed_out"
                ? task.timedOutCode
                : task.failedCode,
          note: phaseResult.note,
          hits: normalizeHits(phaseResult.output, variant.weight),
        });
      }
    }

    return results;
  }

  private mergePhaseCandidates(
    phaseResults: RetrievalPhaseResult[],
    scope: {
      candidateDocIds: string[];
      hardScopeActive: boolean;
      sheetName?: string | null;
      rangeA1?: string | null;
    },
    req: RetrievalRequest,
  ): CandidateChunk[] {
    const out: CandidateChunk[] = [];
    const seen = new Map<string, CandidateChunk>();

    for (const phase of phaseResults) {
      for (let i = 0; i < phase.hits.length; i++) {
        const hit = phase.hits[i] as Record<string, any>;
        const docId = String(hit.docId);
        const score = clamp01(safeNumber(hit.score, 0));
        const loc: ChunkLocation = hit.location ?? {};
        const locationKey =
          hit.locationKey ??
          stableLocationKey(
            docId,
            loc,
            String(hit.chunkId ?? `${phase.phaseId}:${i}`),
          );
        const candidateId = String(
          hit.chunkId ??
            sha256(
              `${phase.source}|${docId}|${locationKey}|${hit.snippet ?? ""}`,
            ).slice(0, 16),
        );

        const dedupeKey = `${docId}|${locationKey}|${candidateId}`;
        const existing = seen.get(dedupeKey);
        if (existing) {
          if (phase.source === "semantic") {
            existing.scores.semantic = Math.max(
              existing.scores.semantic ?? 0,
              score,
            );
          } else if (phase.source === "lexical") {
            existing.scores.lexical = Math.max(
              existing.scores.lexical ?? 0,
              score,
            );
          } else if (phase.source === "structural") {
            existing.scores.structural = Math.max(
              existing.scores.structural ?? 0,
              score,
            );
            existing.signals.isAnchorMatch = true;
          }
          if ((hit.snippet ?? "").length > (existing.snippet ?? "").length) {
            existing.snippet = String(hit.snippet ?? "").trim();
          }
          continue;
        }

        const tablePayload = this.extractTablePayload(hit, req);
        const inferredType: CandidateType = tablePayload ? "table" : "text";
        const snippet = this.resolveCandidateSnippet(
          String(hit.snippet ?? "").trim(),
          tablePayload,
        );
        // Minimal provenance requirement: docId + (location OR stable locationKey) + snippet
        const provenanceOk = Boolean(docId && locationKey && snippet);

        const candidate: CandidateChunk = {
          candidateId,
          type: inferredType,
          source: phase.source,

          docId,
          docType:
            this.normalizeDocType(
              (hit as Record<string, any>).docType ??
                (hit as Record<string, any>).documentType ??
                (hit as Record<string, any>).mimeType,
            ) ?? null,
          title: hit.title ?? null,
          filename: hit.filename ?? null,

          location: loc,
          locationKey,

          snippet,
          rawText: null,
          table: tablePayload,

          scores: {
            semantic: phase.source === "semantic" ? score : 0,
            lexical: phase.source === "lexical" ? score : 0,
            structural: phase.source === "structural" ? score : 0,
            penalties: 0,
            final: 0,
          },

          signals: {
            isScopedMatch: scope.hardScopeActive,
            isAnchorMatch: phase.source === "structural",
            tableValidated: tablePayload
              ? !tablePayload?.warnings?.length
              : false,
          },

          provenanceOk,
        };
        seen.set(dedupeKey, candidate);
        out.push(candidate);
      }
    }

    return out;
  }

  private resolveCandidateSnippet(
    snippet: string,
    tablePayload: CandidateChunk["table"],
  ): string {
    const cleanSnippet = String(snippet || "").trim();
    if (cleanSnippet) return cleanSnippet;
    if (!tablePayload) return "";
    const header = Array.isArray(tablePayload.header)
      ? tablePayload.header
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      : [];
    const firstRow = Array.isArray(tablePayload.rows?.[0])
      ? tablePayload.rows?.[0]
          ?.map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [];
    const pieces = [header.join(" | "), firstRow.join(" | ")]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return pieces.join(" || ").trim();
  }

  private extractTablePayload(
    hit: any,
    req: RetrievalRequest,
  ): CandidateChunk["table"] {
    // Read cap from table_render_policy bank, default 140
    let maxRows = 140;
    try {
      const trp = this.safeGetBank<any>("table_render_policy");
      maxRows = safeNumber(trp?.config?.maxRowsPerChunk, 140);
    } catch { /* bank may not exist; use default */ }

    const explicitTable = hit?.table;
    if (explicitTable && typeof explicitTable === "object") {
      const header = Array.isArray(explicitTable.header)
        ? explicitTable.header
            .map((value: unknown) => String(value ?? "").trim())
            .filter(Boolean)
        : [];

      const rows = Array.isArray(explicitTable.rows)
        ? explicitTable.rows
            .filter((row: unknown) => Array.isArray(row))
            .slice(0, maxRows)
            .map((row: any[]) =>
              row.map((value) =>
                value == null
                  ? null
                  : typeof value === "number"
                    ? value
                    : String(value),
              ),
            )
        : [];
      if (header.length || rows.length) {
        return {
          header,
          rows,
          structureScore: clamp01(
            safeNumber(explicitTable.structureScore, 0.9),
          ),
          numericIntegrityScore: clamp01(
            safeNumber(explicitTable.numericIntegrityScore, 0.9),
          ),
          warnings: Array.isArray(explicitTable.warnings)
            ? explicitTable.warnings
                .map((value: unknown) => String(value || "").trim())
                .filter(Boolean)
            : undefined,
        };
      }
    }

    const tableExpected = Boolean(
      req.signals.tableExpected || req.signals.userAskedForTable,
    );
    const snippet = String(hit?.snippet || "").trim();
    if (!tableExpected || !snippet) return null;
    const lines = snippet
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;
    // Only use pipe or tab delimiters — comma is too noisy (conflicts with
    // numeric formatting like "$1,250") and produces false-positive tables.
    const delimiter = lines.some((line) => line.includes("|"))
      ? "|"
      : lines.some((line) => line.includes("\t"))
        ? "\t"
        : "";
    if (!delimiter) return null;

    const parsed = lines
      .map((line) =>
        line
          .split(delimiter)
          .map((value) => value.trim())
          .filter(Boolean),
      )
      .filter((cells) => cells.length >= 2);
    if (parsed.length < 2) return null;
    const header = parsed[0];
    const rows = parsed.slice(1, maxRows + 1).map((row) =>
      row.map((cell) => {
        // Preserve cells that contain unit indicators (currency, percent, etc.)
        const hasUnitIndicator = /[$%€£¥R\$]/.test(cell);
        if (hasUnitIndicator) return cell;
        const stripped = cell.replace(/,/g, "");
        const numeric = Number(stripped);
        if (Number.isFinite(numeric) && cell.match(/[0-9]/)) return numeric;
        return cell;
      }),
    );
    return {
      header,
      rows,
      structureScore: 0.65,
      numericIntegrityScore: 0.6,
      warnings: ["heuristic_table_from_snippet"],
    };
  }

  // -----------------------------
  // Negatives
  // -----------------------------

  private static looksLikeTOC(snippet: string): boolean {
    if (!snippet || snippet.length < 50) return false;
    const lines = snippet.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) return false;

    // Heuristic 1: High ratio of short lines ending with page numbers
    const shortWithPageNum = lines.filter(
      l => l.length < 80 && /\b\d{1,4}\s*$/.test(l),
    ).length;
    if (shortWithPageNum / lines.length > 0.5) return true;

    // Heuristic 2: High ratio of numbered-section lines (1. 1.1 Sec. Chapter)
    const numberedSections = lines.filter(
      l => /^(?:\d+(?:\.\d+)*\.?\s|(?:Sec(?:tion|\.)|Chapter|Art(?:icle|\.)|Part)\s)/i.test(l),
    ).length;
    if (numberedSections / lines.length > 0.6 && lines.length >= 5) return true;

    // Heuristic 3: Dot-leader lines (Table of Contents formatting)
    const dotLeaders = lines.filter(l => /\.{3,}|_{3,}|-{5,}/.test(l)).length;
    if (dotLeaders / lines.length > 0.3) return true;

    return false;
  }

  private applyRetrievalNegatives(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    scope: {
      candidateDocIds: string[];
      hardScopeActive: boolean;
      sheetName?: string | null;
      rangeA1?: string | null;
    },
    negativesBank: Record<string, any> | null,
    scopeMetrics?: RetrievalScopeMetrics,
  ): CandidateChunk[] {
    if (!negativesBank?.config?.enabled) return candidates;

    const cfg = negativesBank.config;
    const minRelevanceCfg = safeNumber(
      cfg?.actionsContract?.thresholds?.minRelevanceScore,
      0.55,
    );
    // In encrypted mode, semantic scores are systematically lower because
    // lexical/structural channels are dead.  Lower the relevance floor so
    // valid evidence isn't dropped before ranking.
    const minRelevance = this.isEncryptedOnlyMode()
      ? Math.min(minRelevanceCfg, 0.10)
      : minRelevanceCfg;

    const scopeEnforced = this.shouldEnforceScopedDocSet(scope, signals);
    const allowedDocSet = scopeEnforced ? new Set(scope.candidateDocIds) : null;

    // Slot extraction: precompute role anchors for confusion penalty
    const slotContract = signals.slotContract;
    const isExtraction = Boolean(signals.isExtractionQuery && slotContract);
    let targetAnchors: string[] = [];
    let forbiddenAnchorsFlat: string[] = [];
    let confusionPenaltyDefault = 0.25;

    if (isExtraction && slotContract) {
      targetAnchors = (slotContract.anchorLabels || []).map((a) =>
        a.toLowerCase(),
      );
      // Load ontology for broader anchor coverage
      const ontology = this.safeGetBank<Record<string, any>>("entity_role_ontology");
      if (ontology?.roles) {
        for (const forbiddenRoleId of slotContract.forbidden) {
          const role = ontology.roles.find(
            (r: any) => r.id === forbiddenRoleId,
          );
          if (role?.anchors) {
            const anchors =
              role.anchors[req.query ? "en" : "en"] ?? role.anchors["en"] ?? [];
            for (const a of anchors) {
              const lower = a.toLowerCase();
              if (!forbiddenAnchorsFlat.includes(lower)) {
                forbiddenAnchorsFlat.push(lower);
              }
            }
          }
        }
      }
      // Ranker config for slot extraction penalties
      const rankerCfg = this.safeGetBank<Record<string, any>>("retrieval_ranker_config");
      confusionPenaltyDefault = safeNumber(
        rankerCfg?.config?.slotExtraction?.forbiddenRolePenalty,
        0.25,
      );
    }

    const out: CandidateChunk[] = [];
    for (const c of candidates) {
      if (allowedDocSet && !allowedDocSet.has(c.docId)) {
        c.signals.scopeViolation = true;
        if (scopeMetrics) {
          scopeMetrics.scopeCandidatesDropped += 1;
        }
        continue;
      }

      // Soft/Hard: low relevance chunk exclusion
      // When hard scope is active (user attached specific docs), use a much
      // lower minRelevance threshold. The user explicitly chose these docs,
      // so we should let more of their content through to the LLM rather
      // than filtering aggressively on keyword-overlap relevance scores.
      const isInScope = allowedDocSet && allowedDocSet.has(c.docId);
      const effectiveMinRelevance = isInScope
        ? Math.min(minRelevance, 0.05)
        : minRelevance;
      const topScore = Math.max(
        c.scores.semantic ?? 0,
        c.scores.lexical ?? 0,
        c.scores.structural ?? 0,
      );
      if (topScore < effectiveMinRelevance) {
        c.signals.lowRelevanceChunk = true;
        continue;
      }

      // Slot extraction: role-confusion penalty
      if (isExtraction && slotContract) {
        const snippetLower = (c.snippet ?? "").toLowerCase();
        const hasTarget = targetAnchors.some((a) => snippetLower.includes(a));
        const hasForbidden = forbiddenAnchorsFlat.some((a) =>
          snippetLower.includes(a),
        );

        if (hasForbidden && !hasTarget) {
          // Apply confusion penalty — keep chunk but penalize score
          c.scores.penalties = clamp01(
            (c.scores.penalties ?? 0) + confusionPenaltyDefault,
          );
        } else if (hasTarget) {
          // Boost chunks containing target role anchors
          const rankerCfg = this.safeGetBank<Record<string, any>>("retrieval_ranker_config");
          const anchorBoost = safeNumber(
            rankerCfg?.config?.slotExtraction?.roleAnchorBoost,
            0.15,
          );
          c.scores.keywordBoost = clamp01(
            (c.scores.keywordBoost ?? 0) + anchorBoost,
          );
        }
      }

      // TOC-like content penalty — soft penalty, not a hard block
      if (RetrievalEngineService.looksLikeTOC(c.snippet ?? "")) {
        c.scores.final = ((c.scores.final ?? 0) * 0.45);
        c.signals.tocCandidate = true;
      }

      out.push(c);
    }

    return out;
  }

  // -----------------------------
  // Boosts
  // -----------------------------

  private applyBoosts(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    banks: {
      boostsKeyword: Record<string, any> | null;
      boostsTitle: Record<string, any> | null;
      boostsType: Record<string, any> | null;
      boostsRecency: Record<string, any> | null;
    },
    docMetaById?: Map<string, DocMeta>,
  ): CandidateChunk[] {
    // Apply boosts as additive components with caps (final ranker may re-cap).
    const query = String(req.query || "").toLowerCase();
    const queryTokens = this.simpleTokens(query).filter(
      (token) => token.length >= 2,
    );

    const keywordCfg = banks.boostsKeyword?.config || {};
    const keywordCap = safeNumber(
      keywordCfg.actionsContract?.combination?.capMaxBoost ??
        keywordCfg.actionsContract?.thresholds?.maxTotalBoost,
      0.25,
    );
    const keywordBodyWeight = safeNumber(
      keywordCfg.regionWeights?.body ?? keywordCfg.regionWeights?.body_text,
      0.02,
    );
    const keywordTitleWeight = safeNumber(
      keywordCfg.regionWeights?.doc_title,
      0.08,
    );
    const keywordHeadingWeight = safeNumber(
      keywordCfg.regionWeights?.section_heading,
      0.06,
    );
    const genericTerms = new Set(
      [
        ...(keywordCfg.genericTermGuard?.terms?.en || []),
        ...(keywordCfg.genericTermGuard?.terms?.pt || []),
        ...(keywordCfg.genericTermGuard?.terms?.es || []),
      ]
        .map((token: unknown) =>
          String(token || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const genericPenalty = safeNumber(
      keywordCfg.genericTermGuard?.penalty ??
        keywordCfg.actionsContract?.thresholds?.genericTermPenaltyThreshold,
      0.08,
    );

    const titleCfg = banks.boostsTitle?.config || {};
    const titleWeights = titleCfg.boostWeights || {};
    const titleCap = safeNumber(
      titleCfg.actionsContract?.combination?.capMaxBoost ??
        titleCfg.actionsContract?.thresholds?.maxTotalTitleBoost,
      0.15,
    );
    const titleMinOverlapRatio = safeNumber(
      titleCfg.actionsContract?.thresholds?.minOverlapRatioForPartial,
      0.55,
    );
    const titleMinTokens = Math.max(
      1,
      Math.floor(
        safeNumber(
          titleCfg.actionsContract?.thresholds?.minTokensForPartial,
          2,
        ),
      ),
    );

    const typeCfg = banks.boostsType?.config || {};
    const typeCap = safeNumber(
      typeCfg.actionsContract?.thresholds?.maxTotalTypeBoost,
      0.12,
    );
    const expectedTypeTags = this.resolveExpectedTypeTags(signals, query);

    const recencyCfg = banks.boostsRecency?.config || {};
    const recencyThresholds = recencyCfg.actionsContract?.thresholds || {};
    const recencyWeights = recencyCfg.recencyWeights || {};
    const recencyCap = safeNumber(recencyThresholds.maxTotalRecencyBoost, 0.08);
    const disableRecencyForDocLock =
      recencyCfg.neverOverrideExplicitDocLock !== false &&
      Boolean(signals.explicitDocLock || signals.singleDocIntent);
    const disableRecencyForExplicitTimeWindow =
      Boolean(signals.explicitYearOrQuarterComparison) &&
      recencyCfg.timeFilterGuards
        ?.disableWhenExplicitYearOrQuarterComparison !== false;
    const recencyScale =
      Boolean(signals.timeConstraintsPresent) &&
      recencyCfg.timeFilterGuards?.enabled !== false
        ? clamp01(
            safeNumber(
              recencyCfg.timeFilterGuards
                ?.reduceFactorWhenTimeConstraintsPresent,
              0.5,
            ),
          )
        : 1;

    for (const c of candidates) {
      // Keyword boost (approximation): if query tokens appear in snippet, treat as body_text match.
      if (banks.boostsKeyword?.config?.enabled) {
        const snippet = String(c.snippet || "").toLowerCase();
        const title = String(c.title || "").toLowerCase();
        const section = String(c.location?.sectionKey || "").toLowerCase();
        let genericHits = 0;
        let specificHits = 0;
        let boost = 0;
        for (const token of queryTokens) {
          if (
            !snippet.includes(token) &&
            !title.includes(token) &&
            !section.includes(token)
          ) {
            continue;
          }
          const isGeneric = genericTerms.has(token);
          if (isGeneric) genericHits += 1;
          else specificHits += 1;
          if (title.includes(token)) boost += keywordTitleWeight;
          else if (section.includes(token)) boost += keywordHeadingWeight;
          else boost += keywordBodyWeight;
        }
        if (genericHits > 0 && specificHits === 0) {
          c.scores.penalties = clamp01(
            (c.scores.penalties ?? 0) + genericPenalty,
          );
          boost = Math.max(0, boost - genericPenalty);
        }
        c.scores.keywordBoost = clamp01(Math.min(keywordCap, boost));
      }

      // Title boost (approx): if active doc matches / explicit filename, boost strongly
      if (banks.boostsTitle?.config?.enabled) {
        let b = 0;
        if (
          signals.explicitDocRef &&
          signals.resolvedDocId &&
          c.docId === signals.resolvedDocId
        )
          b += safeNumber(titleWeights.exact_filename, 0.12);
        if (signals.activeDocId && c.docId === signals.activeDocId) {
          b += safeNumber(titleWeights.high_overlap, 0.1) * 0.6;
        }

        const titleTokens = this.simpleTokens(
          `${String(c.title || "")} ${String(c.filename || "")}`,
        );
        const overlap = this.computeTokenOverlap(queryTokens, titleTokens);
        const genericOnlyRef = this.isGenericDocReferenceQuery(query, titleCfg);
        if (!genericOnlyRef) {
          if (
            overlap.overlapCount >= titleMinTokens &&
            overlap.overlapRatio >= 0.7
          ) {
            b += safeNumber(titleWeights.high_overlap, 0.1);
          } else if (
            overlap.overlapCount >= titleMinTokens &&
            overlap.overlapRatio >= titleMinOverlapRatio
          ) {
            b += safeNumber(titleWeights.partial, 0.07);
          }
        }
        c.scores.titleBoost = clamp01(Math.min(titleCap, b));
      }

      // Type boost (very light): apply if query hints spreadsheet/pdf, etc. (we only know via signals)
      if (banks.boostsType?.config?.enabled) {
        const candidateType = this.resolveCandidateTypeTag(c);
        let b = 0;
        if (candidateType && expectedTypeTags.has(candidateType)) {
          b += safeNumber(typeCfg.typeWeights?.[candidateType], 0.06);
        }
        c.scores.typeBoost = clamp01(Math.min(typeCap, b));
      }

      // Recency boost: requires doc metadata; apply lightly; reduce if time constraints present
      if (
        banks.boostsRecency?.config?.enabled &&
        !disableRecencyForDocLock &&
        !disableRecencyForExplicitTimeWindow
      ) {
        const docMeta = docMetaById?.get(c.docId);
        const ageDays = this.resolveDocAgeDays(docMeta);
        if (ageDays == null) {
          c.scores.recencyBoost = 0;
        } else {
          let recencyBoost = 0;
          if (ageDays <= safeNumber(recencyThresholds.recentDaysStrong, 7)) {
            recencyBoost = safeNumber(recencyWeights.strong, 0.05);
          } else if (
            ageDays <= safeNumber(recencyThresholds.recentDaysMedium, 30)
          ) {
            recencyBoost = safeNumber(recencyWeights.medium, 0.03);
          } else if (
            ageDays <= safeNumber(recencyThresholds.recentDaysLight, 90)
          ) {
            recencyBoost = safeNumber(recencyWeights.light, 0.015);
          }
          recencyBoost *= recencyScale;
          c.scores.recencyBoost = clamp01(Math.min(recencyCap, recencyBoost));
        }
      } else {
        c.scores.recencyBoost = 0;
      }
    }

    return candidates;
  }

  private computeTokenOverlap(
    queryTokens: string[],
    targetTokens: string[],
  ): { overlapCount: number; overlapRatio: number } {
    if (!queryTokens.length || !targetTokens.length) {
      return { overlapCount: 0, overlapRatio: 0 };
    }
    const targetSet = new Set(targetTokens.map((token) => token.toLowerCase()));
    const overlapCount = queryTokens.filter((token) =>
      targetSet.has(token),
    ).length;
    const overlapRatio = overlapCount / Math.max(1, queryTokens.length);
    return { overlapCount, overlapRatio };
  }

  private isGenericDocReferenceQuery(query: string, titleCfg: any): boolean {
    const clean = String(query || "")
      .trim()
      .toLowerCase();
    if (!clean) return false;
    const patterns = [
      ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.en)
        ? titleCfg.genericDocRefGuard.patterns.en
        : []),
      ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.pt)
        ? titleCfg.genericDocRefGuard.patterns.pt
        : []),
      ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.es)
        ? titleCfg.genericDocRefGuard.patterns.es
        : []),
    ]
      .map((pattern: unknown) => String(pattern || "").trim())
      .filter(Boolean);
    return patterns.some((pattern) => this.regexMatches(clean, pattern));
  }

  private resolveCandidateTypeTag(candidate: CandidateChunk): string | null {
    const filename = String(candidate.filename || "").toLowerCase();
    const docType = String(candidate.docType || "").toLowerCase();
    const raw = `${filename} ${docType}`;
    if (/\b(pdf|application\/pdf)\b/.test(raw)) return "pdf";
    if (/\b(xlsx|xls|csv|spreadsheet|sheet)\b/.test(raw)) return "spreadsheet";
    if (/\b(ppt|pptx|slide|presentation)\b/.test(raw)) return "slides";
    if (/\b(png|jpg|jpeg|webp|gif|image)\b/.test(raw)) return "image";
    if (/\b(txt|text|doc|docx)\b/.test(raw)) return "text";
    return null;
  }

  private applyRetrievalPlanHints(
    candidates: CandidateChunk[],
    retrievalPlan?: Partial<RetrievalPlan> | null,
  ): CandidateChunk[] {
    if (!retrievalPlan) return candidates;

    const requiredTerms = this.normalizePlanHintTerms(
      retrievalPlan.requiredTerms,
      10,
    );
    const excludedTerms = this.normalizePlanHintTerms(
      retrievalPlan.excludedTerms,
      10,
    );
    const docTypePreferences = this.normalizePlanHintTerms(
      retrievalPlan.docTypePreferences,
      4,
    );
    const locationTargets = Array.isArray(retrievalPlan.locationTargets)
      ? retrievalPlan.locationTargets
          .map((target) => {
            const rawType = String((target as Record<string, any>)?.type || "")
              .trim()
              .toLowerCase();
            const rawValue = String((target as Record<string, any>)?.value || "")
              .trim()
              .toLowerCase();
            if (!rawType || !rawValue) return null;
            return { type: rawType, value: rawValue };
          })
          .filter(
            (target): target is { type: string; value: string } =>
              target !== null,
          )
          .slice(0, 8)
      : [];

    const entities = this.normalizePlanHintTerms(
      retrievalPlan.entities,
      8,
    );
    const metrics = this.normalizePlanHintTerms(
      retrievalPlan.metrics,
      8,
    );
    const timeHints = this.normalizePlanHintTerms(
      retrievalPlan.timeHints,
      3,
    );

    if (
      requiredTerms.length === 0 &&
      excludedTerms.length === 0 &&
      docTypePreferences.length === 0 &&
      locationTargets.length === 0 &&
      entities.length === 0 &&
      metrics.length === 0 &&
      timeHints.length === 0
    ) {
      return candidates;
    }

    for (const candidate of candidates) {
      const searchable = this.buildSearchableTextForPlannerHint(candidate);
      if (requiredTerms.length > 0) {
        const requiredHits = requiredTerms.filter((term) =>
          searchable.includes(term),
        ).length;
        if (requiredHits > 0) {
          candidate.scores.keywordBoost = clamp01(
            (candidate.scores.keywordBoost ?? 0) +
              Math.min(0.18, requiredHits * 0.05),
          );
        } else {
          candidate.scores.penalties = clamp01(
            (candidate.scores.penalties ?? 0) + 0.06,
          );
        }
      }

      if (excludedTerms.length > 0) {
        const excludedHits = excludedTerms.filter((term) =>
          searchable.includes(term),
        ).length;
        if (excludedHits > 0) {
          candidate.scores.penalties = clamp01(
            (candidate.scores.penalties ?? 0) +
              Math.min(0.28, excludedHits * 0.1),
          );
        }
      }

      if (docTypePreferences.length > 0) {
        const docType = this.normalizeDocType(candidate.docType);
        if (docType && docTypePreferences.includes(docType)) {
          candidate.scores.typeBoost = clamp01(
            (candidate.scores.typeBoost ?? 0) + 0.08,
          );
        }
      }

      if (locationTargets.length > 0) {
        const hit = locationTargets.some((target) =>
          this.matchesPlannerLocationTarget(candidate, target),
        );
        if (hit) {
          candidate.scores.keywordBoost = clamp01(
            (candidate.scores.keywordBoost ?? 0) + 0.07,
          );
        }
      }

      if (entities.length > 0) {
        const entityHits = entities.filter((entity) =>
          searchable.includes(entity),
        ).length;
        if (entityHits > 0) {
          candidate.scores.keywordBoost = clamp01(
            (candidate.scores.keywordBoost ?? 0) +
              Math.min(0.12, entityHits * 0.04),
          );
        }
      }

      if (metrics.length > 0) {
        const hasDigit = /\d/.test(searchable);
        for (const metric of metrics) {
          if (searchable.includes(metric)) {
            candidate.scores.keywordBoost = clamp01(
              (candidate.scores.keywordBoost ?? 0) +
                (hasDigit ? 0.06 : 0.02),
            );
            break;
          }
        }
      }

      if (timeHints.length > 0) {
        const timeHit = timeHints.some((hint) =>
          searchable.includes(hint),
        );
        if (timeHit) {
          candidate.scores.keywordBoost = clamp01(
            (candidate.scores.keywordBoost ?? 0) + 0.05,
          );
        } else {
          candidate.scores.penalties = clamp01(
            (candidate.scores.penalties ?? 0) + 0.03,
          );
        }
      }
    }

    return candidates;
  }

  private normalizePlanHintTerms(values: unknown, maxItems: number): string[] {
    if (!Array.isArray(values)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      const normalized = String(value || "")
        .trim()
        .toLowerCase();
      if (!normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  private buildSearchableTextForPlannerHint(candidate: CandidateChunk): string {
    const parts = [
      candidate.snippet,
      candidate.rawText,
      candidate.title,
      candidate.filename,
      candidate.docType,
      candidate.location.sectionKey,
      candidate.location.sheet,
      candidate.location.page != null ? `page ${candidate.location.page}` : "",
      candidate.location.slide != null
        ? `slide ${candidate.location.slide}`
        : "",
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return parts.join(" ");
  }

  private matchesPlannerLocationTarget(
    candidate: CandidateChunk,
    target: { type: string; value: string },
  ): boolean {
    if (!target.value) return false;
    if (target.type === "sheet") {
      return String(candidate.location.sheet || "")
        .trim()
        .toLowerCase()
        .includes(target.value);
    }
    if (target.type === "section") {
      return String(candidate.location.sectionKey || "")
        .trim()
        .toLowerCase()
        .includes(target.value);
    }
    if (target.type === "page") {
      return String(candidate.location.page ?? "").trim() === target.value;
    }
    if (target.type === "slide") {
      return String(candidate.location.slide ?? "").trim() === target.value;
    }
    if (target.type === "cell" || target.type === "range") {
      return String(candidate.snippet || "")
        .trim()
        .toLowerCase()
        .includes(target.value);
    }
    return this.buildSearchableTextForPlannerHint(candidate).includes(
      target.value,
    );
  }

  private resolveExpectedTypeTags(
    signals: RetrievalRequest["signals"],
    queryLower: string,
  ): Set<string> {
    const expected = new Set<string>();
    if (signals.rangeExplicit || signals.sheetHintPresent) {
      expected.add("spreadsheet");
    }
    if (signals.userAskedForQuote) {
      expected.add("pdf");
      expected.add("text");
    }
    if (signals.userAskedForTable || signals.tableExpected) {
      expected.add("spreadsheet");
    }
    if (
      /\b(sheet|tab|xlsx|csv|range|aba|planilha|hoja|rango)\b/.test(queryLower)
    ) {
      expected.add("spreadsheet");
    }
    if (/\b(page|pdf|section|página|pagina|seção|seccion)\b/.test(queryLower)) {
      expected.add("pdf");
    }
    if (
      /\b(slide|deck|pptx|diapositiva|apresentação|presentacion)\b/.test(
        queryLower,
      )
    ) {
      expected.add("slides");
    }
    if (
      /\b(image|photo|screenshot|ocr|png|jpg|jpeg|imagem|foto|captura|imagen)\b/.test(
        queryLower,
      )
    ) {
      expected.add("image");
    }
    return expected;
  }

  private resolveDocAgeDays(docMeta: DocMeta | undefined): number | null {
    if (!docMeta) return null;
    const rawTimestamp = docMeta.updatedAt || docMeta.createdAt || null;
    if (!rawTimestamp) return null;
    const ts = Date.parse(String(rawTimestamp));
    if (!Number.isFinite(ts)) return null;
    const ageMs = Date.now() - ts;
    if (!Number.isFinite(ageMs)) return null;
    return Math.max(0, ageMs / (1000 * 60 * 60 * 24));
  }

  // -----------------------------
  // Ranking
  // -----------------------------

  private rankCandidates(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    rankerCfg: Record<string, any>,
    routingPriorityBank?: Record<string, any>,
  ): CandidateChunk[] {
    const cfg = rankerCfg?.config;
    let weights = cfg?.weights ?? {
      semantic: 0.52,
      lexical: 0.22,
      structural: 0.14,
      titleBoost: 0.06,
      documentIntelligenceBoost: 0.08,
      routingPriorityBoost: 0.04,
      typeBoost: 0.03,
      recencyBoost: 0.03,
    };

    // In encrypted mode, lexical and structural always return 0.
    // Redistribute their weight to semantic so scores aren't artificially capped.
    if (this.isEncryptedOnlyMode()) {
      const deadWeight = (weights.lexical ?? 0) + (weights.structural ?? 0);
      weights = { ...weights, semantic: (weights.semantic ?? 0) + deadWeight, lexical: 0, structural: 0 };
    }

    const familyPriorityBoost = this.resolveIntentFamilyPriorityBoost(
      signals.intentFamily,
      routingPriorityBank,
    );
    for (const c of candidates) {
      const semantic = clamp01(c.scores.semantic ?? 0);
      const lexical = clamp01(c.scores.lexical ?? 0);
      const structural = clamp01(c.scores.structural ?? 0);

      const titleBoost = clamp01(
        (c.scores.titleBoost ?? 0) + (c.scores.keywordBoost ?? 0) * 0.5,
      );
      const documentIntelligenceBoost = clamp01(
        c.scores.documentIntelligenceBoost ?? 0,
      );
      const routingPriorityBoost = clamp01(
        familyPriorityBoost +
          this.resolveSourceAffinityBoost(signals.intentFamily, c.source),
      );
      c.scores.routingPriorityBoost = routingPriorityBoost;
      const typeBoost = clamp01(c.scores.typeBoost ?? 0);
      const recencyBoost = clamp01(c.scores.recencyBoost ?? 0);

      const penalties = clamp01(c.scores.penalties ?? 0);

      let final =
        weights.semantic * semantic +
        weights.lexical * lexical +
        weights.structural * structural +
        weights.titleBoost * titleBoost +
        safeNumber(weights.documentIntelligenceBoost, 0.08) *
          documentIntelligenceBoost +
        safeNumber(weights.routingPriorityBoost, 0.04) * routingPriorityBoost +
        weights.typeBoost * typeBoost +
        weights.recencyBoost * recencyBoost -
        penalties;

      final = clamp01(final);

      // If below minFinal, keep but mark; packaging may filter further.
      c.scores.final = final;
    }

    // Stable sort: final desc, docId asc, locationKey asc, candidateId asc
    candidates.sort((a, b) => {
      const fa = a.scores.final ?? 0;
      const fb = b.scores.final ?? 0;
      if (fb !== fa) return fb - fa;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.candidateId.localeCompare(b.candidateId);
    });

    return candidates;
  }

  private resolveIntentFamilyPriorityBoost(
    intentFamily: string | null | undefined,
    routingPriorityBank?: Record<string, any>,
  ): number {
    if (!routingPriorityBank?.config?.enabled) return 0;
    const priorities =
      routingPriorityBank?.intentFamilyBasePriority &&
      typeof routingPriorityBank.intentFamilyBasePriority === "object"
        ? (routingPriorityBank.intentFamilyBasePriority as Record<
            string,
            unknown
          >)
        : null;
    if (!priorities) return 0;
    const values = Object.values(priorities)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) return 0;
    const family = String(intentFamily || "general")
      .trim()
      .toLowerCase();
    const rawPriority = Number(priorities[family] ?? priorities.general ?? 0);
    if (!Number.isFinite(rawPriority) || rawPriority <= 0) return 0;
    const maxPriority = Math.max(...values);
    if (maxPriority <= 0) return 0;
    const stageWeight = this.resolveRoutingStageWeight(
      routingPriorityBank,
      "intent_family_priority",
    );
    const stageScale = stageWeight > 0 ? stageWeight : 1;
    return Math.max(
      0,
      Math.min(0.08, (rawPriority / maxPriority) * 0.08 * stageScale),
    );
  }

  private resolveRoutingStageWeight(
    routingPriorityBank: Record<string, any>,
    stageId: string,
  ): number {
    const stages = Array.isArray(routingPriorityBank?.tiebreakStages)
      ? routingPriorityBank.tiebreakStages
      : [];
    if (stages.length === 0) return 0;
    const maxWeight = Math.max(
      ...stages
        .map((stage: any) => Number(stage?.weight || 0))
        .filter((weight: number) => Number.isFinite(weight) && weight > 0),
      0,
    );
    if (maxWeight <= 0) return 0;
    const stage = stages.find(
      (entry: any) => String(entry?.id || "").trim() === stageId,
    );
    const raw = Number(stage?.weight || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.max(0, Math.min(1, raw / maxWeight));
  }

  private resolveSourceAffinityBoost(
    intentFamily: string | null | undefined,
    source: CandidateSource,
  ): number {
    const family = String(intentFamily || "")
      .trim()
      .toLowerCase();
    if (family === "documents" || family === "doc_stats") {
      if (source === "semantic") return 0.02;
      if (source === "structural") return 0.015;
      return 0;
    }
    if (family === "file_actions") {
      if (source === "lexical") return 0.02;
      if (source === "structural") return 0.01;
      return 0;
    }
    if (family === "editing") {
      if (source === "structural") return 0.02;
      return 0;
    }
    if (family === "help" || family === "conversation") {
      if (source === "semantic") return 0.01;
      return 0;
    }
    return 0;
  }

  // -----------------------------
  // Diversification
  // -----------------------------

  private applyDiversification(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    diversificationBank: Record<string, any> | null,
  ): CandidateChunk[] {
    if (!diversificationBank?.config?.enabled) return candidates;

    // Disable diversification when explicit lock or single doc intent (bank policy)
    const explicitDocLock = Boolean(signals.explicitDocLock);
    const singleDocIntent = Boolean(signals.singleDocIntent);
    if (explicitDocLock || singleDocIntent) {
      // Still dedupe near-duplicates lightly within doc
      return this.dedupeNearDuplicates(candidates, 3, 280);
    }

    const maxPerDocHard = safeNumber(
      diversificationBank.config.actionsContract?.thresholds?.maxPerDocHard,
      10,
    );
    const maxTotalHard = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.maxTotalChunksHard,
      36,
    );
    const maxNearDupPerDoc = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.maxNearDuplicatesPerDoc,
      3,
    );
    const windowChars = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.nearDuplicateWindowChars,
      280,
    );

    // 1) Near-duplicate dedupe first
    let filtered = this.dedupeNearDuplicates(
      candidates,
      maxNearDupPerDoc,
      windowChars,
    );

    // 2) Doc spread cap
    const perDocCount = new Map<string, number>();
    const diversified: CandidateChunk[] = [];
    for (const c of filtered) {
      const n = perDocCount.get(c.docId) ?? 0;
      if (n >= maxPerDocHard) continue;
      perDocCount.set(c.docId, n + 1);
      diversified.push(c);
      if (diversified.length >= maxTotalHard) break;
    }

    return diversified;
  }

  private dedupeNearDuplicates(
    candidates: CandidateChunk[],
    maxNearDupPerDoc: number,
    windowChars: number,
  ): CandidateChunk[] {
    const perDocHashes = new Map<string, Map<string, number>>();
    const out: CandidateChunk[] = [];

    for (const c of candidates) {
      const docMap = perDocHashes.get(c.docId) ?? new Map<string, number>();
      perDocHashes.set(c.docId, docMap);

      const snippetNorm = this.normalizeForNearDup(c.snippet).slice(
        0,
        windowChars,
      );
      const h = sha256(snippetNorm).slice(0, 16);

      const count = docMap.get(h) ?? 0;
      if (count >= maxNearDupPerDoc) continue;

      docMap.set(h, count + 1);
      out.push(c);
    }

    return out;
  }

  private normalizeForNearDup(s: string): string {
    return (s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
  }

  // -----------------------------
  // Extraction Hints
  // -----------------------------

  private lookupExtractionHints(
    domain: string | null,
    docType: string | null,
  ): Array<Record<string, any>> {
    if (!domain || !docType) return [];
    try {
      if (typeof this.documentIntelligenceBanks.getDocTypeExtractionHints !== "function") {
        return [];
      }
      const hints = this.documentIntelligenceBanks.getDocTypeExtractionHints(
        domain as Parameters<typeof this.documentIntelligenceBanks.getDocTypeExtractionHints>[0],
        docType,
      );
      if (!hints) return [];
      const fields = Array.isArray(hints.fields)
        ? hints.fields
        : Array.isArray(hints.hints)
          ? hints.hints
          : [];
      return fields.slice(0, 5).map((f: unknown) =>
        f && typeof f === "object" ? (f as Record<string, any>) : { hint: String(f) },
      );
    } catch {
      return [];
    }
  }

  // -----------------------------
  // Conflict Detection
  // -----------------------------

  /**
   * Parse a number string respecting both US (1,500.00) and BR (1.500,00) formats.
   * Heuristic: if last separator is comma with 1-2 decimal digits after → BR format.
   */
  private parseLocaleNumber(raw: string): number {
    const cleaned = raw.trim();
    // Check for BR format: dots as thousands separators, comma as decimal
    const brMatch = cleaned.match(/^([+-]?\d[\d.]*),(\d{1,2})$/);
    if (brMatch) {
      const intPart = brMatch[1].replace(/\./g, "");
      return parseFloat(`${intPart}.${brMatch[2]}`);
    }
    // Default US: commas are thousands separators
    return parseFloat(cleaned.replace(/,/g, ""));
  }

  private detectEvidenceConflicts(
    evidence: EvidenceItem[],
  ): Array<{ metric: string; docA: string; valueA: number; docB: string; valueB: number }> {
    const conflicts: Array<{
      metric: string;
      docA: string;
      valueA: number;
      docB: string;
      valueB: number;
    }> = [];

    const docMetrics = new Map<string, Map<string, number>>();
    const numPattern = /(?:[\w\s]{1,40}?)\s*([-+]?\d[\d.,]*)/g;

    for (const item of evidence) {
      const text = String(item.snippet || "");
      if (!text) continue;
      let match: RegExpExecArray | null;
      while ((match = numPattern.exec(text)) !== null) {
        const fullMatch = match[0].trim();
        const value = this.parseLocaleNumber(match[1]);
        if (!Number.isFinite(value)) continue;
        const words = fullMatch.replace(/[-+]?\d[\d.,]*/g, "").trim().toLowerCase();
        const metricKey = words.split(/\s+/).slice(-10).join(" ").trim();
        if (!metricKey || metricKey.length < 3) continue;

        const docMap = docMetrics.get(item.docId) ?? new Map<string, number>();
        if (!docMap.has(metricKey)) {
          docMap.set(metricKey, value);
        }
        docMetrics.set(item.docId, docMap);
      }
    }

    const docIds = Array.from(docMetrics.keys());
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const mapA = docMetrics.get(docIds[i])!;
        const mapB = docMetrics.get(docIds[j])!;
        for (const [metric, valueA] of mapA) {
          const valueB = mapB.get(metric);
          if (valueB === undefined) continue;
          if (valueA === 0 && valueB === 0) continue;
          const diff = Math.abs(valueA - valueB);
          const denom = Math.max(Math.abs(valueA), Math.abs(valueB));
          if (denom > 0 && diff / denom > 0.01) {
            conflicts.push({
              metric,
              docA: docIds[i],
              valueA,
              docB: docIds[j],
              valueB,
            });
          }
        }
      }
    }

    return conflicts;
  }

  // -----------------------------
  // Snippet Compression (SCP_* rules)
  // -----------------------------

  private compressSnippet(
    snippet: string,
    opts: {
      maxChars: number;
      preserveNumericUnits: boolean;
      preserveHeadings: boolean;
      hasQuotedText: boolean;
      compareIntent: boolean;
    },
  ): string {
    if (opts.hasQuotedText) return snippet;

    const effectiveMax = opts.compareIntent
      ? Math.ceil(opts.maxChars * 1.3)
      : opts.maxChars;

    if (snippet.length <= effectiveMax) return snippet;

    let truncPoint = effectiveMax;

    if (opts.preserveNumericUnits) {
      const numUnitPattern = /\d[\d.,]*\s*(?:R\$|\$|EUR|%|kg|months?|years?|days?|hours?)/gi;
      let match: RegExpExecArray | null;
      while ((match = numUnitPattern.exec(snippet)) !== null) {
        const tokenStart = match.index;
        const tokenEnd = tokenStart + match[0].length;
        if (tokenStart < truncPoint && tokenEnd > truncPoint) {
          truncPoint = tokenEnd;
          break;
        }
      }
    }

    if (opts.preserveHeadings) {
      const headingPattern = /^#+\s+.+$|^[A-Z][A-Z\s]{2,}$/gm;
      let match: RegExpExecArray | null;
      while ((match = headingPattern.exec(snippet)) !== null) {
        const hStart = match.index;
        const hEnd = hStart + match[0].length;
        if (hStart > truncPoint - 60 && hStart <= truncPoint && hEnd > truncPoint) {
          truncPoint = hEnd;
          break;
        }
      }
    }

    // SCP: Extend truncation to preserve negation context
    const negPattern =
      /\b(not|never|no|excluding|without|except|none|nem|não|nunca|exceto|sem)\b\s+\S{3,}/gi;
    let negMatch: RegExpExecArray | null;
    while ((negMatch = negPattern.exec(snippet)) !== null) {
      const nStart = negMatch.index;
      const nEnd = nStart + negMatch[0].length;
      if (nStart < truncPoint && nEnd > truncPoint) {
        truncPoint = nEnd;
        break;
      }
    }

    // Record post-extension truncPoint so sentence boundary never regresses past it
    const extensionFloor = truncPoint;

    const sentenceBoundary = snippet.lastIndexOf(". ", truncPoint);
    const newlineBoundary = snippet.lastIndexOf("\n", truncPoint);
    const boundary = Math.max(sentenceBoundary, newlineBoundary);
    if (boundary > effectiveMax * 0.5 && boundary >= extensionFloor) {
      truncPoint = boundary + 1;
    }

    const truncated = snippet.slice(0, truncPoint).trimEnd();
    return truncated.length < snippet.length ? truncated + "..." : truncated;
  }

  // -----------------------------
  // Packaging
  // -----------------------------

  /**
   * Compute aggregate doc-level score from all chunks belonging to a document.
   * Formula: max(chunk scores) * 0.7 + mean(top-3 chunk scores) * 0.3
   * This rewards documents with multiple strong chunks over single-chunk docs.
   */
  private computeDocLevelScores(
    candidates: CandidateChunk[],
  ): Map<string, number> {
    const byDoc = new Map<string, number[]>();
    for (const c of candidates) {
      const scores = byDoc.get(c.docId) ?? [];
      scores.push(c.scores.final ?? 0);
      byDoc.set(c.docId, scores);
    }

    const result = new Map<string, number>();
    for (const [docId, scores] of byDoc) {
      scores.sort((a, b) => b - a);
      const maxScore = scores[0] ?? 0;
      const top3 = scores.slice(0, 3);
      const meanTop3 = top3.reduce((a, b) => a + b, 0) / top3.length;
      result.set(docId, maxScore * 0.7 + meanTop3 * 0.3);
    }
    return result;
  }

  private packageEvidence(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    packagingBank: Record<string, any>,
    ctx: {
      queryOriginal: string;
      queryNormalized: string;
      expandedQueries: string[];
      scope: {
        candidateDocIds: string[];
        hardScopeActive: boolean;
        sheetName?: string | null;
        rangeA1?: string | null;
      };
      compareIntent: boolean;
      exploratoryMode: boolean;
      classification: DocumentClassificationResult;
      resolvedDocTypes: string[];
      phaseCounts: RetrievalPhaseCounts;
      scopeMetrics: RetrievalScopeMetrics;
    },
  ): EvidencePack {
    const cfg = packagingBank?.config ?? {};
    const scpBank = this.safeGetBank<Record<string, any>>(
      "snippet_compression_policy",
    );
    const scpConfig = (scpBank as Record<string, any>)?.config ?? {};
    const maxSnippetChars = safeNumber(scpConfig.maxSnippetChars, 2200);
    const preserveNumericUnits = scpConfig.preserveNumericUnits !== false;
    const preserveHeadings = scpConfig.preserveHeadings !== false;
    const hasQuotedText = Boolean(signals.hasQuotedText);
    const maxEvidenceHard = safeNumber(
      cfg.actionsContract?.thresholds?.maxEvidenceItemsHard,
      36,
    );
    const maxPerDocHard = safeNumber(
      cfg.actionsContract?.thresholds?.maxEvidencePerDocHard,
      10,
    );
    const maxDistinctDocsNonCompare = Math.max(
      1,
      Math.floor(
        safeNumber(
          cfg.actionsContract?.thresholds?.maxDistinctDocsNonCompare,
          1,
        ),
      ),
    );
    const maxDistinctDocsExploratoryNonCompare = Math.max(
      maxDistinctDocsNonCompare,
      Math.floor(
        safeNumber(
          cfg.actionsContract?.thresholds?.maxDistinctDocsExploratoryNonCompare,
          maxDistinctDocsNonCompare,
        ),
      ),
    );
    const maxPerSectionHard = Math.max(
      1,
      Math.floor(
        safeNumber(cfg.actionsContract?.thresholds?.maxPerSectionHard, 1),
      ),
    );
    const maxPerSectionExploratoryHard = Math.max(
      maxPerSectionHard,
      Math.floor(
        safeNumber(
          cfg.actionsContract?.thresholds?.maxPerSectionExploratoryHard,
          maxPerSectionHard,
        ),
      ),
    );
    const maxNearDuplicatesPerDocPackaging = Math.max(
      1,
      Math.floor(
        safeNumber(
          cfg.actionsContract?.thresholds?.maxNearDuplicatesPerDocPackaging,
          safeNumber(
            cfg.actionsContract?.thresholds?.maxNearDuplicatesPerDoc,
            1,
          ),
        ),
      ),
    );
    const maxNearDuplicatesExploratoryPerDocPackaging = Math.max(
      maxNearDuplicatesPerDocPackaging,
      Math.floor(
        safeNumber(
          cfg.actionsContract?.thresholds
            ?.maxNearDuplicatesExploratoryPerDocPackaging,
          maxNearDuplicatesPerDocPackaging,
        ),
      ),
    );
    const effectiveMaxDistinctDocsNonCompare = ctx.exploratoryMode
      ? maxDistinctDocsExploratoryNonCompare
      : maxDistinctDocsNonCompare;
    const effectiveMaxPerSectionHard = ctx.exploratoryMode
      ? maxPerSectionExploratoryHard
      : maxPerSectionHard;
    const effectiveMaxNearDuplicatesPerDocPackaging = ctx.exploratoryMode
      ? maxNearDuplicatesExploratoryPerDocPackaging
      : maxNearDuplicatesPerDocPackaging;
    const minFinalScore = safeNumber(
      cfg.actionsContract?.thresholds?.minFinalScore,
      0.28,
    );
    // In encrypted mode only semantic search works and Pinecone cosine scores
    // for niche queries can be as low as 0.10-0.17.  After weight redistribution
    // (semantic weight ≈ 0.88) the final score lands around 0.09-0.15, so we
    // need a much lower floor to avoid discarding all candidates.
    const effectiveMinFinalScore = this.isEncryptedOnlyMode()
      ? Math.min(minFinalScore, 0.05)
      : minFinalScore;

    // When extraction query is active, apply a lower threshold for scoped docs
    // so that we don't discard evidence that the extraction compiler needs.
    const isExtraction = Boolean(
      signals.isExtractionQuery && signals.slotContract,
    );
    const scopeDocSet =
      Array.isArray(ctx.scope.candidateDocIds) &&
      ctx.scope.candidateDocIds.length > 0
        ? new Set(ctx.scope.candidateDocIds)
        : null;
    let extractionMinScore = effectiveMinFinalScore;
    if (isExtraction) {
      const rankerCfg = this.safeGetBank<Record<string, any>>("retrieval_ranker_config");
      extractionMinScore = safeNumber(
        rankerCfg?.config?.slotExtraction?.scopedMinFinalScoreOverride,
        0.45,
      );
    }

    // When hard scope is active (user attached docs), effectively disable the
    // min-score threshold for scoped documents. The user explicitly selected
    // these docs — a strict keyword-overlap threshold blocks valid evidence,
    // especially for Portuguese meta-questions whose tokens don't appear in
    // document text. Any evidence from attached docs is better than none.
    const scopedMinScore = ctx.scope.hardScopeActive ? 0 : effectiveMinFinalScore;

    // Doc-level aggregation: blend 5% doc score into chunk scores
    const docScores = this.computeDocLevelScores(candidates);
    for (const c of candidates) {
      const docScore = docScores.get(c.docId) ?? 0;
      const chunkScore = c.scores.final ?? 0;
      c.scores.final = chunkScore * 0.95 + docScore * 0.05;
    }
    candidates.sort((a, b) => (b.scores.final ?? 0) - (a.scores.final ?? 0));

    const evidence: EvidenceItem[] = [];
    const perDoc = new Map<string, number>();
    const selectedDocs = new Set<string>();
    const perDocSectionCounts = new Map<string, Map<string, number>>();
    const perDocSnippetHashes = new Map<string, Map<string, number>>();
    const primaryDocType = this.normalizeDocType(ctx.resolvedDocTypes[0]);
    const enforceNonComparePurity =
      !ctx.compareIntent &&
      !Boolean(signals.corpusSearchAllowed) &&
      ctx.classification.confidence >= 0.35 &&
      (Boolean(primaryDocType) ||
        Boolean(signals.singleDocIntent) ||
        Boolean(signals.explicitDocLock) ||
        Boolean(signals.explicitDocRef));

    for (const c of candidates) {
      if (!c.provenanceOk) continue;
      const final = c.scores.final ?? 0;
      const isScoped = scopeDocSet && scopeDocSet.has(c.docId);
      const effectiveMin =
        isExtraction && isScoped
          ? extractionMinScore
          : isScoped
            ? scopedMinScore
            : effectiveMinFinalScore;
      if (final < effectiveMin) continue;

      // ── Universal doc-diversity safety net ──
      // Even when full purity is not enforced, prevent runaway multi-doc
      // evidence packs by: (a) capping total distinct docs at the exploratory
      // limit, and (b) requiring secondary docs to score within 55% of the
      // primary doc's best chunk.
      if (!ctx.compareIntent && !Boolean(signals.corpusSearchAllowed)) {
        if (selectedDocs.size > 0 && !selectedDocs.has(c.docId)) {
          // Score-gap: secondary doc must be within 55% of primary
          const primaryTopScore = evidence[0]?.score?.finalScore ?? 0;
          if (primaryTopScore > 0 && final < primaryTopScore * 0.55) {
            continue;
          }
          // Hard cap: never exceed maxDistinctDocsExploratoryNonCompare (3)
          if (selectedDocs.size >= maxDistinctDocsExploratoryNonCompare) {
            continue;
          }
        }
      }

      if (enforceNonComparePurity) {
        // Score-gap filter: in exploratory mode, reject secondary docs scoring
        // far below the primary doc's best chunk to prevent extraneous sources.
        if (ctx.exploratoryMode && selectedDocs.size > 0 && !selectedDocs.has(c.docId)) {
          const primaryTopScore = evidence[0]?.score?.finalScore ?? 0;
          if (primaryTopScore > 0 && final < primaryTopScore * 0.6) {
            continue;
          }
        }

        if (
          !selectedDocs.has(c.docId) &&
          selectedDocs.size >= effectiveMaxDistinctDocsNonCompare
        ) {
          continue;
        }

        if (primaryDocType && !ctx.exploratoryMode) {
          const candidateDocType = this.normalizeDocType(c.docType);
          if (candidateDocType && candidateDocType !== primaryDocType) continue;
        }

        const sectionKey = String(c.location?.sectionKey || "__unknown__")
          .trim()
          .toLowerCase();
        const sectionMap =
          perDocSectionCounts.get(c.docId) ?? new Map<string, number>();
        const sectionCount = sectionMap.get(sectionKey) ?? 0;
        if (sectionCount >= effectiveMaxPerSectionHard) continue;

        const snippetHash = crypto
          .createHash("sha256")
          .update(this.normalizeForNearDup(c.snippet))
          .digest("hex")
          .slice(0, 16);
        const hashMap =
          perDocSnippetHashes.get(c.docId) ?? new Map<string, number>();
        const hashCount = hashMap.get(snippetHash) ?? 0;
        if (hashCount >= effectiveMaxNearDuplicatesPerDocPackaging) continue;

        sectionMap.set(sectionKey, sectionCount + 1);
        perDocSectionCounts.set(c.docId, sectionMap);
        hashMap.set(snippetHash, hashCount + 1);
        perDocSnippetHashes.set(c.docId, hashMap);
      }

      const n = perDoc.get(c.docId) ?? 0;
      if (n >= maxPerDocHard) continue;

      perDoc.set(c.docId, n + 1);
      if (enforceNonComparePurity) {
        selectedDocs.add(c.docId);
      }

      evidence.push({
        evidenceType: c.type,
        docId: c.docId,
        title: c.title ?? null,
        filename: c.filename ?? null,
        location: c.location,
        locationKey: c.locationKey,
        snippet: c.snippet
          ? this.compressSnippet(c.snippet, {
              maxChars: maxSnippetChars,
              preserveNumericUnits,
              preserveHeadings,
              hasQuotedText,
              compareIntent: ctx.compareIntent,
            })
          : undefined,
        table: c.type === "table" ? (c.table ?? undefined) : undefined,
        imageRef: c.type === "image" ? null : undefined,
        score: {
          finalScore: clamp01(final),
          semanticScore: c.scores.semantic,
          lexicalScore: c.scores.lexical,
          structuralScore: c.scores.structural,
          boosts: {
            keywordBoost: c.scores.keywordBoost ?? 0,
            titleBoost: c.scores.titleBoost ?? 0,
            documentIntelligenceBoost: c.scores.documentIntelligenceBoost ?? 0,
            routingPriorityBoost: c.scores.routingPriorityBoost ?? 0,
            typeBoost: c.scores.typeBoost ?? 0,
            recencyBoost: c.scores.recencyBoost ?? 0,
          },
          penalties: {
            penalties: c.scores.penalties ?? 0,
          },
        },
        warnings: c.table?.warnings ?? undefined,
        extractionHints: (() => {
          const domain = ctx.classification?.domain || null;
          const docType = this.normalizeDocType(c.docType);
          if (!domain || !docType) return undefined;
          const hints = this.lookupExtractionHints(domain, docType);
          return hints.length > 0 ? hints : undefined;
        })(),
      });

      if (evidence.length >= maxEvidenceHard) break;
    }

    // PACK_004 — Preserve ranking priority; stabilize ties for coherent reading order
    evidence.sort((a, b) => {
      const scoreDelta = (b.score?.finalScore ?? 0) - (a.score?.finalScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      if (a.docId !== b.docId) return a.docId < b.docId ? -1 : 1;
      const pageA = Number(a.location?.page ?? 0);
      const pageB = Number(b.location?.page ?? 0);
      if (pageA !== pageB) return pageA - pageB;
      return (a.locationKey || "").localeCompare(b.locationKey || "");
    });

    // PACK_005 — Dedupe near-duplicate snippets within same doc
    const packDedupeWindowChars = 260;
    {
      const seenHashes = new Map<string, Set<string>>();
      const deduped: EvidenceItem[] = [];
      for (const item of evidence) {
        const text = String(item.snippet || "").replace(/\s+/g, " ").trim();
        const window = text.slice(0, packDedupeWindowChars).toLowerCase();
        if (window.length > 0) {
          const docHashes = seenHashes.get(item.docId) ?? new Set<string>();
          if (docHashes.has(window)) continue;
          docHashes.add(window);
          seenHashes.set(item.docId, docHashes);
        }
        deduped.push(item);
      }
      evidence.length = 0;
      evidence.push(...deduped);
    }

    // PACK_003 — Balance for compare intent
    if (ctx.compareIntent && evidence.length > 2) {
      const docGroups = new Map<string, EvidenceItem[]>();
      for (const item of evidence) {
        const group = docGroups.get(item.docId) ?? [];
        group.push(item);
        docGroups.set(item.docId, group);
      }
      if (docGroups.size > 1) {
        const avgCount = evidence.length / docGroups.size;
        const maxAllowed = Math.max(2, Math.ceil(avgCount * 2));
        const balanced: EvidenceItem[] = [];
        for (const [, group] of docGroups) {
          balanced.push(...group.slice(0, maxAllowed));
        }
        evidence.length = 0;
        evidence.push(...balanced);
      }
    }

    // Per-doc cap from bank config
    {
      const packMaxPerDoc = safeNumber(
        (this.safeGetBank<Record<string, any>>("evidence_packaging_policy") as Record<string, any>)
          ?.config?.maxPerDoc,
        maxPerDocHard,
      );
      const docCounts = new Map<string, number>();
      const capped: EvidenceItem[] = [];
      for (const item of evidence) {
        const count = docCounts.get(item.docId) ?? 0;
        if (count >= packMaxPerDoc) continue;
        docCounts.set(item.docId, count + 1);
        capped.push(item);
      }
      evidence.length = 0;
      evidence.push(...capped);
    }

    const uniqueDocs = new Set(evidence.map((e) => e.docId));
    const topScore = evidence.length ? evidence[0].score.finalScore : null;
    const scoreGap =
      evidence.length >= 2
        ? clamp01(
            (evidence[0].score.finalScore ?? 0) -
              (evidence[1].score.finalScore ?? 0),
          )
        : null;

    const pack: EvidencePack = {
      runtimeStatus: "ok",
      query: {
        original: ctx.queryOriginal,
        normalized: ctx.queryNormalized,
        expanded: ctx.expandedQueries.length ? ctx.expandedQueries : undefined,
      },
      scope: {
        activeDocId: signals.activeDocId ?? null,
        explicitDocLock: Boolean(signals.explicitDocLock),
        candidateDocIds: ctx.scope.candidateDocIds,
        hardScopeActive: ctx.scope.hardScopeActive,
        sheetName: ctx.scope.sheetName ?? null,
        rangeA1: ctx.scope.rangeA1 ?? null,
      },
      stats: {
        candidatesConsidered: ctx.phaseCounts.considered,
        candidatesAfterNegatives: ctx.phaseCounts.afterNegatives,
        candidatesAfterBoosts: ctx.phaseCounts.afterBoosts,
        candidatesAfterDiversification: ctx.phaseCounts.afterDiversification,
        scopeCandidatesDropped: ctx.scopeMetrics.scopeCandidatesDropped,
        scopeViolationsDetected: ctx.scopeMetrics.scopeViolationsDetected,
        scopeViolationsThrown: ctx.scopeMetrics.scopeViolationsThrown,
        evidenceItems: evidence.length,
        uniqueDocsInEvidence: uniqueDocs.size,
        topScore,
        scoreGap,
        docLevelScores: Object.fromEntries(docScores),
      },
      evidence,
      conflicts: [],
      debug: {
        phases: [],
        reasonCodes: [],
      },
    };

    pack.conflicts = this.detectEvidenceConflicts(evidence);

    return pack;
  }

  private applyNonComparePurityPreRank(
    candidates: CandidateChunk[],
    params: {
      compareIntent: boolean;
      classification: DocumentClassificationResult;
      resolvedDocTypes: string[];
      signals: RetrievalRequest["signals"];
      exploratoryMode: boolean;
    },
  ): CandidateChunk[] {
    if (params.compareIntent) return candidates;
    if (params.signals.corpusSearchAllowed) return candidates;
    if (params.exploratoryMode) return candidates;
    if (params.classification.confidence < 0.6) return candidates;
    const primaryDocType = this.normalizeDocType(params.resolvedDocTypes[0]);
    if (!primaryDocType) return candidates;

    const filtered = candidates.filter((candidate) => {
      const candidateDocType = this.normalizeDocType(candidate.docType);
      return candidateDocType === primaryDocType;
    });
    if (!filtered.length) return candidates;

    return filtered;
  }

  private isExploratoryRetrievalRequest(params: {
    compareIntent: boolean;
    queryNormalized: string;
    signals: RetrievalRequest["signals"];
    classification: DocumentClassificationResult;
    resolvedDocTypes: string[];
  }): boolean {
    if (params.compareIntent) return false;
    if (params.signals.corpusSearchAllowed) return true;
    if (
      params.signals.explicitDocLock ||
      params.signals.explicitDocRef ||
      params.signals.singleDocIntent
    ) {
      return false;
    }

    const intentFamily = String(params.signals.intentFamily || "")
      .trim()
      .toLowerCase();
    if (intentFamily === "doc_discovery") return true;

    const operator = String(params.signals.operator || "")
      .trim()
      .toLowerCase();
    if (["locate_docs", "navigate", "list", "monitor"].includes(operator)) {
      return true;
    }

    const query = String(params.queryNormalized || "")
      .trim()
      .toLowerCase();
    if (
      /\b(list|all|which (docs|files)|where else|across (docs|files)|documents? mentioning|files? mentioning|todos|visa[oã]o geral|compara|entre .+ e .+|quais (docs|documentos|arquivos)|dos (docs|documentos) anexa)/i.test(
        query,
      )
    ) {
      return true;
    }

    if (params.classification.confidence < 0.4) return true;
    return false;
  }

  private shouldEnforceScopedDocSet(
    scope: { candidateDocIds: string[]; hardScopeActive: boolean },
    signals: RetrievalRequest["signals"],
  ): boolean {
    const isDiscovery =
      signals.intentFamily === "doc_discovery" ||
      signals.corpusSearchAllowed === true;
    if (isDiscovery) return false;
    if (!scope.hardScopeActive) return false;
    return (
      Array.isArray(scope.candidateDocIds) && scope.candidateDocIds.length > 0
    );
  }

  private enforceScopeInvariant(
    docIds: string[],
    scope: { candidateDocIds: string[]; hardScopeActive: boolean },
    signals: RetrievalRequest["signals"],
    stage: ScopeInvariantStage,
    scopeMetrics: RetrievalScopeMetrics,
  ): void {
    if (!this.shouldEnforceScopedDocSet(scope, signals)) return;
    const allowed = new Set(scope.candidateDocIds);
    const violatingDocIds = Array.from(
      new Set(
        docIds
          .map((docId) => String(docId || "").trim())
          .filter((docId) => docId && !allowed.has(docId)),
      ),
    );
    if (!violatingDocIds.length) return;

    scopeMetrics.scopeViolationsDetected += violatingDocIds.length;
    scopeMetrics.scopeViolationsThrown += 1;
    throw new RetrievalScopeViolationError({
      stage,
      allowedDocIds: [...allowed].sort((a, b) => a.localeCompare(b)),
      violatingDocIds,
      hardScopeActive: scope.hardScopeActive,
      explicitDocLock: Boolean(signals.explicitDocLock),
      explicitDocRef: Boolean(signals.explicitDocRef),
      singleDocIntent: Boolean(signals.singleDocIntent),
      intentFamily: signals.intentFamily ?? null,
    });
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }

  private getRequiredBank<T = unknown>(bankId: string): T {
    return this.bankLoader.getBank<T>(bankId);
  }

  private simpleTokens(q: string): string[] {
    return (q ?? "")
      .toLowerCase()
      .replace(/["“”]/g, " ")
      .split(/[\s,;:.!?()]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  private buildTelemetryDiagnostics(params: {
    ruleEvents: RetrievalRuleTelemetryEvent[];
    matchedBoostRuleIds: string[];
    appliedBoostRuleIds: string[];
    rewriteRuleIds: string[];
    selectedSectionRuleId: string | null;
    crossDocGatedReason: string | null;
    classification: DocumentClassificationResult;
  }): EvidencePack["telemetry"] {
    const dedupe = (values: string[]) =>
      Array.from(
        new Set(
          values.map((value) => String(value || "").trim()).filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));
    return {
      ruleEvents: (params.ruleEvents || []).slice(),
      summary: {
        matchedBoostRuleIds: dedupe(params.matchedBoostRuleIds),
        appliedBoostRuleIds: dedupe(params.appliedBoostRuleIds),
        rewriteRuleIds: dedupe(params.rewriteRuleIds),
        selectedSectionRuleId: params.selectedSectionRuleId || null,
        crossDocGatedReason: params.crossDocGatedReason || null,
        classifiedDomain: params.classification.domain || null,
        classifiedDocTypeId: params.classification.docTypeId || null,
        classificationReasons: Array.from(
          new Set(
            (params.classification.reasons || [])
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        ).slice(0, 12),
      },
    };
  }

  private buildRetrievalCacheKey(params: {
    queryNormalized: string;
    scopeDocIds: string[];
    domain: DocumentIntelligenceDomain | null;
    resolvedDocTypes: string[];
    resolvedDocDomains: string[];
    signals: RetrievalRequest["signals"];
    retrievalPlan: Partial<RetrievalPlan> | null;
    overrides: Partial<RetrievalOverrides> | null;
    env: EnvName;
    modelVersion: string;
  }): string {
    const payload = {
      query: String(params.queryNormalized || "").trim(),
      scopeDocIds: Array.from(
        new Set(
          (params.scopeDocIds || [])
            .map((docId) => String(docId || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
      domain: params.domain || null,
      resolvedDocTypes: Array.from(
        new Set(
          (params.resolvedDocTypes || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
      resolvedDocDomains: Array.from(
        new Set(
          (params.resolvedDocDomains || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
      signalShape: {
        intentFamily: params.signals.intentFamily || null,
        queryFamily: params.signals.queryFamily || null,
        operator: params.signals.operator || null,
        answerMode: params.signals.answerMode || null,
        explicitDocLock: Boolean(params.signals.explicitDocLock),
        explicitDocRef: Boolean(params.signals.explicitDocRef),
        singleDocIntent: Boolean(params.signals.singleDocIntent),
        allowExpansion: Boolean(params.signals.allowExpansion),
        tableExpected: Boolean(params.signals.tableExpected),
        userAskedForTable: Boolean(params.signals.userAskedForTable),
        userAskedForQuote: Boolean(params.signals.userAskedForQuote),
        languageHint: params.signals.languageHint || null,
        requiredBankIds: Array.from(
          new Set(
            (params.signals.requiredBankIds || [])
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        ).sort((a, b) => a.localeCompare(b)),
        selectedBankVersionMap: params.signals.selectedBankVersionMap || null,
      },
      retrievalPlan: params.retrievalPlan || null,
      overrides: params.overrides || null,
      env: params.env,
      modelVersion: String(params.modelVersion || "unknown"),
      retrievalCacheVersion: "v1",
    };

    return `retrieval:${crypto
      .createHash("sha256")
      .update(JSON.stringify(payload), "utf8")
      .digest("hex")}`;
  }

  private cloneEvidencePack(pack: EvidencePack): EvidencePack {
    return JSON.parse(JSON.stringify(pack)) as EvidencePack;
  }

  private emptyPack(
    req: RetrievalRequest,
    dbg: { reasonCodes: string[]; note?: string },
    telemetry?: EvidencePack["telemetry"],
  ): EvidencePack {
    return {
      runtimeStatus: "ok",
      query: { original: req.query, normalized: (req.query ?? "").trim() },
      scope: {
        activeDocId: req.signals.activeDocId ?? null,
        explicitDocLock: Boolean(req.signals.explicitDocLock),
        candidateDocIds: [],
        hardScopeActive: Boolean(req.signals.hardScopeActive),
        sheetName: req.signals.resolvedSheetName ?? null,
        rangeA1: req.signals.resolvedRangeA1 ?? null,
      },
      stats: {
        candidatesConsidered: 0,
        candidatesAfterNegatives: 0,
        candidatesAfterBoosts: 0,
        candidatesAfterDiversification: 0,
        scopeCandidatesDropped: 0,
        scopeViolationsDetected: 0,
        scopeViolationsThrown: 0,
        evidenceItems: 0,
        uniqueDocsInEvidence: 0,
        topScore: null,
        scoreGap: null,
      },
      evidence: [],
      telemetry,
      debug: isProductionEnv(req.env)
        ? undefined
        : { phases: [], reasonCodes: dbg.reasonCodes },
    };
  }
}
