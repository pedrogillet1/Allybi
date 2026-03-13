/**
 * Retrieval Engine — Shared Types
 *
 * All public interfaces, type aliases, and error classes used across
 * the retrieval pipeline modules.
 */

import type { DocScopeLock } from "./docScopeLock";
import type { SlotContract } from "./slotResolver.service";
import type { DocumentIntelligenceDomain } from "../banks/documentIntelligenceBanks.service";
import type { RetrievalPlan } from "./retrievalPlanParser.service";

// ── Primitives ───────────────────────────────────────────────────────

export type EnvName = "production" | "staging" | "dev" | "local";

export type AnswerMode =
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

export type CandidateType = "text" | "table" | "image";
export type CandidateSource = "semantic" | "lexical" | "structural";

// ── Request / Overrides ──────────────────────────────────────────────

export interface RetrievalRequest {
  query: string;
  env: EnvName;

  signals: {
    intentFamily?: string | null;
    operator?: string | null;
    answerMode?: AnswerMode | null;

    docScopeLock?: DocScopeLock | null;
    allowedDocumentIds?: string[] | null;
    explicitDocLock?: boolean;
    activeDocId?: string | null;
    explicitDocRef?: boolean;
    resolvedDocId?: string | null;

    hardScopeActive?: boolean;
    singleDocIntent?: boolean;
    allowExpansion?: boolean;
    hasQuotedText?: boolean;
    hasFilename?: boolean;

    userAskedForTable?: boolean;
    userAskedForQuote?: boolean;

    sheetHintPresent?: boolean;
    resolvedSheetName?: string | null;
    rangeExplicit?: boolean;
    resolvedRangeA1?: string | null;

    timeConstraintsPresent?: boolean;
    explicitYearOrQuarterComparison?: boolean;

    tableExpected?: boolean;

    domainHint?: string | null;
    queryFamily?: string | null;
    languageHint?: string | null;
    explicitDocTypes?: string[] | null;
    explicitDocIds?: string[] | null;
    explicitDocDomains?: string[] | null;
    requiredBankIds?: string[] | null;
    selectedBankVersionMap?: Record<string, string> | null;

    corpusSearchAllowed?: boolean;

    unsafeGate?: boolean;

    slotContract?: SlotContract | null;
    isExtractionQuery?: boolean;
  };

  retrievalPlan?: Partial<RetrievalPlan> | null;

  history?: {
    recentFallbacks?: Array<{
      reasonCode: string;
      fallbackType: string;
      strategy: string;
      turnId: number;
    }>;
  };

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

// ── Document / Chunk ─────────────────────────────────────────────────

export interface DocMeta {
  docId: string;
  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sizeBytes?: number | null;

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

  snippet: string;
  rawText?: string | null;
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

  signals: {
    isScopedMatch?: boolean;
    isAnchorMatch?: boolean;
    headerFooterCandidate?: boolean;
    scopeViolation?: boolean;
    lowRelevanceChunk?: boolean;
    tableValidated?: boolean;
    tocCandidate?: boolean;
    tocPenaltyMultiplier?: number;
  };

  provenanceOk: boolean;
}

// ── Evidence ─────────────────────────────────────────────────────────

export interface EvidenceItem {
  evidenceType: CandidateType;
  docId: string;
  title?: string | null;
  filename?: string | null;
  location: ChunkLocation;
  locationKey: string;

  snippet?: string;
  table?: CandidateChunk["table"];
  imageRef?: string | null;

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
    expanded?: string[];
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

// ── Telemetry ────────────────────────────────────────────────────────

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

// ── Scope ────────────────────────────────────────────────────────────

export type ScopeInvariantStage =
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

export interface RetrievalScopeMetrics {
  scopeCandidatesDropped: number;
  scopeViolationsDetected: number;
  scopeViolationsThrown: number;
}

// ── Engine Interface ─────────────────────────────────────────────────

/**
 * Shared interface for the active retrieval engine.
 * Consumers depend on this interface only — never on engine classes directly.
 */
export interface IRetrievalEngine {
  retrieve(req: RetrievalRequest): Promise<EvidencePack>;
}

/** @deprecated Use IRetrievalEngine instead */
export type IRetrievalOrchestrator = IRetrievalEngine;

// ── Index / Store Interfaces ─────────────────────────────────────────

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
}

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

// ── Internal Pipeline Types ──────────────────────────────────────────

export interface DocumentClassificationResult {
  domain: DocumentIntelligenceDomain | null;
  docTypeId: string | null;
  confidence: number;
  reasons: string[];
  matchedDomainRuleIds: string[];
}

export interface DocTypeBoostPlan {
  domain: DocumentIntelligenceDomain;
  docTypeId: string;
  sectionAnchors: string[];
  tableAnchors: string[];
  reasons: string[];
}

export interface RetrievalPhaseCounts {
  considered: number;
  afterNegatives: number;
  afterBoosts: number;
  afterDiversification: number;
}

export interface RetrievalQueryVariant {
  text: string;
  weight: number;
  sourceRuleId: string;
  reason: string;
}

export interface RetrievalPhaseResult {
  phaseId: string;
  source: CandidateSource;
  hits: unknown[];
  status: "ok" | "failed" | "timed_out";
  failureCode?: string;
  note?: string;
  durationMs?: number;
}

export interface RetrievalScope {
  candidateDocIds: string[];
  hardScopeActive: boolean;
  sheetName?: string | null;
  rangeA1?: string | null;
}
