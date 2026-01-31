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
// Overview Types
// ============================================================================

export const OverviewKpisSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  documents: z.number(),
  conversations: z.number(),
  messages: z.number(),
  ragQueries: z.number(),
  errorRate: z.number(),
  costUsd: z.number(),
});

export const TimeSeriesPointSchema = z.object({
  timestamp: z.string(),
  value: z.number(),
});

export const OverviewChartsSchema = z.object({
  messagesOverTime: z.array(TimeSeriesPointSchema),
  ragQueriesOverTime: z.array(TimeSeriesPointSchema),
  errorCountOverTime: z.array(TimeSeriesPointSchema),
  costOverTime: z.array(TimeSeriesPointSchema),
});

export const TopIssueSchema = z.object({
  category: z.string(),
  count: z.number(),
  percentage: z.number(),
  trend: z.enum(["up", "down", "stable"]),
});

export const TopIssuesSchema = z.object({
  failureCategories: z.array(TopIssueSchema),
  fallbackScenarios: z.array(TopIssueSchema),
  languageMismatches: z.array(TopIssueSchema),
});

export const RecentQuerySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  userId: z.string(),
  userEmail: z.string().nullable(),
  intent: z.string(),
  domain: z.string(),
  answerMode: z.string(),
  retrievalMethod: z.string(),
  ttftMs: z.number(),
  totalMs: z.number(),
  hadFallback: z.boolean(),
  hasErrors: z.boolean(),
});

export const OverviewResponseSchema = z.object({
  kpis: OverviewKpisSchema,
  charts: OverviewChartsSchema,
  topIssues: TopIssuesSchema,
  recentQueries: z.array(RecentQuerySchema),
  pagination: PaginationSchema,
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
export type OverviewKpis = z.infer<typeof OverviewKpisSchema>;
export type TopIssue = z.infer<typeof TopIssueSchema>;
export type RecentQuery = z.infer<typeof RecentQuerySchema>;

// ============================================================================
// Users Types
// ============================================================================

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  tier: z.string().nullable(),
  role: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string().nullable(),
  storageUsedBytes: z.number(),
  conversationsCount: z.number(),
  documentsCount: z.number(),
});

export const UserConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  messagesCount: z.number(),
  createdAt: z.string(),
  lastMessageAt: z.string(),
});

export const UserQueryTelemetrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  query: z.string(),
  intent: z.string(),
  domain: z.string(),
  ttftMs: z.number(),
  totalMs: z.number(),
  hadFallback: z.boolean(),
  hasErrors: z.boolean(),
});

export const UserTokenUsageSchema = z.object({
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
});

export const UserDetailSchema = z.object({
  user: UserSchema,
  recentConversations: z.array(UserConversationSchema),
  recentQueries: z.array(UserQueryTelemetrySchema),
  tokenUsage: z.array(UserTokenUsageSchema),
});

export const UsersResponseSchema = z.object({
  users: z.array(UserSchema),
  pagination: PaginationSchema,
});

export type UsersResponse = z.infer<typeof UsersResponseSchema>;
export type User = z.infer<typeof UserSchema>;
export type UserDetail = z.infer<typeof UserDetailSchema>;
export type UserConversation = z.infer<typeof UserConversationSchema>;
export type UserQueryTelemetry = z.infer<typeof UserQueryTelemetrySchema>;
export type UserTokenUsage = z.infer<typeof UserTokenUsageSchema>;

// ============================================================================
// Files Types
// ============================================================================

export const FileStatusSchema = z.enum(["uploaded", "enriching", "ready", "failed"]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const FileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  status: FileStatusSchema,
  sizeBytes: z.number(),
  createdAt: z.string(),
  lastQueriedAt: z.string().nullable(),
  userId: z.string(),
  userEmail: z.string().nullable(),
  folderId: z.string().nullable(),
  folderName: z.string().nullable(),
});

export const FileHealthSchema = z.object({
  processingSuccessRate: z.number(),
  avgProcessingTimeMs: z.number(),
  totalProcessed: z.number(),
  totalFailed: z.number(),
  queuedCount: z.number(),
});

export const FileDetailSchema = z.object({
  file: FileSchema,
  extractionMethod: z.string(),
  ocrConfidence: z.number().nullable(),
  chunksCount: z.number(),
  embeddingsStatus: z.enum(["pending", "processing", "completed", "failed"]),
  previewPdfStatus: z.enum(["pending", "processing", "completed", "failed", "not_applicable"]).nullable(),
  slidesGenerated: z.number().nullable(),
  recentQueries: z.array(z.object({
    id: z.string(),
    timestamp: z.string(),
    query: z.string(),
    userId: z.string(),
    userEmail: z.string().nullable(),
  })),
});

export const FilesResponseSchema = z.object({
  files: z.array(FileSchema),
  health: FileHealthSchema,
  pagination: PaginationSchema,
});

export type FilesResponse = z.infer<typeof FilesResponseSchema>;
export type FileRecord = z.infer<typeof FileSchema>;
export type FileHealth = z.infer<typeof FileHealthSchema>;
export type FileDetail = z.infer<typeof FileDetailSchema>;

// ============================================================================
// Queries (QueryTelemetry) Types
// ============================================================================

export const QueryTelemetrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  conversationId: z.string(),
  userId: z.string(),
  userEmail: z.string().nullable(),
  query: z.string(),
  
  // Intent classification
  intent: z.string(),
  intentConfidence: z.number(),
  domain: z.string(),
  keywords: z.array(z.string()),
  
  // Retrieval
  retrievalMethod: z.string(),
  chunksReturned: z.number(),
  distinctDocs: z.number(),
  topScore: z.number(),
  avgScore: z.number(),
  
  // Evidence gate
  evidenceGateAction: z.string(),
  evidenceGateReason: z.string().nullable(),
  
  // Formatting
  formattingPassed: z.boolean(),
  formatScore: z.number().nullable(),
  formatViolations: z.array(z.string()),
  
  // Streaming health
  ttftMs: z.number(),
  totalMs: z.number(),
  chunksSent: z.number(),
  aborted: z.boolean(),
  clientDisconnected: z.boolean(),
  
  // Token/cost
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
  provider: z.string(),
  model: z.string(),
  
  // Flags
  hadFallback: z.boolean(),
  fallbackScenario: z.string().nullable(),
  hasErrors: z.boolean(),
  errorMessages: z.array(z.string()),
  languageMismatch: z.boolean(),
});

export const QueryTelemetryDetailSchema = z.object({
  telemetry: QueryTelemetrySchema,
  intentClassification: z.object({
    rawIntent: z.string(),
    confidence: z.number(),
    alternativeIntents: z.array(z.object({
      intent: z.string(),
      confidence: z.number(),
    })),
    domain: z.string(),
    keywords: z.array(z.string()),
    languageDetected: z.string(),
  }),
  retrieval: z.object({
    method: z.string(),
    chunksReturned: z.number(),
    distinctDocs: z.number(),
    topScore: z.number(),
    avgScore: z.number(),
    minScore: z.number(),
    retrievalTimeMs: z.number(),
    reranked: z.boolean(),
    filters: z.record(z.string(), z.unknown()),
  }),
  evidenceGate: z.object({
    action: z.string(),
    reason: z.string().nullable(),
    threshold: z.number(),
    actualScore: z.number(),
    violations: z.array(z.string()),
  }),
  formatting: z.object({
    passed: z.boolean(),
    score: z.number().nullable(),
    violations: z.array(z.string()),
    answerMode: z.string(),
    hasTitle: z.boolean(),
    hasBullets: z.boolean(),
    hasBolding: z.boolean(),
    hasSources: z.boolean(),
  }),
  streamingHealth: z.object({
    ttftMs: z.number(),
    totalMs: z.number(),
    chunksSent: z.number(),
    avgChunkIntervalMs: z.number(),
    aborted: z.boolean(),
    clientDisconnected: z.boolean(),
    errorsDuringStream: z.array(z.string()),
  }),
  tokenCost: z.object({
    provider: z.string(),
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalCostUsd: z.number(),
    cached: z.boolean(),
    latencyMs: z.number(),
  }),
});

export const QueriesResponseSchema = z.object({
  queries: z.array(QueryTelemetrySchema),
  pagination: PaginationSchema,
});

export type QueriesResponse = z.infer<typeof QueriesResponseSchema>;
export type QueryTelemetry = z.infer<typeof QueryTelemetrySchema>;
export type QueryTelemetryDetail = z.infer<typeof QueryTelemetryDetailSchema>;

// ============================================================================
// Answer Quality Types
// ============================================================================

export const FormatScoreBucketSchema = z.object({
  bucket: z.string(),
  count: z.number(),
  percentage: z.number(),
});

export const FormatViolationSchema = z.object({
  violation: z.string(),
  count: z.number(),
  percentage: z.number(),
  examples: z.array(z.string()),
});

export const HallucinationIndicatorsSchema = z.object({
  ungroundedClaimsRate: z.number(),
  sourcesMissingRate: z.number(),
  avgSourcesPerAnswer: z.number(),
  totalAnswersAnalyzed: z.number(),
});

export const BadQualityExampleSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  query: z.string(),
  issue: z.string(),
  formatScore: z.number().nullable(),
  violations: z.array(z.string()),
});

export const AnswerQualityResponseSchema = z.object({
  formatScoreDistribution: z.array(FormatScoreBucketSchema),
  topViolations: z.array(FormatViolationSchema),
  hallucinationIndicators: HallucinationIndicatorsSchema,
  badQualityExamples: z.array(BadQualityExampleSchema),
  pagination: PaginationSchema,
});

export type AnswerQualityResponse = z.infer<typeof AnswerQualityResponseSchema>;
export type FormatScoreBucket = z.infer<typeof FormatScoreBucketSchema>;
export type FormatViolation = z.infer<typeof FormatViolationSchema>;
export type HallucinationIndicators = z.infer<typeof HallucinationIndicatorsSchema>;
export type BadQualityExample = z.infer<typeof BadQualityExampleSchema>;

// ============================================================================
// LLM Cost Types
// ============================================================================

export const ProviderCostSchema = z.object({
  provider: z.string(),
  totalCostUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  callCount: z.number(),
  avgCostPerCall: z.number(),
});

export const ModelCostSchema = z.object({
  provider: z.string(),
  model: z.string(),
  totalCostUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  callCount: z.number(),
  avgLatencyMs: z.number(),
});

export const TokenUsageEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  provider: z.string(),
  model: z.string(),
  requestType: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
  latencyMs: z.number(),
  cached: z.boolean(),
  userId: z.string().nullable(),
  conversationId: z.string().nullable(),
});

export const LLMCostKpisSchema = z.object({
  totalCostUsd: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  avgCostPerQuery: z.number(),
  totalCalls: z.number(),
  cacheHitRate: z.number(),
});

export const LLMCostResponseSchema = z.object({
  kpis: LLMCostKpisSchema,
  costByProvider: z.array(ProviderCostSchema),
  costByModel: z.array(ModelCostSchema),
  tokenUsageEntries: z.array(TokenUsageEntrySchema),
  costOverTime: z.array(TimeSeriesPointSchema),
  pagination: PaginationSchema,
});

export type LLMCostResponse = z.infer<typeof LLMCostResponseSchema>;
export type LLMCostKpis = z.infer<typeof LLMCostKpisSchema>;
export type ProviderCost = z.infer<typeof ProviderCostSchema>;
export type ModelCost = z.infer<typeof ModelCostSchema>;
export type TokenUsageEntry = z.infer<typeof TokenUsageEntrySchema>;

// ============================================================================
// Reliability Types
// ============================================================================

export const QueueHealthSchema = z.object({
  queueName: z.string(),
  queued: z.number(),
  running: z.number(),
  failed: z.number(),
  completed: z.number(),
  avgProcessingTimeMs: z.number(),
});

export const SSEHealthSchema = z.object({
  avgTtftMs: z.number(),
  avgChunksSent: z.number(),
  abortedRate: z.number(),
  clientDisconnectedRate: z.number(),
  totalStreams: z.number(),
  errorRate: z.number(),
});

export const EndpointPerformanceSchema = z.object({
  endpoint: z.string(),
  method: z.string(),
  p50Ms: z.number(),
  p95Ms: z.number(),
  p99Ms: z.number(),
  requestCount: z.number(),
  errorRate: z.number(),
});

export const ErrorLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  service: z.string(),
  errorType: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  severity: SeveritySchema,
  userId: z.string().nullable(),
  correlationId: z.string().nullable(),
  resolved: z.boolean(),
});

export const ReliabilityResponseSchema = z.object({
  queueHealth: z.array(QueueHealthSchema),
  sseHealth: SSEHealthSchema,
  endpointPerformance: z.array(EndpointPerformanceSchema),
  errorLogs: z.array(ErrorLogEntrySchema),
  pagination: PaginationSchema,
});

export type ReliabilityResponse = z.infer<typeof ReliabilityResponseSchema>;
export type QueueHealth = z.infer<typeof QueueHealthSchema>;
export type SSEHealth = z.infer<typeof SSEHealthSchema>;
export type EndpointPerformance = z.infer<typeof EndpointPerformanceSchema>;
export type ErrorLogEntry = z.infer<typeof ErrorLogEntrySchema>;

// ============================================================================
// Security Types
// ============================================================================

export const AuthEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: z.enum(["login", "logout", "2fa_enabled", "2fa_disabled", "password_change", "failed_login"]),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  ipAddress: z.string(),
  userAgent: z.string().nullable(),
  success: z.boolean(),
  failureReason: z.string().nullable(),
});

export const SuspiciousSessionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  ipAddress: z.string(),
  reason: z.string(),
  riskScore: z.number(),
  blocked: z.boolean(),
});

export const RateLimitHitSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  endpoint: z.string(),
  ipAddress: z.string(),
  userId: z.string().nullable(),
  limiterName: z.string(),
  limitValue: z.number(),
  currentValue: z.number(),
});

export const EncryptionPostureSchema = z.object({
  masterKeyExists: z.boolean(),
  masterKeyEncrypted: z.boolean(),
  tenantKeysCount: z.number(),
  encryptedDocumentsCount: z.number(),
  unencryptedDocumentsCount: z.number(),
  lastKeyRotation: z.string().nullable(),
});

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  action: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  ipAddress: z.string(),
  status: z.enum(["success", "failure"]),
  details: z.record(z.string(), z.unknown()).nullable(),
});

export const SecurityKpisSchema = z.object({
  totalAuthEvents: z.number(),
  failedLoginAttempts: z.number(),
  suspiciousSessions: z.number(),
  rateLimitHits: z.number(),
  twoFactorEnabledUsers: z.number(),
  totalUsers: z.number(),
});

export const SecurityResponseSchema = z.object({
  kpis: SecurityKpisSchema,
  encryptionPosture: EncryptionPostureSchema,
  authEvents: z.array(AuthEventSchema),
  suspiciousSessions: z.array(SuspiciousSessionSchema),
  rateLimitHits: z.array(RateLimitHitSchema),
  auditLog: z.array(AuditLogEntrySchema),
  pagination: PaginationSchema,
});

export type SecurityResponse = z.infer<typeof SecurityResponseSchema>;
export type SecurityKpis = z.infer<typeof SecurityKpisSchema>;
export type AuthEvent = z.infer<typeof AuthEventSchema>;
export type SuspiciousSession = z.infer<typeof SuspiciousSessionSchema>;
export type RateLimitHit = z.infer<typeof RateLimitHitSchema>;
export type EncryptionPosture = z.infer<typeof EncryptionPostureSchema>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

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
