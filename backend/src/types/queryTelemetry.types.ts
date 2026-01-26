/**
 * QueryTelemetry Types - Comprehensive Query Observability Schema
 *
 * This is the SINGLE SOURCE OF TRUTH for all query telemetry data.
 * Every query through the RAG pipeline captures this telemetry for
 * the analytics dashboard control plane.
 *
 * VERSION: 1.0.0
 */

// ============================================================================
// CORE TELEMETRY SCHEMA
// ============================================================================

/**
 * Complete telemetry for a single user query through the RAG pipeline.
 * This captures every stage from intent classification to SSE completion.
 */
export interface QueryTelemetry {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTIFIERS
  // ─────────────────────────────────────────────────────────────────────────
  id: string;                      // UUID for this telemetry record
  queryId: string;                 // UUID linking to the query/message
  userId: string;                  // User who made the query
  conversationId?: string;         // Conversation context
  messageId?: string;              // Associated message ID
  environment: string;             // prod/staging/dev
  timestamp: Date;                 // When query was received

  // ─────────────────────────────────────────────────────────────────────────
  // INTENT CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  intent: IntentTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // RETRIEVAL METRICS
  // ─────────────────────────────────────────────────────────────────────────
  retrieval: RetrievalTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // EVIDENCE GATE
  // ─────────────────────────────────────────────────────────────────────────
  evidenceGate: EvidenceGateTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // FORMATTING PIPELINE
  // ─────────────────────────────────────────────────────────────────────────
  formatting: FormattingTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // LANGUAGE RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────
  language: LanguageTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // ANSWER QUALITY
  // ─────────────────────────────────────────────────────────────────────────
  quality: QualityTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // LATENCY BREAKDOWN
  // ─────────────────────────────────────────────────────────────────────────
  latency: LatencyTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // TOKEN & COST
  // ─────────────────────────────────────────────────────────────────────────
  tokens: TokenTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // SSE STREAMING HEALTH
  // ─────────────────────────────────────────────────────────────────────────
  streaming: StreamingTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // PIPELINE METADATA
  // ─────────────────────────────────────────────────────────────────────────
  pipeline: PipelineTelemetry;

  // ─────────────────────────────────────────────────────────────────────────
  // ERRORS & WARNINGS
  // ─────────────────────────────────────────────────────────────────────────
  errors: ErrorTelemetry[];
  warnings: string[];
}

// ============================================================================
// INTENT TELEMETRY
// ============================================================================

export interface IntentTelemetry {
  /** Primary detected intent */
  intent: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Secondary intents with scores */
  secondaryIntents: Array<{ intent: string; confidence: number }>;
  /** Whether multi-intent was detected */
  isMultiIntent: boolean;
  /** Number of segments if multi-intent */
  segmentCount: number;
  /** Question type classification */
  questionType: QuestionType;
  /** Query scope */
  queryScope: QueryScope;
  /** Domain classification */
  domain: string;
  /** Depth level (D1-D5) */
  depth: string;
  /** Intent family (documents, help, reasoning, etc.) */
  family: string;
  /** Sub-intent if applicable */
  subIntent?: string;
  /** Patterns that matched the query */
  matchedPatterns: string[];
  /** Keywords that triggered classification */
  matchedKeywords: string[];
  /** Whether blocked by negative patterns */
  blockedByNegatives: boolean;
  /** Override reason if intent was overridden */
  overrideReason?: string;
  /** Classification time in ms */
  classificationTimeMs: number;
}

export type QuestionType =
  | 'SUMMARY'
  | 'EXTRACT'
  | 'COMPARE'
  | 'LIST'
  | 'WHY'
  | 'HOW_TO'
  | 'DEFINITION'
  | 'YES_NO'
  | 'NUMERIC'
  | 'TABLE'
  | 'META_CAPABILITIES'
  | 'OTHER';

export type QueryScope =
  | 'SINGLE_DOC'
  | 'MULTI_DOC'
  | 'ALL_DOCS'
  | 'WORKSPACE';

// ============================================================================
// RETRIEVAL TELEMETRY
// ============================================================================

export interface RetrievalTelemetry {
  /** Total chunks returned from retrieval */
  chunksReturned: number;
  /** Results from BM25 keyword search */
  bm25Results: number;
  /** Results from vector search */
  vectorResults: number;
  /** Number of distinct documents */
  distinctDocs: number;
  /** Document IDs used */
  documentIds: string[];
  /** Highest relevance score */
  topRelevanceScore: number;
  /** Average relevance score */
  avgRelevanceScore: number;
  /** Minimum relevance score of selected chunks */
  minRelevanceScore: number;
  /** Total characters in retrieved snippets */
  totalSnippetChars: number;
  /** Whether retrieval met adequacy threshold */
  retrievalAdequate: boolean;
  /** Retrieval method used */
  method: 'hybrid' | 'bm25_only' | 'vector_only';
  /** Merge strategy for hybrid */
  mergeStrategy: 'weighted' | 'rrf' | 'none';
  /** Budget parameters used */
  budgets: {
    vectorTopK: number;
    bm25TopK: number;
    fusedTopK: number;
    finalK: number;
    maxContextTokens: number;
  };
  /** Expansion attempts */
  expansionAttempts: number;
  /** Whether all floors were met */
  meetsAllFloors: boolean;
}

// ============================================================================
// EVIDENCE GATE TELEMETRY
// ============================================================================

export interface EvidenceGateTelemetry {
  /** Gate action taken */
  action: EvidenceGateAction | null;
  /** Human-readable message */
  message?: string;
  /** Whether to proceed with generation */
  shouldProceed: boolean;
  /** Evidence metrics */
  metrics: {
    chunksReturned: number;
    distinctDocs: number;
    totalSnippetChars: number;
  };
  /** Thresholds that were checked */
  thresholds: {
    minChunks: number;
    minDistinctDocs: number;
    minSnippetChars: number;
  };
}

export type EvidenceGateAction =
  | 'INSUFFICIENT_EVIDENCE'
  | 'WARN_THIN_EVIDENCE'
  | 'CANNOT_COMPARE'
  | 'INSUFFICIENT_CONTENT'
  | 'THIN_EVIDENCE_BLOCKED';

// ============================================================================
// FORMATTING TELEMETRY
// ============================================================================

export interface FormattingTelemetry {
  /** Format mode requested */
  formatMode: FormatMode;
  /** Whether formatting passed validation */
  passed: boolean;
  /** Violation tags if failed */
  violations: string[];
  /** Bullet policy applied */
  bulletPolicy?: {
    mode: 'strict' | 'adaptive';
    exactCount?: number;
    minCount?: number;
    maxCount?: number;
  };
  /** Response constraints applied */
  constraints: {
    buttonsOnly: boolean;
    jsonOnly: boolean;
    csvOnly: boolean;
    tableOnly: boolean;
    maxChars?: number;
  };
  /** Post-processing applied */
  postProcessing: string[];
}

export type FormatMode =
  | 'bullets'
  | 'table'
  | 'prose'
  | 'json'
  | 'csv'
  | 'extraction'
  | 'summary'
  | 'comparison'
  | 'default';

// ============================================================================
// LANGUAGE TELEMETRY
// ============================================================================

export interface LanguageTelemetry {
  /** Resolved language code */
  resolvedLang: string;
  /** Source of language resolution */
  source: LanguageSource;
  /** Detected language from query */
  detectedLang?: string;
  /** Whether there was a mismatch */
  hasMismatch: boolean;
  /** Whether enforcement was applied */
  enforcementApplied: boolean;
  /** Banned phrases found */
  bannedPhrasesFound: string[];
}

export type LanguageSource =
  | 'app_setting'
  | 'header'
  | 'query_detect'
  | 'default';

// ============================================================================
// QUALITY TELEMETRY
// ============================================================================

export interface QualityTelemetry {
  /** Whether answer is useful (passed quality bar) */
  isUseful: boolean;
  /** Failure category if not useful */
  failureCategory?: FailureCategory;
  /** Whether fallback was triggered */
  hadFallback: boolean;
  /** Fallback scenario if triggered */
  fallbackScenario?: string;
  /** Citation count */
  citationCount: number;
  /** Whether sources are missing */
  sourcesMissing: boolean;
  /** Answer length in characters */
  answerLength: number;
  /** Quality flags */
  flags: {
    ungroundedClaims: boolean;
    underinformative: boolean;
    metadataOnly: boolean;
    thinRetrieval: boolean;
    incompleteSummary: boolean;
    compareSingleDoc: boolean;
    truncated: boolean;
  };
}

export type FailureCategory =
  | 'USELESS_FALLBACK'
  | 'UNGROUNDED_CLAIMS'
  | 'NOT_FOUND_DESPITE_EVIDENCE'
  | 'THIN_RETRIEVAL'
  | 'UNDERINFORMATIVE'
  | 'METADATA_INSTEAD_OF_CONTENT'
  | 'INCOMPLETE_SUMMARY'
  | 'COMPARE_SINGLE_DOC'
  | 'BAD_MARKERS'
  | 'TRUNCATED';

// ============================================================================
// LATENCY TELEMETRY
// ============================================================================

export interface LatencyTelemetry {
  /** Time to first token (ms) */
  ttft: number;
  /** Retrieval stage duration (ms) */
  retrievalMs: number;
  /** LLM generation duration (ms) */
  llmMs: number;
  /** Embedding generation duration (ms) */
  embeddingMs: number;
  /** Pinecone latency (ms) */
  pineconeMs: number;
  /** BM25 search latency (ms) */
  bm25Ms: number;
  /** Formatting time (ms) */
  formattingMs: number;
  /** Total end-to-end latency (ms) */
  totalMs: number;
}

// ============================================================================
// TOKEN TELEMETRY
// ============================================================================

export interface TokenTelemetry {
  /** Model used for generation */
  model: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Context window used (tokens) */
  contextUsed: number;
  /** Max context available */
  contextMax: number;
}

// ============================================================================
// STREAMING TELEMETRY
// ============================================================================

export interface StreamingTelemetry {
  /** Stream started successfully */
  streamStarted: boolean;
  /** First token received */
  firstTokenReceived: boolean;
  /** Stream ended properly */
  streamEnded: boolean;
  /** Client disconnected early */
  clientDisconnected: boolean;
  /** SSE errors encountered */
  sseErrors: string[];
  /** Total chunks sent */
  chunksSent: number;
  /** Stream duration (ms) */
  streamDurationMs: number;
  /** Whether stream was aborted */
  wasAborted: boolean;
}

// ============================================================================
// PIPELINE TELEMETRY
// ============================================================================

export interface PipelineTelemetry {
  /** Pipeline signature hash */
  signature: string;
  /** Handler invoked */
  handler: string;
  /** Decision family */
  family: string;
  /** Whether RAG was enabled */
  ragEnabled: boolean;
  /** Whether hybrid search was used */
  hybridSearchUsed: boolean;
  /** Whether product help was used */
  productHelpUsed: boolean;
  /** Whether math engine was used */
  mathUsed: boolean;
  /** Routing decision reason */
  routingReason?: string;
}

// ============================================================================
// ERROR TELEMETRY
// ============================================================================

export interface ErrorTelemetry {
  /** Error type/category */
  type: string;
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Stage where error occurred */
  stage: string;
  /** Stack trace (truncated) */
  stack?: string;
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// TELEMETRY BUILDER (for pipeline stages)
// ============================================================================

export interface TelemetryBuilder {
  setIntent(intent: Partial<IntentTelemetry>): TelemetryBuilder;
  setRetrieval(retrieval: Partial<RetrievalTelemetry>): TelemetryBuilder;
  setEvidenceGate(gate: Partial<EvidenceGateTelemetry>): TelemetryBuilder;
  setFormatting(formatting: Partial<FormattingTelemetry>): TelemetryBuilder;
  setLanguage(language: Partial<LanguageTelemetry>): TelemetryBuilder;
  setQuality(quality: Partial<QualityTelemetry>): TelemetryBuilder;
  setLatency(latency: Partial<LatencyTelemetry>): TelemetryBuilder;
  setTokens(tokens: Partial<TokenTelemetry>): TelemetryBuilder;
  setStreaming(streaming: Partial<StreamingTelemetry>): TelemetryBuilder;
  setPipeline(pipeline: Partial<PipelineTelemetry>): TelemetryBuilder;
  addError(error: ErrorTelemetry): TelemetryBuilder;
  addWarning(warning: string): TelemetryBuilder;
  build(): QueryTelemetry;
}

// ============================================================================
// AGGREGATED ANALYTICS TYPES (for dashboard)
// ============================================================================

export interface IntentAnalytics {
  /** Breakdown by intent type */
  byIntent: Array<{ intent: string; count: number; avgConfidence: number }>;
  /** Breakdown by question type */
  byQuestionType: Array<{ type: QuestionType; count: number }>;
  /** Breakdown by depth */
  byDepth: Array<{ depth: string; count: number }>;
  /** Breakdown by domain */
  byDomain: Array<{ domain: string; count: number }>;
  /** Multi-intent rate */
  multiIntentRate: number;
  /** Pattern hit counts */
  topPatterns: Array<{ pattern: string; count: number }>;
  /** Keyword hit counts */
  topKeywords: Array<{ keyword: string; count: number }>;
  /** Override rate */
  overrideRate: number;
  /** Totals */
  totalQueries: number;
  avgClassificationTimeMs: number;
}

export interface RetrievalAnalytics {
  /** Chunks returned distribution */
  chunksDistribution: Array<{ bucket: string; count: number }>;
  /** Thin retrieval rate (<3 chunks) */
  thinRetrievalRate: number;
  /** Retrieval adequacy rate */
  adequacyRate: number;
  /** Evidence gate actions breakdown */
  evidenceGateActions: Array<{ action: string; count: number }>;
  /** Avg relevance scores */
  avgRelevanceScore: number;
  avgTopScore: number;
  /** Method breakdown */
  byMethod: Array<{ method: string; count: number }>;
  /** Totals */
  totalQueries: number;
  avgChunksReturned: number;
  avgDistinctDocs: number;
}

export interface QualityAnalytics {
  /** Useful answer rate */
  usefulRate: number;
  /** Useless fallback rate */
  uselessFallbackRate: number;
  /** Ungrounded claims rate */
  ungroundedClaimsRate: number;
  /** Underinformative rate */
  underinformativeRate: number;
  /** Failure category breakdown */
  byFailureCategory: Array<{ category: FailureCategory; count: number; rate: number }>;
  /** Fallback scenario breakdown */
  byFallbackScenario: Array<{ scenario: string; count: number }>;
  /** Sources missing rate */
  sourcesMissingRate: number;
  /** Avg citation count */
  avgCitationCount: number;
  /** Totals */
  totalQueries: number;
  passedQueries: number;
  failedQueries: number;
}

export interface LanguageAnalytics {
  /** Breakdown by resolved language */
  byLanguage: Array<{ lang: string; count: number; passRate: number }>;
  /** Breakdown by source */
  bySource: Array<{ source: LanguageSource; count: number }>;
  /** Mismatch rate */
  mismatchRate: number;
  /** Enforcement applied rate */
  enforcementRate: number;
  /** Banned phrases found */
  topBannedPhrases: Array<{ phrase: string; count: number }>;
}

export interface PerformanceAnalytics {
  /** Latency percentiles */
  latencyPercentiles: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  /** TTFT percentiles */
  ttftPercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  /** Stage breakdown */
  avgLatencyByStage: {
    retrieval: number;
    llm: number;
    embedding: number;
    pinecone: number;
    formatting: number;
    total: number;
  };
  /** SSE health */
  sseHealth: {
    successRate: number;
    abortRate: number;
    avgChunksSent: number;
    avgStreamDuration: number;
  };
  /** Trends (hourly for last 24h) */
  latencyTrend: Array<{ hour: string; avgLatency: number; p95: number }>;
}

export interface CostAnalytics {
  /** Total cost for period */
  totalCost: number;
  /** Cost per query */
  avgCostPerQuery: number;
  /** Breakdown by model */
  byModel: Array<{ model: string; cost: number; tokens: number; queries: number }>;
  /** Token breakdown */
  tokens: {
    totalInput: number;
    totalOutput: number;
    avgPerQuery: number;
  };
  /** Daily trend */
  dailyTrend: Array<{ date: string; cost: number; tokens: number; queries: number }>;
  /** Top spenders */
  topUsers: Array<{ userId: string; email: string; cost: number; queries: number }>;
}

// ============================================================================
// QUERY LIST ITEM (for table view)
// ============================================================================

export interface QueryListItem {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail?: string;
  query: string;
  intent: string;
  confidence: number;
  questionType: QuestionType;
  language: string;
  chunksReturned: number;
  isUseful: boolean;
  failureCategory?: FailureCategory;
  totalLatencyMs: number;
  ttft: number;
  cost: number;
  hasErrors: boolean;
}

export interface QueryDetail extends QueryTelemetry {
  userEmail?: string;
  queryText?: string;
}
