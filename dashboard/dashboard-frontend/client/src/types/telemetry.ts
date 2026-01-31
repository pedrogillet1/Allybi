import { z } from "zod";

// Time range type
export const TimeRangeSchema = z.enum(["24h", "7d", "30d", "90d"]);
export type TimeRange = z.infer<typeof TimeRangeSchema>;

// Severity type
export const SeveritySchema = z.enum(["low", "med", "high"]);
export type Severity = z.infer<typeof SeveritySchema>;

// File status type
export const FileStatusSchema = z.enum(["uploaded", "processing", "completed", "failed"]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

// Chart data point schemas
export const DayValueSchema = z.object({
  day: z.string(),
  value: z.number(),
});

export const DayValueUsdSchema = z.object({
  day: z.string(),
  valueUsd: z.number(),
});

export const LabelValueSchema = z.object({
  label: z.string(),
  value: z.number(),
});

export const LabelValueUsdSchema = z.object({
  label: z.string(),
  valueUsd: z.number(),
});

export const DomainValueSchema = z.object({
  domain: z.string(),
  value: z.number(),
});

// Overview Response
export const OverviewKpisSchema = z.object({
  activeUsers: z.number(),
  messages: z.number(),
  documents: z.number(),
  llmCostUsd: z.number(),
  weakEvidenceRate: z.number(),
  ttftAvgMs: z.number(),
});

export const OverviewChartsSchema = z.object({
  dau: z.array(DayValueSchema),
  queriesByDomain: z.array(z.object({
    day: z.string(),
    finance: z.number(),
    legal: z.number(),
    general: z.number(),
    other: z.number(),
  })),
  costPerDay: z.array(DayValueUsdSchema),
  weakEvidenceRatePerDay: z.array(DayValueSchema),
});

export const RecentErrorSchema = z.object({
  ts: z.string(),
  service: z.string(),
  type: z.string(),
  message: z.string(),
  severity: SeveritySchema,
});

export const OverviewResponseSchema = z.object({
  range: TimeRangeSchema,
  kpis: OverviewKpisSchema,
  charts: OverviewChartsSchema,
  recentErrors: z.array(RecentErrorSchema),
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
export type OverviewKpis = z.infer<typeof OverviewKpisSchema>;
export type RecentError = z.infer<typeof RecentErrorSchema>;

// Users Response
export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  tier: z.string().nullable().optional(),
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable().optional(),
  conversations7d: z.number(),
  documents7d: z.number(),
  storageBytes: z.number(),
});

export const UsersChartsSchema = z.object({
  newUsersPerDay: z.array(DayValueSchema),
  active: z.array(z.object({
    day: z.string(),
    dau: z.number(),
    wau: z.number(),
    mau: z.number(),
  })),
});

export const UsersResponseSchema = z.object({
  users: z.array(UserSchema),
  charts: UsersChartsSchema,
  total: z.number(),
});

export type UsersResponse = z.infer<typeof UsersResponseSchema>;
export type User = z.infer<typeof UserSchema>;

// Files Response
export const FileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string().nullable().optional(),
  encrypted: z.boolean(),
  sizeBytes: z.number(),
  format: z.string(),
  uploadedAt: z.string(),
  chunksCount: z.number(),
  status: FileStatusSchema,
});

export const FilesChartsSchema = z.object({
  uploadsByType: z.array(z.object({
    day: z.string(),
    pdf: z.number(),
    docx: z.number(),
    pptx: z.number(),
    xlsx: z.number(),
    img: z.number(),
    other: z.number(),
  })),
  processingSuccess: z.array(z.object({
    day: z.string(),
    completed: z.number(),
    failed: z.number(),
  })),
  avgProcessingMsByType: z.array(z.object({
    type: z.string(),
    valueMs: z.number(),
  })),
});

export const FilesResponseSchema = z.object({
  files: z.array(FileSchema),
  charts: FilesChartsSchema,
  total: z.number(),
});

export type FilesResponse = z.infer<typeof FilesResponseSchema>;
export type FileRecord = z.infer<typeof FileSchema>;

// Queries Response
export const QueriesKpisSchema = z.object({
  queries: z.number(),
  avgTopScore: z.number(),
  weakEvidenceCount: z.number(),
  weakEvidenceRate: z.number(),
});

export const QueriesChartsSchema = z.object({
  byDomain: z.array(z.object({
    day: z.string(),
    finance: z.number(),
    legal: z.number(),
    general: z.number(),
    other: z.number(),
  })),
  fallbackRateByDomain: z.array(DomainValueSchema),
  avgScoreByDomain: z.array(DomainValueSchema),
});

export const QueryFeedItemSchema = z.object({
  ts: z.string(),
  userEmail: z.string().nullable().optional(),
  query: z.string(),
  intent: z.string(),
  domain: z.string(),
  keywords: z.array(z.string()),
  result: z.string(),
  score: z.number(),
  fallbackUsed: z.boolean(),
  docScopeApplied: z.boolean(),
  chunksUsed: z.number(),
});

export const QueriesResponseSchema = z.object({
  kpis: QueriesKpisSchema,
  charts: QueriesChartsSchema,
  feed: z.array(QueryFeedItemSchema),
});

export type QueriesResponse = z.infer<typeof QueriesResponseSchema>;
export type QueryFeedItem = z.infer<typeof QueryFeedItemSchema>;

// Quality Response
export const QualityKpisSchema = z.object({
  weakEvidenceCases: z.number(),
  fallbackCount: z.number(),
  avgTopScore: z.number(),
});

export const QualityChartsSchema = z.object({
  scoreDistribution: z.array(z.object({
    bucket: z.string(),
    count: z.number(),
  })),
  weakEvidenceByDomain: z.array(DomainValueSchema),
  avgScorePerDay: z.array(DayValueSchema),
});

export const QualityCaseSchema = z.object({
  ts: z.string(),
  userEmail: z.string().nullable().optional(),
  query: z.string(),
  topScore: z.number(),
  chunks: z.number(),
  failureType: z.string(),
  gateAction: z.string(),
});

export const QualityResponseSchema = z.object({
  kpis: QualityKpisSchema,
  charts: QualityChartsSchema,
  cases: z.array(QualityCaseSchema),
});

export type QualityResponse = z.infer<typeof QualityResponseSchema>;
export type QualityCase = z.infer<typeof QualityCaseSchema>;

// LLM Response
export const LLMKpisSchema = z.object({
  costUsd: z.number(),
  totalTokens: z.number(),
  totalCalls: z.number(),
  avgLatencyMs: z.number(),
  errorRate: z.number(),
  recentErrors: z.number(),
});

export const LLMChartsSchema = z.object({
  costPerDay: z.array(DayValueUsdSchema),
  tokensPerDay: z.array(DayValueSchema),
  costByModel: z.array(LabelValueUsdSchema),
});

export const LLMCallSchema = z.object({
  ts: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens: z.number(),
  costUsd: z.number(),
  type: z.string(),
  latencyMs: z.number(),
  status: z.string(),
});

export const LLMResponseSchema = z.object({
  kpis: LLMKpisSchema,
  charts: LLMChartsSchema,
  calls: z.array(LLMCallSchema),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;
export type LLMCall = z.infer<typeof LLMCallSchema>;

// Reliability Response
export const ReliabilityKpisSchema = z.object({
  p50LatencyMs: z.number(),
  p95LatencyMs: z.number(),
  errorRate: z.number(),
  errorCount: z.number(),
  totalMessages: z.number(),
  activeUsers: z.number(),
});

export const ReliabilityChartsSchema = z.object({
  latency: z.array(z.object({
    day: z.string(),
    p50: z.number(),
    p95: z.number(),
  })),
  errorRate: z.array(DayValueSchema),
  jobFailures: z.array(LabelValueSchema),
});

export const ReliabilityErrorSchema = z.object({
  ts: z.string(),
  service: z.string(),
  type: z.string(),
  message: z.string(),
  severity: SeveritySchema,
  resolved: z.boolean(),
});

export const ReliabilityResponseSchema = z.object({
  kpis: ReliabilityKpisSchema,
  charts: ReliabilityChartsSchema,
  errors: z.array(ReliabilityErrorSchema),
});

export type ReliabilityResponse = z.infer<typeof ReliabilityResponseSchema>;
export type ReliabilityError = z.infer<typeof ReliabilityErrorSchema>;

// Security Response
export const SecurityKpisSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  authFailures: z.number(),
  rateLimitTriggers: z.number(),
});

export const SecurityChartsSchema = z.object({
  failedLoginsPerDay: z.array(DayValueSchema),
  rateLimitsPerDay: z.array(DayValueSchema),
  adminActionsPerDay: z.array(DayValueSchema),
});

export const AuthEventSchema = z.object({
  ts: z.string(),
  userEmail: z.string().nullable().optional(),
  event: z.string(),
  ipHash: z.string(),
  result: z.string(),
});

export const RateLimitEventSchema = z.object({
  ts: z.string(),
  route: z.string(),
  ipHash: z.string(),
  limiterName: z.string(),
});

export const AdminAuditSchema = z.object({
  ts: z.string(),
  admin: z.string(),
  action: z.string(),
  target: z.string(),
});

export const SecurityResponseSchema = z.object({
  kpis: SecurityKpisSchema,
  charts: SecurityChartsSchema,
  authEvents: z.array(AuthEventSchema),
  rateLimitEvents: z.array(RateLimitEventSchema),
  adminAudit: z.array(AdminAuditSchema),
});

export type SecurityResponse = z.infer<typeof SecurityResponseSchema>;
export type AuthEvent = z.infer<typeof AuthEventSchema>;
export type RateLimitEvent = z.infer<typeof RateLimitEventSchema>;
export type AdminAudit = z.infer<typeof AdminAuditSchema>;
