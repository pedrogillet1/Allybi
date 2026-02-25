import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { supportsModel } from "../admin/_shared/prismaAdapter";
import { logger } from "../../utils/logger";

export type TraceStepName =
  | "input_normalization"
  | "intent_operator"
  | "scope_resolution"
  | "retrieval"
  | "evidence_gate"
  | "trust_gate"
  | "compose"
  | "quality_gates"
  | "output_contract"
  | "stream";

type SpanStatus = "ok" | "error" | "skipped";
type TraceFinalStatus =
  | "success"
  | "partial"
  | "clarification_required"
  | "blocked"
  | "failed";

type BufferedSpan = {
  id: string;
  stepName: TraceStepName | string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  status: SpanStatus;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
};

type TraceBuffer = {
  spans: BufferedSpan[];
  bankUsage: Array<{
    bankType: string;
    bankId: string;
    bankVersion: string | null;
    stageUsed: string;
    createdAt: Date;
  }>;
  keywords: Array<{ keyword: string; weight: number | null; createdAt: Date }>;
  entities: Array<{
    entityType: string;
    value: string;
    confidence: number | null;
    createdAt: Date;
  }>;
  createdAt: Date;
};

export interface TraceWriterConfig {
  enabled?: boolean;
  successSamplePercent?: number;
  maxBufferedTraces?: number;
}

export interface QueryTelemetryWriteInput {
  traceId: string;
  userId: string;
  conversationId?: string | null;
  messageId?: string | null;
  queryText?: string | null;
  intent?: string | null;
  intentConfidence?: number | null;
  domain?: string | null;
  answerMode?: string | null;
  operatorFamily?: string | null;
  chunksReturned?: number | null;
  distinctDocs?: number | null;
  documentIds?: string[];
  topRelevanceScore?: number | null;
  retrievalAdequate?: boolean;
  evidenceGateAction?: string | null;
  evidenceShouldProceed?: boolean;
  hadFallback?: boolean;
  fallbackScenario?: string | null;
  answerLength?: number | null;
  wasTruncated?: boolean;
  failureCode?: string | null;
  hasErrors?: boolean;
  warnings?: string[];
  totalMs?: number | null;
  ttft?: number | null;
  retrievalMs?: number | null;
  llmMs?: number | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  pipelineSignature?: string | null;
  environment?: string | null;
  errors?: Record<string, unknown> | null;
  sampledTrace?: boolean;
}

export interface RetrievalEventWriteInput {
  traceId: string;
  userId: string;
  conversationId?: string | null;
  operator?: string | null;
  intent?: string | null;
  domain?: string | null;
  docLockEnabled?: boolean;
  strategy?: string | null;
  candidates?: number | null;
  selected?: number | null;
  evidenceStrength?: number | null;
  refined?: boolean;
  wrongDocPrevented?: boolean;
  sourcesCount?: number | null;
  navPillsUsed?: boolean;
  fallbackReasonCode?: string | null;
  at?: Date;
  meta?: Record<string, unknown> | null;
}

export interface TurnDebugPacket {
  traceId: string;
  requestId: string | null;
  conversationId: string | null;
  userIdHash: string;
  answerMode: string;
  docScopeLock: {
    mode: "none" | "single_doc" | "docset";
    allowedDocumentIdsCount: number;
    activeDocumentId: string | null;
  };
  retrieval: {
    candidates: number;
    selected: number;
    topScore: number | null;
    scopeCandidatesDropped: number;
    evidenceIds: string[];
    documentIds: string[];
  };
  provenance: {
    schemaVersion: string;
    evidenceMapHash: string | null;
    required: boolean;
    validated: boolean;
    failureCode: string | null;
  };
  budget: {
    requestedMaxOutputTokens: number | null;
    hardMaxOutputTokens: number | null;
    observedOutputTokens: number | null;
  };
  enforcement: {
    blocked: boolean;
    reasonCode: string | null;
    repairs: string[];
    warnings: string[];
  };
  output: {
    sourceCount: number;
    wasTruncated: boolean;
    status: string;
    failureCode: string | null;
  };
  createdAt: string;
}

function clampSamplePercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(Math.floor(parsed), 0), 100);
}

function toIntOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toFloatOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function clamp01OrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function cleanShort(value: unknown, max = 120): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length <= max ? text : text.slice(0, max);
}

function normalizeEnv(input?: string | null): string {
  const env = String(input || process.env.NODE_ENV || "local")
    .trim()
    .toLowerCase();
  if (env === "production" || env === "staging" || env === "dev") return env;
  if (env === "development") return "dev";
  if (env === "test") return "dev";
  return "local";
}

export class TraceWriterService {
  private readonly buffers = new Map<string, TraceBuffer>();
  private readonly turnDebugPackets = new Map<string, TurnDebugPacket>();
  private readonly enabled: boolean;
  private readonly successSamplePercent: number;
  private readonly maxBufferedTraces: number;

  constructor(
    private readonly prisma: PrismaClient,
    config: TraceWriterConfig = {},
  ) {
    this.enabled = config.enabled ?? process.env.TELEMETRY_ENABLED !== "false";
    this.successSamplePercent = clampSamplePercent(
      config.successSamplePercent ??
        process.env.OBS_TRACE_SUCCESS_SAMPLE_PERCENT,
    );
    this.maxBufferedTraces = Math.max(
      100,
      toIntOrNull(config.maxBufferedTraces) ?? 5000,
    );
  }

  writeTurnDebugPacket(packet: TurnDebugPacket): void {
    const traceId = cleanShort(packet.traceId, 64);
    if (!traceId) return;
    if (this.turnDebugPackets.size >= this.maxBufferedTraces) {
      const oldest = this.turnDebugPackets.keys().next().value as
        | string
        | undefined;
      if (oldest) this.turnDebugPackets.delete(oldest);
    }
    this.turnDebugPackets.set(traceId, packet);
  }

  getLatestTurnDebugPacket(traceId: string): TurnDebugPacket | null {
    const normalized = cleanShort(traceId, 64);
    if (!normalized) return null;
    return this.turnDebugPackets.get(normalized) || null;
  }

  startSpan(
    traceId: string,
    stepName: TraceStepName | string,
    metadata?: Record<string, unknown> | null,
  ): string {
    const spanId = `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const buffer = this.getOrCreateBuffer(traceId);
    buffer.spans.push({
      id: spanId,
      stepName: cleanShort(stepName, 50) || "unknown",
      startedAt: new Date(),
      endedAt: null,
      durationMs: null,
      status: "ok",
      errorCode: null,
      metadata: metadata || null,
    });
    return spanId;
  }

  endSpan(
    traceId: string,
    spanId: string,
    params?: {
      status?: SpanStatus;
      errorCode?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): void {
    const buffer = this.buffers.get(traceId);
    if (!buffer) return;
    const span = buffer.spans.find((item) => item.id === spanId);
    if (!span) return;

    const endedAt = new Date();
    span.endedAt = endedAt;
    span.durationMs = Math.max(0, endedAt.getTime() - span.startedAt.getTime());
    span.status = params?.status || "ok";
    span.errorCode = cleanShort(params?.errorCode, 50);
    if (params?.metadata) {
      span.metadata = {
        ...(span.metadata || {}),
        ...params.metadata,
      };
    }
  }

  recordBankUsage(params: {
    traceId: string;
    bankType: string;
    bankId: string;
    bankVersion?: string | null;
    stageUsed: string;
  }): void {
    const buffer = this.getOrCreateBuffer(params.traceId);
    buffer.bankUsage.push({
      bankType: cleanShort(params.bankType, 30) || "unknown",
      bankId: cleanShort(params.bankId, 100) || "unknown_bank",
      bankVersion: cleanShort(params.bankVersion, 64),
      stageUsed: cleanShort(params.stageUsed, 30) || "unknown",
      createdAt: new Date(),
    });
  }

  recordKeywords(
    traceId: string,
    keywords: Array<{ keyword: string; weight?: number | null } | string>,
  ): void {
    const buffer = this.getOrCreateBuffer(traceId);
    for (const keywordEntry of keywords) {
      const parsed =
        typeof keywordEntry === "string"
          ? { keyword: keywordEntry, weight: null }
          : keywordEntry;
      const keyword = cleanShort(parsed.keyword, 100);
      if (!keyword) continue;
      buffer.keywords.push({
        keyword,
        weight: toFloatOrNull(parsed.weight),
        createdAt: new Date(),
      });
    }
  }

  recordEntities(
    traceId: string,
    entities: Array<{
      type: string;
      value: string;
      confidence?: number | null;
    }>,
  ): void {
    const buffer = this.getOrCreateBuffer(traceId);
    for (const entity of entities) {
      const entityType = cleanShort(entity.type, 50);
      const value = cleanShort(entity.value, 200);
      if (!entityType || !value) continue;
      buffer.entities.push({
        entityType,
        value,
        confidence: clamp01OrNull(entity.confidence),
        createdAt: new Date(),
      });
    }
  }

  shouldPersistSuccessTrace(traceId: string): boolean {
    if (this.successSamplePercent >= 100) return true;
    if (this.successSamplePercent <= 0) return false;
    const digest = crypto.createHash("sha1").update(traceId).digest();
    const bucket = digest.readUInt32BE(0) % 100;
    return bucket < this.successSamplePercent;
  }

  async flush(
    traceId: string,
    result: { status: TraceFinalStatus },
  ): Promise<boolean> {
    const buffer = this.buffers.get(traceId);
    if (!buffer) return false;
    this.buffers.delete(traceId);

    if (!this.enabled) return false;
    const shouldPersist =
      result.status !== "success" || this.shouldPersistSuccessTrace(traceId);
    if (!shouldPersist) return false;

    const now = new Date();
    for (const span of buffer.spans) {
      if (!span.endedAt) {
        span.endedAt = now;
        span.durationMs = Math.max(0, now.getTime() - span.startedAt.getTime());
        span.status = "skipped";
      }
    }

    await Promise.all([
      this.safeCreateMany(
        "traceSpan",
        buffer.spans.map((span) => ({
          traceId,
          stepName: span.stepName,
          startedAt: span.startedAt,
          endedAt: span.endedAt,
          durationMs: span.durationMs,
          status: span.status,
          errorCode: span.errorCode,
          metadata: span.metadata,
        })),
      ),
      this.safeCreateMany(
        "bankUsageEvent",
        buffer.bankUsage.map((entry) => ({
          traceId,
          bankType: entry.bankType,
          bankId: entry.bankId,
          bankVersion: entry.bankVersion,
          stageUsed: entry.stageUsed,
          createdAt: entry.createdAt,
        })),
      ),
      this.safeCreateMany(
        "queryKeyword",
        buffer.keywords.map((entry) => ({
          traceId,
          keyword: entry.keyword,
          weight: entry.weight,
          createdAt: entry.createdAt,
        })),
      ),
      this.safeCreateMany(
        "queryEntity",
        buffer.entities.map((entry) => ({
          traceId,
          entityType: entry.entityType,
          value: entry.value,
          confidence: entry.confidence,
          createdAt: entry.createdAt,
        })),
      ),
    ]);

    return true;
  }

  async upsertQueryTelemetry(input: QueryTelemetryWriteInput): Promise<void> {
    if (!this.enabled) return;
    if (!supportsModel(this.prisma, "queryTelemetry")) return;
    const traceId = cleanShort(input.traceId, 64);
    const userId = cleanShort(input.userId, 64);
    if (!traceId || !userId) return;

    const now = new Date();
    const inputTokens = toIntOrNull(input.inputTokens) ?? 0;
    const outputTokens = toIntOrNull(input.outputTokens) ?? 0;
    const totalTokens =
      toIntOrNull(input.totalTokens) ?? Math.max(0, inputTokens + outputTokens);

    const createData = {
      queryId: traceId,
      userId,
      conversationId: cleanShort(input.conversationId, 128),
      messageId: cleanShort(input.messageId, 128),
      environment: normalizeEnv(input.environment),
      timestamp: now,
      queryText: input.queryText
        ? String(input.queryText).slice(0, 4000)
        : null,
      intent: cleanShort(input.intent, 64) || "answer",
      intentConfidence: clamp01OrNull(input.intentConfidence) ?? 0.8,
      domain: cleanShort(input.domain, 64),
      answerMode: cleanShort(input.answerMode, 64),
      operatorFamily: cleanShort(input.operatorFamily, 64),
      chunksReturned: toIntOrNull(input.chunksReturned) ?? 0,
      distinctDocs: toIntOrNull(input.distinctDocs) ?? 0,
      documentIds: Array.isArray(input.documentIds)
        ? input.documentIds
            .map((entry) => String(entry || "").trim())
            .filter((entry) => entry.length > 0)
            .slice(0, 50)
        : [],
      topRelevanceScore: toFloatOrNull(input.topRelevanceScore),
      retrievalAdequate: Boolean(input.retrievalAdequate),
      evidenceGateAction: cleanShort(input.evidenceGateAction, 64),
      evidenceShouldProceed:
        input.evidenceShouldProceed === undefined
          ? true
          : Boolean(input.evidenceShouldProceed),
      hadFallback: Boolean(input.hadFallback),
      fallbackScenario: cleanShort(input.fallbackScenario, 80),
      answerLength: toIntOrNull(input.answerLength) ?? 0,
      wasTruncated: Boolean(input.wasTruncated),
      failureCategory: cleanShort(input.failureCode, 80),
      hasErrors: Boolean(input.hasErrors),
      warnings: Array.isArray(input.warnings)
        ? input.warnings
            .map((entry) => String(entry || "").trim())
            .filter(Boolean)
            .slice(0, 64)
        : [],
      totalMs: toIntOrNull(input.totalMs),
      ttft: toIntOrNull(input.ttft),
      retrievalMs: toIntOrNull(input.retrievalMs),
      llmMs: toIntOrNull(input.llmMs),
      model: cleanShort(input.model, 120),
      inputTokens,
      outputTokens,
      totalTokens,
      pipelineSignature: cleanShort(input.pipelineSignature, 120),
      pipelineFamily: "chat_runtime_delegate",
      errors: input.errors || null,
    };

    const updateData = {
      ...createData,
      timestamp: now,
      retrievalAdequate: createData.retrievalAdequate,
      warnings: createData.warnings,
      hasErrors: createData.hasErrors,
      errors: createData.errors,
    };

    try {
      await (this.prisma as any).queryTelemetry.upsert({
        where: { queryId: traceId },
        create: createData,
        update: updateData,
      });
    } catch (error) {
      logger.warn("[trace-writer] query telemetry upsert failed", {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async writeRetrievalEvent(input: RetrievalEventWriteInput): Promise<void> {
    if (!this.enabled) return;
    if (!supportsModel(this.prisma, "retrievalEvent")) return;
    const traceId = cleanShort(input.traceId, 64);
    const userId = cleanShort(input.userId, 64);
    if (!traceId || !userId) return;

    const data = {
      userId,
      tenantId: null,
      traceId,
      turnId: null,
      conversationId: cleanShort(input.conversationId, 128),
      operator: cleanShort(input.operator, 40) || "answer",
      intent: cleanShort(input.intent, 40) || "answer",
      domain: cleanShort(input.domain, 40) || "unknown",
      docLockEnabled: Boolean(input.docLockEnabled),
      strategy: cleanShort(input.strategy, 40) || "unknown",
      candidates: toIntOrNull(input.candidates),
      selected: toIntOrNull(input.selected),
      evidenceStrength: clamp01OrNull(input.evidenceStrength),
      refined: typeof input.refined === "boolean" ? input.refined : null,
      wrongDocPrevented:
        typeof input.wrongDocPrevented === "boolean"
          ? input.wrongDocPrevented
          : null,
      sourcesCount: toIntOrNull(input.sourcesCount),
      navPillsUsed:
        typeof input.navPillsUsed === "boolean" ? input.navPillsUsed : null,
      fallbackReasonCode: cleanShort(input.fallbackReasonCode, 80),
      at: input.at || new Date(),
      meta: input.meta || null,
    };

    try {
      await (this.prisma as any).retrievalEvent.create({ data });
    } catch (error) {
      logger.warn("[trace-writer] retrieval event write failed", {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getOrCreateBuffer(traceId: string): TraceBuffer {
    const existing = this.buffers.get(traceId);
    if (existing) return existing;

    if (this.buffers.size >= this.maxBufferedTraces) {
      const oldest = this.buffers.keys().next().value as string | undefined;
      if (oldest) this.buffers.delete(oldest);
    }

    const created: TraceBuffer = {
      spans: [],
      bankUsage: [],
      keywords: [],
      entities: [],
      createdAt: new Date(),
    };
    this.buffers.set(traceId, created);
    return created;
  }

  private async safeCreateMany(
    modelName: string,
    data: unknown[],
  ): Promise<void> {
    if (!data.length) return;
    if (!supportsModel(this.prisma, modelName)) return;
    try {
      await (this.prisma as any)[modelName].createMany({
        data,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.warn("[trace-writer] createMany failed", {
        modelName,
        rows: data.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export default TraceWriterService;
