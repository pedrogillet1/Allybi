import type { PrismaClient } from "@prisma/client";
import type { OcrOutcome } from "../extraction/ocrSignals.service";
import {
  evaluateIngestionSloMetrics,
  summarizeIngestionSloEvents,
} from "./ingestionSloContract.shared.js";

export interface GoogleCloudSqlMetrics {
  connected: boolean;
  latencyMs: number | null;
  activeConnections: number;
  databaseSizeBytes: number | null;
  error: string | null;
}

export interface GoogleCloudRunServiceMetric {
  service: string;
  calls: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
}

export interface GoogleCloudRunMetrics {
  calls: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
  services: GoogleCloudRunServiceMetric[];
}

export interface GoogleGeminiModelMetric {
  model: string;
  calls: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
  tokens: number;
}

export interface GoogleGeminiMetrics {
  calls: number;
  errors: number;
  errorRate: number;
  p95LatencyMs: number;
  tokens: number;
  estimatedCostUsd: number;
  models: GoogleGeminiModelMetric[];
}

export interface GoogleOcrMetrics {
  docsProcessed: number;
  ocrAttempted: number;
  ocrUsed: number;
  ocrAttemptRate: number;
  ocrAppliedRate: number;
  ocrSkipRate: number;
  ocrErrorRate: number;
  ocrCoverageRate: number;
  avgConfidence: number;
  failures: number;
}

export interface GoogleIngestionSloBucket {
  mimeType: string;
  sizeBucket: string;
  count: number;
  p95LatencyMs: number;
  p95PeakRssMb: number;
  failureRate: number;
}

export interface GoogleIngestionSloMetrics {
  docsProcessed: number;
  p95LatencyMs: number;
  p95PeakRssMb: number;
  byMimeSize: GoogleIngestionSloBucket[];
}

export interface IngestionSloThresholds {
  maxGlobalP95LatencyMs: number;
  maxGlobalFailureRatePct: number;
  minDocsProcessed?: number;
  maxGlobalP95PeakRssMb?: number;
  maxBucketP95LatencyMsByKey?: Record<string, number>;
  maxBucketFailureRatePctByKey?: Record<string, number>;
  maxBucketP95PeakRssMbByKey?: Record<string, number>;
}

export interface IngestionSloEvaluation {
  passed: boolean;
  failures: string[];
}

export interface GoogleMetricsBundle {
  cloudSql: GoogleCloudSqlMetrics;
  cloudRun: GoogleCloudRunMetrics;
  gemini: GoogleGeminiMetrics;
  ocr: GoogleOcrMetrics;
  ingestionSlo: GoogleIngestionSloMetrics;
}

interface WindowParams {
  from: Date;
  to: Date;
}

function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

interface OcrEventLike {
  status?: string | null;
  ocrUsed?: boolean | null;
  ocrConfidence?: number | null;
  meta?: unknown;
}

interface IngestionEventLike {
  status?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
  meta?: unknown;
}

const OCR_SKIP_OUTCOMES = new Set<OcrOutcome>(["no_text", "skipped_heuristic"]);
const OCR_ERROR_OUTCOMES = new Set<OcrOutcome>([
  "provider_unavailable",
  "runtime_error",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeOcrOutcome(value: unknown): OcrOutcome | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  switch (raw) {
    case "not_attempted":
    case "applied":
    case "no_text":
    case "skipped_heuristic":
    case "provider_unavailable":
    case "runtime_error":
      return raw;
    default:
      return null;
  }
}

function normalizeConfidencePercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 1) return Math.max(0, Math.min(100, value * 100));
  return Math.max(0, Math.min(100, value));
}

function toRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2((numerator / denominator) * 100);
}

export function summarizeOcrEvents(events: OcrEventLike[]): GoogleOcrMetrics {
  let docsProcessed = 0;
  let ocrAttempted = 0;
  let ocrUsed = 0;
  let ocrSkipped = 0;
  let ocrErrors = 0;
  let failures = 0;
  const confidenceValues: number[] = [];

  for (const event of events) {
    docsProcessed += 1;

    const used = Boolean(event.ocrUsed);
    if (used) ocrUsed += 1;

    const status = String(event.status || "").toLowerCase();
    if (status === "fail") failures += 1;

    const meta = asRecord(event.meta);
    const attemptedFromMeta = readBoolean(meta?.ocrAttempted);
    const explicitOutcome = normalizeOcrOutcome(meta?.ocrOutcome);
    const hasCanonicalSignals =
      attemptedFromMeta !== null || explicitOutcome !== null;

    const attempted =
      attemptedFromMeta ??
      (explicitOutcome
        ? explicitOutcome !== "not_attempted" &&
          explicitOutcome !== "skipped_heuristic"
        : used);
    if (attempted) ocrAttempted += 1;

    let outcome: OcrOutcome = explicitOutcome ?? "not_attempted";
    if (!explicitOutcome) {
      if (hasCanonicalSignals && attemptedFromMeta === false) {
        outcome = "not_attempted";
      } else if (used) outcome = "applied";
      else if (attempted && status === "fail") outcome = "runtime_error";
      else if (attempted) outcome = "no_text";
    }

    if (OCR_SKIP_OUTCOMES.has(outcome)) ocrSkipped += 1;
    if (OCR_ERROR_OUTCOMES.has(outcome)) ocrErrors += 1;

    if (used) {
      const normalizedConfidence = normalizeConfidencePercent(
        event.ocrConfidence,
      );
      if (normalizedConfidence !== null)
        confidenceValues.push(normalizedConfidence);
    }
  }

  const avgConfidence =
    confidenceValues.length > 0
      ? round2(
          confidenceValues.reduce((sum, value) => sum + value, 0) /
            confidenceValues.length,
        )
      : 0;

  return {
    docsProcessed,
    ocrAttempted,
    ocrUsed,
    ocrAttemptRate: toRate(ocrAttempted, docsProcessed),
    ocrAppliedRate: toRate(ocrUsed, docsProcessed),
    ocrSkipRate: toRate(ocrSkipped, docsProcessed),
    ocrErrorRate: toRate(ocrErrors, docsProcessed),
    ocrCoverageRate: toRate(ocrUsed, docsProcessed),
    avgConfidence,
    failures,
  };
}

export function summarizeIngestionLatencyByMimeSize(
  events: IngestionEventLike[],
): GoogleIngestionSloMetrics {
  return summarizeIngestionSloEvents(events);
}

export function evaluateIngestionSlo(
  metrics: GoogleIngestionSloMetrics,
  thresholds: IngestionSloThresholds,
): IngestionSloEvaluation {
  const evaluation = evaluateIngestionSloMetrics(metrics, thresholds);
  return {
    passed: evaluation.passed,
    failures: evaluation.failures,
  };
}

async function getCloudSqlMetrics(
  prisma: PrismaClient,
): Promise<GoogleCloudSqlMetrics> {
  const started = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;

    const [connRows, sizeRows] = await Promise.all([
      prisma.$queryRaw<Array<{ active_connections: bigint | number }>>`
        SELECT COUNT(*)::bigint AS active_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
      `,
      prisma.$queryRaw<Array<{ size_bytes: bigint | number }>>`
        SELECT pg_database_size(current_database())::bigint AS size_bytes
      `,
    ]);

    return {
      connected: true,
      latencyMs,
      activeConnections: toNum(connRows[0]?.active_connections),
      databaseSizeBytes: toNum(sizeRows[0]?.size_bytes),
      error: null,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: null,
      activeConnections: 0,
      databaseSizeBytes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getCloudRunMetrics(
  prisma: PrismaClient,
  window: WindowParams,
): Promise<GoogleCloudRunMetrics> {
  try {
    const rows = await prisma.aPIPerformanceLog.findMany({
      where: {
        startedAt: { gte: window.from, lt: window.to },
      },
      select: {
        service: true,
        endpoint: true,
        success: true,
        latency: true,
      },
      take: 100000,
    });

    // Cloud Run worker traffic generally includes pubsub/worker/cloudrun service naming.
    const cloudRunRows = rows.filter((row) => {
      const service = (row.service || "").toLowerCase();
      const endpoint = (row.endpoint || "").toLowerCase();
      return (
        service.includes("cloudrun") ||
        service.includes("worker") ||
        service.includes("pubsub") ||
        endpoint.includes("/pubsub/") ||
        endpoint.includes("/workers/")
      );
    });

    const byService = new Map<
      string,
      { calls: number; errors: number; latencies: number[] }
    >();
    for (const row of cloudRunRows) {
      const key = row.service || "cloud-run";
      if (!byService.has(key)) {
        byService.set(key, { calls: 0, errors: 0, latencies: [] });
      }
      const item = byService.get(key)!;
      item.calls += 1;
      if (!row.success) item.errors += 1;
      if (typeof row.latency === "number" && row.latency > 0)
        item.latencies.push(row.latency);
    }

    const services = Array.from(byService.entries())
      .map(([service, item]) => ({
        service,
        calls: item.calls,
        errors: item.errors,
        errorRate:
          item.calls > 0 ? round2((item.errors / item.calls) * 100) : 0,
        p95LatencyMs: p95(item.latencies),
      }))
      .sort((a, b) => b.calls - a.calls);

    const calls = services.reduce((sum, s) => sum + s.calls, 0);
    const errors = services.reduce((sum, s) => sum + s.errors, 0);
    const latencyPool = services.flatMap((s) => {
      const source = byService.get(s.service);
      return source?.latencies ?? [];
    });

    return {
      calls,
      errors,
      errorRate: calls > 0 ? round2((errors / calls) * 100) : 0,
      p95LatencyMs: p95(latencyPool),
      services,
    };
  } catch {
    return {
      calls: 0,
      errors: 0,
      errorRate: 0,
      p95LatencyMs: 0,
      services: [],
    };
  }
}

async function getGeminiMetrics(
  prisma: PrismaClient,
  window: WindowParams,
): Promise<GoogleGeminiMetrics> {
  try {
    const calls = await prisma.modelCall.findMany({
      where: {
        at: { gte: window.from, lt: window.to },
        OR: [
          { provider: { contains: "gemini", mode: "insensitive" } },
          { provider: { contains: "google", mode: "insensitive" } },
          { model: { contains: "gemini", mode: "insensitive" } },
        ],
      },
      select: {
        model: true,
        status: true,
        durationMs: true,
        totalTokens: true,
      },
      take: 100000,
    });

    const modelMap = new Map<
      string,
      { calls: number; errors: number; latencies: number[]; tokens: number }
    >();
    for (const c of calls) {
      const key = c.model || "gemini";
      if (!modelMap.has(key)) {
        modelMap.set(key, { calls: 0, errors: 0, latencies: [], tokens: 0 });
      }
      const item = modelMap.get(key)!;
      item.calls += 1;
      if (c.status === "fail") item.errors += 1;
      if (typeof c.durationMs === "number" && c.durationMs > 0)
        item.latencies.push(c.durationMs);
      item.tokens += c.totalTokens ?? 0;
    }

    const models = Array.from(modelMap.entries())
      .map(([model, item]) => ({
        model,
        calls: item.calls,
        errors: item.errors,
        errorRate:
          item.calls > 0 ? round2((item.errors / item.calls) * 100) : 0,
        p95LatencyMs: p95(item.latencies),
        tokens: item.tokens,
      }))
      .sort((a, b) => b.calls - a.calls);

    const totalCalls = models.reduce((sum, m) => sum + m.calls, 0);
    const totalErrors = models.reduce((sum, m) => sum + m.errors, 0);
    const totalTokens = models.reduce((sum, m) => sum + m.tokens, 0);

    // Conservative blended estimate for Gemini family.
    const estimatedCostUsd = round2((totalTokens / 1_000_000) * 0.3);
    const allLatencies = calls
      .map((c) => c.durationMs ?? 0)
      .filter((v) => v > 0);

    return {
      calls: totalCalls,
      errors: totalErrors,
      errorRate: totalCalls > 0 ? round2((totalErrors / totalCalls) * 100) : 0,
      p95LatencyMs: p95(allLatencies),
      tokens: totalTokens,
      estimatedCostUsd,
      models,
    };
  } catch {
    return {
      calls: 0,
      errors: 0,
      errorRate: 0,
      p95LatencyMs: 0,
      tokens: 0,
      estimatedCostUsd: 0,
      models: [],
    };
  }
}

async function getOcrMetrics(
  prisma: PrismaClient,
  window: WindowParams,
): Promise<GoogleOcrMetrics> {
  try {
    const events = await prisma.ingestionEvent.findMany({
      where: {
        at: { gte: window.from, lt: window.to },
      },
      select: {
        status: true,
        ocrUsed: true,
        ocrConfidence: true,
        meta: true,
      },
      take: 100000,
    });

    return summarizeOcrEvents(events);
  } catch {
    return summarizeOcrEvents([]);
  }
}

async function getIngestionSloMetrics(
  prisma: PrismaClient,
  window: WindowParams,
): Promise<GoogleIngestionSloMetrics> {
  try {
    const events = await prisma.ingestionEvent.findMany({
      where: {
        at: { gte: window.from, lt: window.to },
      },
      select: {
        status: true,
        mimeType: true,
        durationMs: true,
        meta: true,
      },
      take: 100000,
    });

    return summarizeIngestionLatencyByMimeSize(events);
  } catch {
    return summarizeIngestionLatencyByMimeSize([]);
  }
}

export async function getGoogleMetrics(
  prisma: PrismaClient,
  window: WindowParams,
): Promise<GoogleMetricsBundle> {
  const [cloudSql, cloudRun, gemini, ocr, ingestionSlo] = await Promise.all([
    getCloudSqlMetrics(prisma),
    getCloudRunMetrics(prisma, window),
    getGeminiMetrics(prisma, window),
    getOcrMetrics(prisma, window),
    getIngestionSloMetrics(prisma, window),
  ]);

  return {
    cloudSql,
    cloudRun,
    gemini,
    ocr,
    ingestionSlo,
  };
}
