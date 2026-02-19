/**
 * Admin Dashboard Services
 * READ-ONLY analytics services for the admin dashboard
 *
 * All services accept a PrismaClient instance and return deterministic results.
 * If models are missing or DB has no data, services return zeros and empty arrays.
 */

// ============================================================================
// Shared Helpers
// ============================================================================
export {
  parseRange,
  previousWindow,
  normalizeRange,
  formatWindow,
  rangeToDays,
  rangeToHours,
  type RangeKey,
  type TimeWindow,
} from "./_shared/rangeWindow";

export {
  clampLimit,
  clampNumber,
  clampInt,
  bigIntToNumber,
  ensureNonNegative,
} from "./_shared/clamp";

export {
  encodeCursor,
  decodeCursor,
  decodeCursorWithTimestamp,
  buildCursorClause,
  processPage,
  processPageWithTimestamp,
} from "./_shared/pagination";

export {
  percentile,
  p50,
  p95,
  p99,
  calculatePercentiles,
  calculateStats,
} from "./_shared/percentiles";

export {
  supportsModel,
  getModel,
  safeQuery,
  safeCount,
  safeAggregate,
  safeFindFirst,
  safeFindUnique,
  getAvailableModels,
} from "./_shared/prismaAdapter";

// ============================================================================
// Overview Service
// ============================================================================
export {
  getOverview,
  getTimeseries,
  type OverviewKpis,
  type OverviewResult,
  type TimeseriesPoint,
  type TimeseriesResult,
} from "./overview.service";

// ============================================================================
// Users Service
// ============================================================================
export {
  listUsers,
  getUserDetail,
  type UserRow,
  type UserListResult,
  type UserDetailResult,
} from "./users.service";

// ============================================================================
// Files Service
// ============================================================================
export {
  listFiles,
  getFileDetail,
  type FileRow,
  type FileListResult,
  type FileDetailResult,
} from "./files.service";

// ============================================================================
// Queries Service
// ============================================================================
export {
  listQueries,
  type QueryRow,
  type QueryListResult,
  type ListQueriesParams,
} from "./queries.service";

// ============================================================================
// Answer Quality Service
// ============================================================================
export {
  getQuality,
  type QualityTotals,
  type QualityBreakdown,
  type QualityQueryRow,
  type QualityResult,
  type GetQualityParams,
} from "./answerQuality.service";

// ============================================================================
// LLM Cost Service
// ============================================================================
export {
  listLlmCalls,
  getLlmSummary,
  type AdminLLMRow,
  type LLMListResult,
  type LLMSummary,
  type LLMSummaryResult,
  type ProviderSummary,
  type ModelSummary,
  type StageSummary,
  type ListLLMCallsParams,
} from "./llmCost.service";

// ============================================================================
// Reliability Service
// ============================================================================
export {
  listErrors,
  listIngestionFailures,
  getReliabilityTimeseries,
  type ErrorRow,
  type ErrorListResult,
  type IngestionFailureRow,
  type IngestionFailureListResult,
  type ReliabilityTimeseriesPoint,
  type ReliabilityTimeseriesResult,
} from "./reliability.service";

// ============================================================================
// Security Service
// ============================================================================
export {
  getSecurity,
  type SecurityCounters,
  type SecurityEventRow,
  type SecurityResult,
} from "./security.service";

// ============================================================================
// Marketing Service
// ============================================================================
export {
  getDomains,
  getIntents,
  getKeywords,
  getPatterns,
  listInteractions,
  type DomainRow,
  type DomainsResult,
  type IntentRow,
  type IntentsResult,
  type KeywordRow,
  type KeywordsResult,
  type PatternRow,
  type PatternsResult,
  type InteractionRow,
  type InteractionsResult,
} from "./marketing.service";

// ============================================================================
// Live Service
// ============================================================================
export {
  getRecentEvents,
  initLiveRedis,
  type LiveEvent,
  type LiveEventsResult,
} from "./live.service";
