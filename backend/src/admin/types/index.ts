/**
 * Admin Types Barrel Export
 * All Zod schemas and TypeScript types for admin API responses
 */

// ============================================================================
// Base Types & Schemas
// ============================================================================
export {
  // Enums
  RangeSchema,
  CacheStatusSchema,
  SeveritySchema,
  FileStatusSchema,
  PreviewStatusSchema,
  FileFormatSchema,
  DomainSchema,
  type Range,
  type CacheStatus,
  type Severity,
  type FileStatus,
  type PreviewStatus,
  type FileFormat,
  type Domain,

  // Validators
  isoDateStringSchema,

  // Meta
  MetaSchema,
  type Meta,

  // Response Factory
  createResponseSchema,

  // Common Schemas
  DayValuePointSchema,
  UserIdentitySchema,
  type DayValuePoint,
  type UserIdentity,
} from "./_base";

// ============================================================================
// Overview Types
// ============================================================================
export {
  OverviewKpisSchema,
  QueriesByDomainPointSchema,
  CostPerDayPointSchema as OverviewCostPerDayPointSchema,
  OverviewChartsSchema,
  RecentErrorSchema,
  OverviewDataSchema,
  OverviewResponseSchema,
  type OverviewKpis,
  type QueriesByDomainPoint as OverviewQueriesByDomainPoint,
  type CostPerDayPoint as OverviewCostPerDayPoint,
  type OverviewCharts,
  type RecentError,
  type OverviewData,
  type OverviewResponse,
} from "./overview.types";

// ============================================================================
// User Types
// ============================================================================
export {
  UserRowSchema,
  UserActivityPointSchema,
  UserChartsSchema,
  UsersDataSchema,
  UsersResponseSchema,
  type UserRow,
  type UserActivityPoint,
  type UserCharts,
  type UsersData,
  type UsersResponse,
} from "./user.types";

// ============================================================================
// File Types
// ============================================================================
export {
  FileRowSchema,
  UploadsByTypePointSchema,
  ProcessingSuccessPointSchema,
  AvgProcessingMsByTypeSchema,
  FileChartsSchema,
  FilesDataSchema,
  FilesResponseSchema,
  type FileRow,
  type UploadsByTypePoint,
  type ProcessingSuccessPoint,
  type AvgProcessingMsByType,
  type FileCharts,
  type FilesData,
  type FilesResponse,
} from "./file.types";

// ============================================================================
// Query Types
// ============================================================================
export {
  QueryKpisSchema,
  QueriesByDomainPointSchema as QueryByDomainPointSchema,
  DomainValuePointSchema,
  FallbackRateByDomainSchema,
  QueryChartsSchema,
  QueryFeedItemSchema,
  QueriesDataSchema,
  QueriesResponseSchema,
  type QueryKpis,
  type QueriesByDomainPoint,
  type DomainValuePoint,
  type FallbackRateByDomain,
  type QueryCharts,
  type QueryFeedItem,
  type QueriesData,
  type QueriesResponse,
} from "./query.types";

// ============================================================================
// LLM Types
// ============================================================================
export {
  LlmKpisSchema,
  CostPerDayPointSchema,
  CostByModelPointSchema,
  LlmChartsSchema,
  LlmCallRowSchema,
  LlmCostDataSchema,
  LlmCostResponseSchema,
  type LlmKpis,
  type CostPerDayPoint,
  type CostByModelPoint,
  type LlmCharts,
  type LlmCallRow,
  type LlmCostData,
  type LlmCostResponse,
} from "./llm.types";

// ============================================================================
// Reliability Types
// ============================================================================
export {
  ReliabilityKpisSchema,
  LatencyPointSchema,
  JobFailurePointSchema,
  ReliabilityChartsSchema,
  ErrorRowSchema,
  ReliabilityDataSchema,
  ReliabilityResponseSchema,
  type ReliabilityKpis,
  type LatencyPoint,
  type JobFailurePoint,
  type ReliabilityCharts,
  type ErrorRow,
  type ReliabilityData,
  type ReliabilityResponse,
} from "./reliability.types";

// ============================================================================
// Security Types
// ============================================================================
export {
  SecurityKpisSchema,
  SecurityChartsSchema,
  AuthEventSchema,
  RateLimitEventSchema,
  AdminAuditEventSchema,
  SecurityDataSchema,
  SecurityResponseSchema,
  type SecurityKpis,
  type SecurityCharts,
  type AuthEvent,
  type RateLimitEvent,
  type AdminAuditEvent,
  type SecurityData,
  type SecurityResponse,
} from "./security.types";
