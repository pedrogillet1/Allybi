// file: src/analytics/rollups/dailyRollup.job.ts
// Daily metrics rollup job - computes daily aggregates from telemetry tables

import { PrismaClient } from "@prisma/client";
import { percentile } from "../calculators/latency.calculator";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface DailyRollupOptions {
  backfillDays?: number; // Default: 3 days
  maxBucketsPerRun?: number; // Default: 14 buckets
  dryRun?: boolean; // Log only, don't write
}

export interface DailyMetrics {
  bucketDay: Date;
  activeUsers: number;
  newUsers: number;
  messages: number;
  queries: number;
  documentsUploaded: number;
  weakEvidenceCount: number;
  weakEvidenceRate: number;
  apiRequests: number;
  apiErrorCount: number;
  apiErrorRate: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgLatencyMs: number | null;
  ttftAvgMs: number | null;
  llmCostUsd: number;
  llmTokensIn: number;
  llmTokensOut: number;
  llmCalls: number;
  previewFailures: number;
  ingestionFailures: number;
}

export interface RollupResult {
  success: boolean;
  bucketsProcessed: number;
  rowsWritten: number;
  errors: string[];
  durationMs: number;
  startBucket: string | null;
  endBucket: string | null;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Get UTC day start for a timestamp
 */
export function getUtcDayStart(ts: Date | string): Date {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Add days to a date
 */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Format date as ISO day string for logging (YYYY-MM-DD)
 */
function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generate array of day buckets between start and end
 */
function generateDayBuckets(start: Date, end: Date): Date[] {
  const buckets: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    buckets.push(new Date(current));
    current = addDays(current, 1);
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────────
// ADVISORY LOCK
// ─────────────────────────────────────────────────────────────

const LOCK_KEY = "koda:analytics:daily";

async function tryAcquireLock(prisma: PrismaClient): Promise<boolean> {
  const result = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${LOCK_KEY})) as locked
  `;
  return result[0]?.locked === true;
}

async function releaseLock(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(hashtext(${LOCK_KEY}))
  `;
}

// ─────────────────────────────────────────────────────────────
// METRICS COMPUTATION
// ─────────────────────────────────────────────────────────────

async function computeDailyMetrics(
  prisma: PrismaClient,
  bucketStart: Date,
  bucketEnd: Date,
): Promise<DailyMetrics> {
  // Initialize with zeros
  const metrics: DailyMetrics = {
    bucketDay: bucketStart,
    activeUsers: 0,
    newUsers: 0,
    messages: 0,
    queries: 0,
    documentsUploaded: 0,
    weakEvidenceCount: 0,
    weakEvidenceRate: 0,
    apiRequests: 0,
    apiErrorCount: 0,
    apiErrorRate: 0,
    p50LatencyMs: null,
    p95LatencyMs: null,
    avgLatencyMs: null,
    ttftAvgMs: null,
    llmCostUsd: 0,
    llmTokensIn: 0,
    llmTokensOut: 0,
    llmCalls: 0,
    previewFailures: 0,
    ingestionFailures: 0,
  };

  // ─── Active Users (from UsageEvent) ───
  const activeUsersResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "userId") as count
    FROM usage_events
    WHERE "at" >= ${bucketStart} AND "at" < ${bucketEnd}
      AND "userId" IS NOT NULL
      AND "eventType" IN ('chat.message_sent', 'rag.query', 'document.upload', 'auth.login')
  `;
  metrics.activeUsers = Number(activeUsersResult[0]?.count || 0);

  // ─── New Users (users created this day) ───
  const newUsersResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM users
    WHERE "createdAt" >= ${bucketStart} AND "createdAt" < ${bucketEnd}
  `;
  metrics.newUsers = Number(newUsersResult[0]?.count || 0);

  // ─── Messages (user messages from UsageEvent) ───
  const messagesResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM usage_events
    WHERE "at" >= ${bucketStart} AND "at" < ${bucketEnd}
      AND "eventType" = 'chat.message_sent'
  `;
  metrics.messages = Number(messagesResult[0]?.count || 0);

  // ─── Queries (from QueryTelemetry) ───
  const queriesResult = await prisma.$queryRaw<
    { count: bigint; weak: bigint }[]
  >`
    SELECT
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE "hadFallback" = true OR "retrievalAdequate" = false) as weak
    FROM query_telemetry
    WHERE "timestamp" >= ${bucketStart} AND "timestamp" < ${bucketEnd}
  `;
  metrics.queries = Number(queriesResult[0]?.count || 0);
  metrics.weakEvidenceCount = Number(queriesResult[0]?.weak || 0);
  metrics.weakEvidenceRate =
    metrics.queries > 0 ? metrics.weakEvidenceCount / metrics.queries : 0;

  // ─── Documents Uploaded (from UsageEvent) ───
  const docsResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count
    FROM usage_events
    WHERE "at" >= ${bucketStart} AND "at" < ${bucketEnd}
      AND "eventType" = 'document.upload'
  `;
  metrics.documentsUploaded = Number(docsResult[0]?.count || 0);

  // ─── API Performance (from APIPerformanceLog) ───
  const apiResult = await prisma.$queryRaw<
    {
      total: bigint;
      errors: bigint;
      latencies: number[];
    }[]
  >`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE "statusCode" >= 500 OR "rateLimitHit" = true) as errors,
      ARRAY_AGG("latency") FILTER (WHERE "latency" IS NOT NULL) as latencies
    FROM api_performance_logs
    WHERE "startedAt" >= ${bucketStart} AND "startedAt" < ${bucketEnd}
  `;

  metrics.apiRequests = Number(apiResult[0]?.total || 0);
  metrics.apiErrorCount = Number(apiResult[0]?.errors || 0);
  metrics.apiErrorRate =
    metrics.apiRequests > 0 ? metrics.apiErrorCount / metrics.apiRequests : 0;

  const latencies = (apiResult[0]?.latencies || []).filter(
    (l) => l != null && l > 0,
  );
  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b);
    metrics.avgLatencyMs = Math.round(
      latencies.reduce((a, b) => a + b, 0) / latencies.length,
    );
    metrics.p50LatencyMs = Math.round(percentile(latencies, 50) || 0);
    metrics.p95LatencyMs = Math.round(percentile(latencies, 95) || 0);
  }

  // ─── LLM Usage (from TokenUsage) ───
  const llmResult = await prisma.$queryRaw<
    {
      calls: bigint;
      cost: number;
      tokensIn: bigint;
      tokensOut: bigint;
    }[]
  >`
    SELECT
      COUNT(*) as calls,
      COALESCE(SUM("totalCost"), 0) as cost,
      COALESCE(SUM("inputTokens"), 0) as "tokensIn",
      COALESCE(SUM("outputTokens"), 0) as "tokensOut"
    FROM token_usage
    WHERE "createdAt" >= ${bucketStart} AND "createdAt" < ${bucketEnd}
      AND "success" = true
  `;

  metrics.llmCalls = Number(llmResult[0]?.calls || 0);
  metrics.llmCostUsd = Number(llmResult[0]?.cost || 0);
  metrics.llmTokensIn = Number(llmResult[0]?.tokensIn || 0);
  metrics.llmTokensOut = Number(llmResult[0]?.tokensOut || 0);

  // ─── Failures (from ErrorLog) ───
  const failuresResult = await prisma.$queryRaw<
    {
      preview: bigint;
      ingestion: bigint;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE "errorType" ILIKE '%preview%') as preview,
      COUNT(*) FILTER (WHERE "errorType" ILIKE '%ingestion%' OR "errorType" ILIKE '%processing%') as ingestion
    FROM error_logs
    WHERE "createdAt" >= ${bucketStart} AND "createdAt" < ${bucketEnd}
  `;

  metrics.previewFailures = Number(failuresResult[0]?.preview || 0);
  metrics.ingestionFailures = Number(failuresResult[0]?.ingestion || 0);

  return metrics;
}

// ─────────────────────────────────────────────────────────────
// UPSERT TO ROLLUP TABLE
// ─────────────────────────────────────────────────────────────

async function upsertDailyMetrics(
  prisma: PrismaClient,
  metrics: DailyMetrics,
): Promise<void> {
  // Upsert into DailyAnalyticsAggregate (existing Prisma model)
  await prisma.dailyAnalyticsAggregate.upsert({
    where: { date: metrics.bucketDay },
    create: {
      date: metrics.bucketDay,
      activeUsers: metrics.activeUsers,
      newUsers: metrics.newUsers,
      totalMessages: metrics.messages,
      userMessages: metrics.messages, // approximation
      totalRagQueries: metrics.queries,
      newDocuments: metrics.documentsUploaded,
      fallbackRate: metrics.weakEvidenceRate,
      avgRagLatency: metrics.avgLatencyMs ?? 0,
      totalInputTokens: metrics.llmTokensIn,
      totalOutputTokens: metrics.llmTokensOut,
      totalTokenCost: metrics.llmCostUsd,
      totalErrors:
        metrics.apiErrorCount +
        metrics.previewFailures +
        metrics.ingestionFailures,
    },
    update: {
      activeUsers: metrics.activeUsers,
      newUsers: metrics.newUsers,
      totalMessages: metrics.messages,
      userMessages: metrics.messages,
      totalRagQueries: metrics.queries,
      newDocuments: metrics.documentsUploaded,
      fallbackRate: metrics.weakEvidenceRate,
      avgRagLatency: metrics.avgLatencyMs ?? 0,
      totalInputTokens: metrics.llmTokensIn,
      totalOutputTokens: metrics.llmTokensOut,
      totalTokenCost: metrics.llmCostUsd,
      totalErrors:
        metrics.apiErrorCount +
        metrics.previewFailures +
        metrics.ingestionFailures,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export async function runDailyRollup(
  prisma: PrismaClient,
  opts?: DailyRollupOptions,
): Promise<RollupResult> {
  const startTime = Date.now();
  const backfillDays = opts?.backfillDays ?? 3;
  const maxBuckets = opts?.maxBucketsPerRun ?? 14;
  const dryRun = opts?.dryRun ?? false;

  const result: RollupResult = {
    success: false,
    bucketsProcessed: 0,
    rowsWritten: 0,
    errors: [],
    durationMs: 0,
    startBucket: null,
    endBucket: null,
  };

  // Acquire advisory lock
  const gotLock = await tryAcquireLock(prisma);
  if (!gotLock) {
    result.errors.push(
      "Failed to acquire advisory lock - another instance may be running",
    );
    result.durationMs = Date.now() - startTime;
    return result;
  }

  try {
    // Calculate bucket range
    const now = new Date();
    const currentDay = getUtcDayStart(now);

    // End at previous day (current day is incomplete)
    const endDay = addDays(currentDay, -1);

    // Start from backfill window
    const startDay = addDays(endDay, -(backfillDays - 1));

    // Generate buckets
    let buckets = generateDayBuckets(startDay, endDay);

    // Limit buckets per run
    if (buckets.length > maxBuckets) {
      buckets = buckets.slice(-maxBuckets);
    }

    if (buckets.length === 0) {
      result.success = true;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    result.startBucket = formatDay(buckets[0]);
    result.endBucket = formatDay(buckets[buckets.length - 1]);

    // Process each bucket
    for (const bucketStart of buckets) {
      const bucketEnd = addDays(bucketStart, 1);

      try {
        const metrics = await computeDailyMetrics(
          prisma,
          bucketStart,
          bucketEnd,
        );

        if (!dryRun) {
          await upsertDailyMetrics(prisma, metrics);
          result.rowsWritten++;
        }

        result.bucketsProcessed++;
      } catch (err: any) {
        result.errors.push(
          `Bucket ${formatDay(bucketStart)}: ${err.message || "unknown error"}`,
        );
        // Continue to next bucket
      }
    }

    result.success = result.errors.length === 0;
  } finally {
    await releaseLock(prisma);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

export default runDailyRollup;
