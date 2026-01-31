/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * analytics/types.ts (Koda)
 * ------------------------
 * Typed KPI response contracts used by:
 *  - analytics aggregators
 *  - admin services + serializers
 *
 * Keep these stable: frontend relies on these shapes.
 */

export type TimeBucket = "hour" | "day";

export interface DateRange {
  from: string; // ISO (inclusive)
  to: string;   // ISO (exclusive)
}

export interface SeriesPoint {
  t: string; // ISO string bucket start
  v: number;
}

export interface MultiSeriesPoint {
  t: string;
  values: Record<string, number>;
}

export interface HealthBadge {
  status: "ok" | "warn" | "error";
  reason?: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface OverviewKpis {
  totalUsers?: number;
  activeUsers?: number;

  totalDocuments?: number;
  documentsReady?: number;
  documentsFailed?: number;

  totalConversations?: number;
  totalMessages?: number;

  totalRagQueries?: number;

  errorRate?: number;
  fallbackRate?: number;

  totalCostUsd?: number;
  totalTokens?: number;

  avgTtftMs?: number;
  avgTotalMs?: number;
}

export interface OverviewResponse {
  range: DateRange;
  kpis: OverviewKpis;
  badges?: HealthBadge[];

  series?: {
    messages?: SeriesPoint[];
    ragQueries?: SeriesPoint[];
    errors?: SeriesPoint[];
    costUsd?: SeriesPoint[];
    ttftMs?: SeriesPoint[];
    totalMs?: SeriesPoint[];
  };

  topIssues?: {
    failureCategories?: Array<{ key: string; count: number }>;
    fallbackScenarios?: Array<{ key: string; count: number }>;
    languageMismatches?: Array<{ key: string; count: number }>;
    formattingViolations?: Array<{ key: string; count: number }>;
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QueryRow {
  id: string;
  ts: string;
  userId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;

  intent?: string | null;
  confidence?: number | null;
  domain?: string | null;
  answerMode?: string | null;

  retrievalMethod?: string | null;
  distinctDocs?: number | null;
  chunksReturned?: number | null;

  ttftMs?: number | null;
  totalMs?: number | null;

  hadFallback?: boolean | null;
  hasErrors?: boolean | null;

  failureCategory?: string | null;
}

export interface QueriesResponse {
  range: DateRange;
  page: CursorPage<QueryRow>;
  stats?: Record<string, any>;
}

export interface UserRow {
  id: string;
  email?: string | null;
  role?: string | null;
  tier?: string | null;
  createdAt?: string | null;
  lastActiveAt?: string | null;
  storageUsedBytes?: number | null;
}

export interface UsersResponse {
  range: DateRange;
  page: CursorPage<UserRow>;
  stats?: Record<string, any>;
}

export interface FileRow {
  id: string;
  userId?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastQueriedAt?: string | null;
  previewStatus?: string | null;
}

export interface FilesResponse {
  range: DateRange;
  page: CursorPage<FileRow>;
  stats?: Record<string, any>;
}

export interface ReliabilityResponse {
  range: DateRange;
  kpis: {
    streamAbortedRate?: number;
    clientDisconnectRate?: number;
    avgTtftMs?: number;
    avgTotalMs?: number;
    p95TotalMs?: number;
    errorRate?: number;
    fallbackRate?: number;
  };
  badges?: HealthBadge[];
  series?: {
    ttftMs?: SeriesPoint[];
    totalMs?: SeriesPoint[];
    errors?: SeriesPoint[];
    aborts?: SeriesPoint[];
  };
}

export interface LlmCostResponse {
  range: DateRange;
  totals: {
    totalCostUsd: number;
    totalTokens: number;
  };
  byProvider?: Array<{ provider: string; costUsd: number; tokens: number }>;
  byModel?: Array<{ model: string; costUsd: number; tokens: number }>;
  page?: CursorPage<{
    id: string;
    ts: string;
    provider: string;
    model: string;
    requestType: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    latencyMs?: number | null;
    cached?: boolean | null;
  }>;
}

export interface SecurityResponse {
  range: DateRange;
  kpis: {
    suspiciousSessions?: number;
    rateLimitHits?: number;
    accessDenied?: number;
    failedLogins?: number;
  };
  page?: CursorPage<{
    id: string;
    ts: string;
    type: string;
    severity: string;
    userId?: string | null;
    ip?: string | null;
    meta?: any;
  }>;
}
