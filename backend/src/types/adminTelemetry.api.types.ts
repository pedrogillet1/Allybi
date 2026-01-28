// backend/src/types/adminTelemetry.api.types.ts
//
// Clean API response shapes for Admin Telemetry endpoints.
// - Used by controllers/app services for typed outputs
// - No user-facing microcopy
//
// These types intentionally mirror the aggregations layer outputs.

import type { TelemetryRange, LLMProviderKey, PipelineStage } from "../services/telemetry/telemetry.types";

/* ----------------------------- Common ----------------------------- */

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface TelemetryWindow {
  from: string; // ISO
  to: string;   // ISO
}

/* ----------------------------- Overview ----------------------------- */

export interface AdminOverviewData {
  range: TelemetryRange;
  window: TelemetryWindow;

  dau: number;
  messages: number;
  conversationsCreated: number;
  uploads: number;

  weakEvidenceRate: number;
  noEvidenceRate: number;

  llmCalls: number;
  tokensTotal: number;
  latencyMsP50: number | null;
  latencyMsP95: number | null;
  llmErrorRate: number;

  ingestionFailures: number;
}

export type AdminOverviewResponse = ApiOk<AdminOverviewData>;

/* ----------------------------- Users ----------------------------- */

export interface AdminUserRow {
  userId: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;

  messages: number;
  uploads: number;

  tokensTotal: number;
  llmCalls: number;
  llmErrorRate: number;

  weakEvidenceRate: number;
}

export interface AdminUsersData extends ApiPage<AdminUserRow> {
  range: TelemetryRange;
}
export type AdminUsersResponse = ApiOk<AdminUsersData>;

export interface AdminUserDetailData {
  range: TelemetryRange;
  user: AdminUserRow;
}
export type AdminUserDetailResponse = ApiOk<AdminUserDetailData>;

/* ----------------------------- Files ----------------------------- */

export interface AdminFileRow {
  documentId: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;

  uploadedAt: string | null;

  statusOk: number;
  statusFail: number;

  extractionMethod: string | null;
  chunkCountAvg: number | null;
  durationMsAvg: number | null;
}

export interface AdminFilesData extends ApiPage<AdminFileRow> {
  range: TelemetryRange;
}
export type AdminFilesResponse = ApiOk<AdminFilesData>;

export interface AdminFileDetailData {
  range: TelemetryRange;
  // Keep generic: depends on how much you expose
  events: any[];
}
export type AdminFileDetailResponse = ApiOk<AdminFileDetailData>;

/* ----------------------------- Queries / Quality ----------------------------- */

export interface AdminQueryRow {
  at: string;
  userId: string;

  intent: string;
  operator: string;
  domain: string;

  docLockEnabled: boolean;
  strategy: string;

  evidenceStrength: number | null;
  refined: boolean | null;

  fallbackReasonCode: string | null;
  sourcesCount: number | null;
  navPillsUsed: boolean | null;

  traceId: string;
  turnId: string | null;
  conversationId: string | null;
}

export interface AdminQueriesData extends ApiPage<AdminQueryRow> {
  range: TelemetryRange;
}
export type AdminQueriesResponse = ApiOk<AdminQueriesData>;

export interface AdminQualityTotals {
  total: number;
  weak: number;
  none: number;
  weakRate: number;
  noneRate: number;
}

export interface AdminQualityData extends ApiPage<AdminQueryRow> {
  range: TelemetryRange;
  totals: AdminQualityTotals;
}
export type AdminQualityResponse = ApiOk<AdminQualityData>;

/* ----------------------------- LLM / Errors ----------------------------- */

export interface AdminLLMRow {
  at: string;
  userId: string;

  provider: LLMProviderKey | string;
  model: string;
  stage: PipelineStage | string;

  status: "ok" | "fail";
  errorCode: string | null;

  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;

  firstTokenMs: number | null;
  durationMs: number | null;

  traceId: string;
  turnId: string | null;
}

export interface AdminLLMData extends ApiPage<AdminLLMRow> {
  range: TelemetryRange;
}
export type AdminLLMResponse = ApiOk<AdminLLMData>;

export interface AdminErrorRow {
  at: string;
  userId: string;

  provider: string;
  model: string;
  stage: string;

  errorCode: string;
  traceId: string;
  turnId: string | null;
}

export interface AdminErrorsData extends ApiPage<AdminErrorRow> {
  range: TelemetryRange;
}
export type AdminErrorsResponse = ApiOk<AdminErrorsData>;

/* ----------------------------- Timeseries ----------------------------- */

export type TimeseriesMetric =
  | "dau"
  | "messages"
  | "uploads"
  | "tokens"
  | "weak_evidence_rate"
  | "llm_errors"
  | "ingestion_failures";

export interface TimeseriesPoint {
  t: string; // ISO bucket start
  value: number;
}

export interface AdminTimeseriesData {
  metric: TimeseriesMetric;
  range: TelemetryRange;
  points: TimeseriesPoint[];
}
export type AdminTimeseriesResponse = ApiOk<AdminTimeseriesData>;
