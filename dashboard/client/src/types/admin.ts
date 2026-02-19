import { z } from "zod";

// ============================================================================
// Common Types
// ============================================================================

export const TimeRangeSchema = z.enum(["24h", "7d", "30d", "90d", "custom"]);
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const EnvironmentSchema = z.enum(["prod", "staging", "dev", "local"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const PaginationSchema = z.object({
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

// ============================================================================
// Overview Types (matches backend /api/admin/overview)
// ============================================================================

export const OverviewKpisSchema = z.object({
  dau: z.number().default(0),
  messages: z.number().default(0),
  conversationsCreated: z.number().default(0),
  uploads: z.number().default(0),
  allybiVisits: z.number().default(0),
  allybiClicks: z.number().default(0),
  allybiClickThroughRate: z.number().default(0),
  llmCalls: z.number().default(0),
  tokensTotal: z.number().default(0),
  llmErrorRate: z.number().default(0),
  weakEvidenceRate: z.number().default(0),
  noEvidenceRate: z.number().default(0),
  ingestionFailures: z.number().default(0),
  latencyMsP50: z.number().default(0),
  latencyMsP95: z.number().default(0),
});

export const TimeSeriesPointSchema = z.object({
  t: z.string().optional(),
  timestamp: z.string().optional(),
  value: z.number(),
});

export const OverviewTimeseriesMetricSchema = z.enum([
  "dau",
  "messages",
  "uploads",
  "allybi_visits",
  "allybi_clicks",
  "tokens",
  "weak_evidence_rate",
  "llm_errors",
  "ingestion_failures",
]);

export const OverviewWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const GoogleCloudSqlSchema = z.object({
  connected: z.boolean().default(false),
  latencyMs: z.number().nullable().default(null),
  activeConnections: z.number().default(0),
  databaseSizeBytes: z.number().nullable().default(null),
  error: z.string().nullable().default(null),
});

export const GoogleCloudRunServiceSchema = z.object({
  service: z.string(),
  calls: z.number().default(0),
  errors: z.number().default(0),
  errorRate: z.number().default(0),
  p95LatencyMs: z.number().default(0),
});

export const GoogleCloudRunSchema = z.object({
  calls: z.number().default(0),
  errors: z.number().default(0),
  errorRate: z.number().default(0),
  p95LatencyMs: z.number().default(0),
  services: z.array(GoogleCloudRunServiceSchema).default([]),
});

export const GoogleGeminiModelSchema = z.object({
  model: z.string(),
  calls: z.number().default(0),
  errors: z.number().default(0),
  errorRate: z.number().default(0),
  p95LatencyMs: z.number().default(0),
  tokens: z.number().default(0),
});

export const GoogleGeminiSchema = z.object({
  calls: z.number().default(0),
  errors: z.number().default(0),
  errorRate: z.number().default(0),
  p95LatencyMs: z.number().default(0),
  tokens: z.number().default(0),
  estimatedCostUsd: z.number().default(0),
  models: z.array(GoogleGeminiModelSchema).default([]),
});

export const GoogleOcrSchema = z.object({
  docsProcessed: z.number().default(0),
  ocrUsed: z.number().default(0),
  ocrCoverageRate: z.number().default(0),
  avgConfidence: z.number().default(0),
  failures: z.number().default(0),
});

export const GoogleMetricsSchema = z.object({
  cloudSql: GoogleCloudSqlSchema.optional(),
  cloudRun: GoogleCloudRunSchema.optional(),
  gemini: GoogleGeminiSchema.optional(),
  ocr: GoogleOcrSchema.optional(),
});

export const OverviewResponseSchema = z.object({
  kpis: OverviewKpisSchema,
  window: OverviewWindowSchema.optional(),
  google: GoogleMetricsSchema.optional(),
  pagination: PaginationSchema.optional(),
});

export const OverviewTimeseriesResponseSchema = z.object({
  metric: OverviewTimeseriesMetricSchema,
  points: z.array(TimeSeriesPointSchema).default([]),
  pagination: PaginationSchema.optional(),
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
export type OverviewKpis = z.infer<typeof OverviewKpisSchema>;
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;
export type OverviewTimeseriesMetric = z.infer<typeof OverviewTimeseriesMetricSchema>;
export type OverviewTimeseriesResponse = z.infer<typeof OverviewTimeseriesResponseSchema>;

// ============================================================================
// Users Types (matches backend /api/admin/users)
// ============================================================================

export const UserSchema = z.object({
  userId: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  messages: z.number().default(0),
  uploads: z.number().default(0),
  llmCalls: z.number().default(0),
  tokensTotal: z.number().default(0),
  llmErrorRate: z.number().default(0),
  weakEvidenceRate: z.number().default(0),
  // Optional fields from detail endpoint
  email: z.string().optional(),
  role: z.string().optional(),
  conversationsCount: z.number().optional(),
  sessionsCount: z.number().optional(),
  topIntents: z.array(z.object({ intent: z.string(), count: z.number() })).optional(),
  topDomains: z.array(z.object({ domain: z.string(), count: z.number() })).optional(),
});

export const UserDetailSchema = z.object({
  user: UserSchema,
});

export const UsersResponseSchema = z.object({
  users: z.array(UserSchema),
  pagination: PaginationSchema,
});

export type UsersResponse = z.infer<typeof UsersResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type UserDetail = z.infer<typeof UserDetailSchema>;

// ============================================================================
// Files Types (matches backend /api/admin/files)
// ============================================================================

export const FileStatusSchema = z.enum(["uploaded", "enriching", "ready", "failed"]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const FileSchema = z.object({
  documentId: z.string(),
  filename: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().default(0),
  uploadedAt: z.string(),
  statusOk: z.boolean().default(false),
  statusFail: z.boolean().default(false),
  extractionMethod: z.string().nullable(),
  chunkCountAvg: z.number().default(0),
  durationMsAvg: z.number().default(0),
});

export const FileDetailEventSchema = z.object({
  at: z.string(),
  status: z.string(),
  errorCode: z.string().nullable(),
  durationMs: z.number().nullable(),
});

export const FileDetailStatsSchema = z.object({
  totalEvents: z.number().default(0),
  successCount: z.number().default(0),
  failCount: z.number().default(0),
  avgDurationMs: z.number().default(0),
  totalChunks: z.number().default(0),
});

export const FileDetailSchema = z.object({
  events: z.array(FileDetailEventSchema),
  stats: FileDetailStatsSchema,
});

export const FileCountsSchema = z.object({
  total: z.number().default(0),
  ready: z.number().default(0),
  failed: z.number().default(0),
  processing: z.number().default(0),
});

export const FilesResponseSchema = z.object({
  files: z.array(FileSchema),
  pagination: PaginationSchema,
  counts: FileCountsSchema.optional(),
  google: z.object({ ocr: GoogleOcrSchema.optional() }).optional(),
});

export type FilesResponse = z.infer<typeof FilesResponseSchema>;
export type FileRecord = z.infer<typeof FileSchema>;
export type FileDetail = z.infer<typeof FileDetailSchema>;
export type FileCounts = z.infer<typeof FileCountsSchema>;

// ============================================================================
// Queries Types (matches backend /api/admin/queries)
// ============================================================================

export const QueryTelemetrySchema = z.object({
  at: z.string(),
  userId: z.string(),
  intent: z.string(),
  operator: z.string(),
  domain: z.string(),
  docLockEnabled: z.boolean().default(false),
  strategy: z.string(),
  evidenceStrength: z.number().nullable(),
  refined: z.boolean().nullable(),
  fallbackReasonCode: z.string().nullable(),
  sourcesCount: z.number().nullable(),
  navPillsUsed: z.boolean().nullable(),
  traceId: z.string(),
  turnId: z.string().nullable(),
  conversationId: z.string().nullable(),
  tokensTotal: z.number().nullable(),
  cost: z.number().nullable(),
  keywords: z.array(z.string()).default([]),
  patternKey: z.string().nullable(),
});

export const QueryTelemetryDetailSchema = QueryTelemetrySchema;

export const QueriesResponseSchema = z.object({
  queries: z.array(QueryTelemetrySchema),
  pagination: PaginationSchema,
});

export type QueriesResponse = z.infer<typeof QueriesResponseSchema>;
export type QueryTelemetry = z.infer<typeof QueryTelemetrySchema>;
export type QueryTelemetryDetail = z.infer<typeof QueryTelemetryDetailSchema>;

// ============================================================================
// Answer Quality Types (placeholder - backend endpoint may not exist)
// ============================================================================

export const AnswerQualityResponseSchema = z.object({
  pagination: PaginationSchema.optional(),
}).passthrough();

export type AnswerQualityResponse = z.infer<typeof AnswerQualityResponseSchema>;

// ============================================================================
// LLM Cost Types (matches backend /api/admin/llm-cost)
// ============================================================================

export const LLMCallRowSchema = z.object({
  at: z.string(),
  userId: z.string(),
  provider: z.string(),
  model: z.string(),
  stage: z.string(),
  status: z.string(),
  errorCode: z.string().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
  firstTokenMs: z.number().nullable(),
  durationMs: z.number().nullable(),
  traceId: z.string(),
  turnId: z.string().nullable(),
});

export const ProviderSummarySchema = z.object({
  provider: z.string(),
  calls: z.number(),
  tokens: z.number(),
  errorRate: z.number(),
  latencyP50: z.number(),
});

export const ModelSummarySchema = z.object({
  model: z.string(),
  calls: z.number(),
  tokens: z.number(),
  errorRate: z.number(),
  latencyP50: z.number(),
});

export const StageSummarySchema = z.object({
  stage: z.string(),
  calls: z.number(),
  tokens: z.number(),
  errorRate: z.number(),
  latencyP50: z.number(),
});

export const LLMSummarySchema = z.object({
  calls: z.number().default(0),
  tokensTotal: z.number().default(0),
  avgTokensPerCall: z.number().default(0),
  latencyMsP50: z.number().default(0),
  latencyMsP95: z.number().default(0),
  errorRate: z.number().default(0),
  byProvider: z.array(ProviderSummarySchema).default([]),
  byModel: z.array(ModelSummarySchema).default([]),
  byStage: z.array(StageSummarySchema).default([]),
});

export const LLMCostResponseSchema = z.object({
  llmCalls: z.array(LLMCallRowSchema).optional(),
  summary: LLMSummarySchema.optional(),
  google: z.object({ gemini: GoogleGeminiSchema.optional() }).optional(),
  pagination: PaginationSchema.optional(),
});

export type LLMCostResponse = z.infer<typeof LLMCostResponseSchema>;
export type LLMCallRow = z.infer<typeof LLMCallRowSchema>;
export type LLMSummary = z.infer<typeof LLMSummarySchema>;

// ============================================================================
// Reliability Types (matches backend /api/admin/reliability)
// ============================================================================

export const ErrorRowSchema = z.object({
  at: z.string(),
  userId: z.string(),
  provider: z.string(),
  model: z.string(),
  stage: z.string(),
  errorCode: z.string().nullable(),
  traceId: z.string(),
  turnId: z.string().nullable(),
});

export const IngestionFailureRowSchema = z.object({
  at: z.string(),
  userId: z.string(),
  documentId: z.string().nullable(),
  filename: z.string().nullable(),
  mimeType: z.string().nullable(),
  errorCode: z.string().nullable(),
  extractionMethod: z.string().nullable(),
});

export const ReliabilityTimeseriesPointSchema = z.object({
  t: z.string(),
  value: z.number(),
});

export const ReliabilityResponseSchema = z.object({
  errors: z.array(ErrorRowSchema).optional(),
  ingestionFailures: z.array(IngestionFailureRowSchema).optional(),
  points: z.array(ReliabilityTimeseriesPointSchema).optional(),
  google: z.object({
    cloudRun: GoogleCloudRunSchema.optional(),
    cloudSql: GoogleCloudSqlSchema.optional(),
  }).optional(),
  pagination: PaginationSchema.optional(),
});

export type ReliabilityResponse = z.infer<typeof ReliabilityResponseSchema>;
export type ErrorRow = z.infer<typeof ErrorRowSchema>;
export type IngestionFailureRow = z.infer<typeof IngestionFailureRowSchema>;

// ============================================================================
// Security Types (matches backend /api/admin/security)
// ============================================================================

export const SecurityCountersSchema = z.object({
  privacyBlocks: z.number().default(0),
  redactions: z.number().default(0),
  failedAuth: z.number().default(0),
  accessDenied: z.number().default(0),
});

export const SecurityEventRowSchema = z.object({
  at: z.string(),
  userId: z.string().nullable(),
  action: z.string(),
  resource: z.string().nullable(),
  status: z.string(),
  ipAddress: z.string().nullable(),
  details: z.string().nullable(),
});

export const SecurityResponseSchema = z.object({
  counters: SecurityCountersSchema.optional(),
  events: z.array(SecurityEventRowSchema).optional(),
  google: z.object({ cloudSql: GoogleCloudSqlSchema.optional() }).optional(),
  pagination: PaginationSchema.optional(),
});

export type SecurityResponse = z.infer<typeof SecurityResponseSchema>;
export type SecurityCounters = z.infer<typeof SecurityCountersSchema>;
export type SecurityEventRow = z.infer<typeof SecurityEventRowSchema>;

// ============================================================================
// Live (Realtime) Types
// ============================================================================

export const LiveEventCategorySchema = z.enum(["retrieval", "llm", "security", "files", "system"]);
export type LiveEventCategory = z.infer<typeof LiveEventCategorySchema>;

export const LiveEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  category: LiveEventCategorySchema,
  type: z.string(),
  severity: SeveritySchema,
  summary: z.string(),
  correlationId: z.string().nullable(),
  userId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});

export type LiveEvent = z.infer<typeof LiveEventSchema>;

// ============================================================================
// System Health Types
// ============================================================================

export const SystemHealthSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  services: z.array(z.object({
    name: z.string(),
    status: z.enum(["up", "down", "degraded"]),
    latencyMs: z.number().nullable(),
    lastCheck: z.string(),
  })),
  lastUpdated: z.string(),
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// ============================================================================
// Global Search Types
// ============================================================================

export const SearchResultSchema = z.object({
  type: z.enum(["user", "conversation", "document", "query"]),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  timestamp: z.string().nullable(),
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
