// backend/src/services/telemetry/telemetry.capture.ts
//
// Tiny, deterministic helper functions to create telemetry events from runtime signals.
// Purpose: keep call sites clean (controllers/services can call these helpers).
// - No user-facing microcopy
// - No network calls
// - Pure mapping + sane defaults
//
// Use pattern:
//   telemetry.logUsage(buildUsageEvent({...}))
//   telemetry.logModelCall(buildModelCall({...}))
//   telemetry.logRetrieval(buildRetrievalEvent({...}))
//   telemetry.logIngestion(buildIngestionEvent({...}))

import type {
  UsageEventCreate,
  ModelCallCreate,
  RetrievalEventCreate,
  IngestionEventCreate,
  TelemetryStatus,
  LLMProviderKey,
  PipelineStage,
  RetrievalStrategy,
  KodaOperator,
  KodaIntent,
  KodaDomain,
} from "./telemetry.types";

export function now(): Date {
  return new Date();
}

/* ----------------------------- Usage ----------------------------- */

export function buildUsageEvent(params: {
  userId: string;
  tenantId?: string | null;
  eventType: UsageEventCreate["eventType"];
  at?: Date;

  conversationId?: string | null;
  documentId?: string | null;
  folderId?: string | null;

  locale?: string | null;
  deviceType?: UsageEventCreate["deviceType"];

  meta?: Record<string, unknown> | null;
}): UsageEventCreate {
  return {
    userId: params.userId,
    tenantId: params.tenantId ?? null,
    eventType: params.eventType,
    at: params.at ?? now(),
    conversationId: params.conversationId ?? null,
    documentId: params.documentId ?? null,
    folderId: params.folderId ?? null,
    locale: params.locale ?? null,
    deviceType: params.deviceType ?? "unknown",
    meta: params.meta ?? null,
  };
}

/* ----------------------------- Model calls ----------------------------- */

export function buildModelCall(params: {
  userId: string;
  tenantId?: string | null;

  traceId: string;
  turnId?: string | null;

  provider: LLMProviderKey;
  model: string;
  stage: PipelineStage;

  status: TelemetryStatus;
  errorCode?: string | null;

  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;

  firstTokenMs?: number | null;
  durationMs?: number | null;

  retries?: number | null;

  at?: Date;

  meta?: Record<string, unknown> | null;
}): ModelCallCreate {
  return {
    userId: params.userId,
    tenantId: params.tenantId ?? null,
    traceId: params.traceId,
    turnId: params.turnId ?? null,
    provider: params.provider,
    model: params.model,
    stage: params.stage,
    status: params.status,
    errorCode: params.errorCode ?? null,
    promptTokens: params.promptTokens ?? null,
    completionTokens: params.completionTokens ?? null,
    totalTokens: params.totalTokens ?? null,
    firstTokenMs: params.firstTokenMs ?? null,
    durationMs: params.durationMs ?? null,
    retries: params.retries ?? null,
    at: params.at ?? now(),
    meta: params.meta ?? null,
  };
}

/* ----------------------------- Retrieval / RAG ----------------------------- */

export function buildRetrievalEvent(params: {
  userId: string;
  tenantId?: string | null;

  traceId: string;
  turnId?: string | null;
  conversationId?: string | null;

  operator?: KodaOperator;
  intent?: KodaIntent;
  domain?: KodaDomain;

  docLockEnabled: boolean;

  strategy?: RetrievalStrategy;

  candidates?: number | null;
  selected?: number | null;

  evidenceStrength?: number | null; // 0..1
  refined?: boolean | null;

  wrongDocPrevented?: boolean | null;

  sourcesCount?: number | null;
  navPillsUsed?: boolean | null;

  fallbackReasonCode?: string | null;

  at?: Date;

  meta?: Record<string, unknown> | null;
}): RetrievalEventCreate {
  return {
    userId: params.userId,
    tenantId: params.tenantId ?? null,

    traceId: params.traceId,
    turnId: params.turnId ?? null,
    conversationId: params.conversationId ?? null,

    operator: params.operator ?? "answer",
    intent: params.intent ?? "answer",
    domain: params.domain ?? "unknown",

    docLockEnabled: !!params.docLockEnabled,

    strategy: params.strategy ?? "unknown",

    candidates: numberOrNull(params.candidates),
    selected: numberOrNull(params.selected),

    evidenceStrength: clamp01OrNull(params.evidenceStrength),
    refined: boolOrNull(params.refined),

    wrongDocPrevented: boolOrNull(params.wrongDocPrevented),

    sourcesCount: numberOrNull(params.sourcesCount),
    navPillsUsed: boolOrNull(params.navPillsUsed),

    fallbackReasonCode: params.fallbackReasonCode ?? null,

    at: params.at ?? now(),

    meta: params.meta ?? null,
  };
}

/* ----------------------------- Ingestion ----------------------------- */

export function buildIngestionEvent(params: {
  userId: string;
  tenantId?: string | null;

  documentId?: string | null;

  filename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;

  status: TelemetryStatus;
  errorCode?: string | null;

  extractionMethod?: IngestionEventCreate["extractionMethod"];

  pages?: number | null;
  ocrUsed?: boolean | null;
  ocrConfidence?: number | null;

  extractedTextLength?: number | null;
  tablesExtracted?: number | null;

  chunkCount?: number | null;

  embeddingProvider?: LLMProviderKey | null;
  embeddingModel?: string | null;

  durationMs?: number | null;

  at?: Date;

  meta?: Record<string, unknown> | null;
}): IngestionEventCreate {
  return {
    userId: params.userId,
    tenantId: params.tenantId ?? null,

    documentId: params.documentId ?? null,

    filename: params.filename ?? null,
    mimeType: params.mimeType ?? null,
    sizeBytes: numberOrNull(params.sizeBytes),

    status: params.status,
    errorCode: params.errorCode ?? null,

    extractionMethod: params.extractionMethod ?? "unknown",

    pages: numberOrNull(params.pages),
    ocrUsed: boolOrNull(params.ocrUsed),
    ocrConfidence: clamp01OrNull(params.ocrConfidence),

    extractedTextLength: numberOrNull(params.extractedTextLength),
    tablesExtracted: numberOrNull(params.tablesExtracted),

    chunkCount: numberOrNull(params.chunkCount),

    embeddingProvider: params.embeddingProvider ?? null,
    embeddingModel: params.embeddingModel ?? null,

    durationMs: numberOrNull(params.durationMs),

    at: params.at ?? now(),

    meta: params.meta ?? null,
  };
}

/* ----------------------------- helpers ----------------------------- */

function numberOrNull(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v;
}

function boolOrNull(b: unknown): boolean | null {
  if (typeof b === "boolean") return b;
  return null;
}

function clamp01OrNull(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, v));
}
