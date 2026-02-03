/**
 * Reliability Service
 * Error tracking, ingestion failures, and reliability timeseries
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange, type TimeWindow } from './_shared/rangeWindow';
import { clampLimit } from './_shared/clamp';
import { processPage, buildCursorClause } from './_shared/pagination';
import { supportsModel } from './_shared/prismaAdapter';

export interface ErrorRow {
  at: string;
  userId: string;
  provider: string;
  model: string;
  stage: string;
  errorCode: string | null;
  traceId: string;
  turnId: string | null;
}

export interface ErrorListResult {
  range: string;
  items: ErrorRow[];
  nextCursor?: string;
}

export interface IngestionFailureRow {
  at: string;
  userId: string;
  documentId: string | null;
  filename: string | null;
  mimeType: string | null;
  errorCode: string | null;
  extractionMethod: string | null;
}

export interface IngestionFailureListResult {
  range: string;
  items: IngestionFailureRow[];
  nextCursor?: string;
}

export interface ReliabilityTimeseriesPoint {
  t: string;
  value: number;
}

export interface ReliabilityTimeseriesResult {
  metric: string;
  range: string;
  points: ReliabilityTimeseriesPoint[];
}

type ReliabilityMetric = 'llm_errors' | 'ingestion_failures' | 'error_rate';

/**
 * List LLM errors
 */
export async function listErrors(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string }
): Promise<ErrorListResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Check if we have modelCall model
  if (!supportsModel(prisma, 'modelCall')) {
    return { range: rangeKey, items: [] };
  }

  // Get failed model calls
  const errors = await prisma.modelCall.findMany({
    where: {
      at: { gte: from, lt: to },
      status: 'fail',
    },
    take: limit + 1,
    ...cursorClause,
    orderBy: { at: 'desc' },
    select: {
      id: true,
      at: true,
      userId: true,
      provider: true,
      model: true,
      stage: true,
      errorCode: true,
      traceId: true,
      turnId: true,
    },
  });

  const { page, nextCursor } = processPage(errors, limit);

  const items: ErrorRow[] = page.map(e => ({
    at: e.at.toISOString(),
    userId: e.userId,
    provider: e.provider,
    model: e.model,
    stage: e.stage,
    errorCode: e.errorCode,
    traceId: e.traceId,
    turnId: e.turnId,
  }));

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/**
 * List ingestion failures
 */
export async function listIngestionFailures(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string }
): Promise<IngestionFailureListResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Check if we have ingestionEvent model
  if (!supportsModel(prisma, 'ingestionEvent')) {
    return { range: rangeKey, items: [] };
  }

  // Get failed ingestion events
  const failures = await prisma.ingestionEvent.findMany({
    where: {
      at: { gte: from, lt: to },
      status: 'fail',
    },
    take: limit + 1,
    ...cursorClause,
    orderBy: { at: 'desc' },
    select: {
      id: true,
      at: true,
      userId: true,
      documentId: true,
      filename: true,
      mimeType: true,
      errorCode: true,
      extractionMethod: true,
    },
  });

  const { page, nextCursor } = processPage(failures, limit);

  const items: IngestionFailureRow[] = page.map(f => ({
    at: f.at.toISOString(),
    userId: f.userId,
    documentId: f.documentId,
    filename: f.filename,
    mimeType: f.mimeType,
    errorCode: f.errorCode,
    extractionMethod: f.extractionMethod,
  }));

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

/**
 * Get reliability timeseries
 */
export async function getReliabilityTimeseries(
  prisma: PrismaClient,
  params: { metric: string; range?: string }
): Promise<ReliabilityTimeseriesResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const metric = (params.metric || 'llm_errors') as ReliabilityMetric;

  const points = await calculateReliabilityTimeseries(prisma, window, metric, rangeKey);

  return {
    metric,
    range: rangeKey,
    points,
  };
}

async function calculateReliabilityTimeseries(
  prisma: PrismaClient,
  window: TimeWindow,
  metric: ReliabilityMetric,
  rangeKey: string
): Promise<ReliabilityTimeseriesPoint[]> {
  const { from, to } = window;

  // Determine bucket size based on range
  const bucketMs = rangeKey === '24h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const buckets: Map<string, number> = new Map();

  // Initialize buckets
  let current = new Date(from);
  while (current < to) {
    const key = current.toISOString();
    buckets.set(key, 0);
    current = new Date(current.getTime() + bucketMs);
  }

  switch (metric) {
    case 'llm_errors': {
      if (!supportsModel(prisma, 'modelCall')) break;
      const errors = await prisma.modelCall.findMany({
        where: { at: { gte: from, lt: to }, status: 'fail' },
        select: { at: true },
        take: 100000,
      });

      for (const e of errors) {
        const bucketTime = new Date(Math.floor(e.at.getTime() / bucketMs) * bucketMs).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case 'ingestion_failures': {
      if (!supportsModel(prisma, 'ingestionEvent')) break;
      const failures = await prisma.ingestionEvent.findMany({
        where: { at: { gte: from, lt: to }, status: 'fail' },
        select: { at: true },
        take: 100000,
      });

      for (const f of failures) {
        const bucketTime = new Date(Math.floor(f.at.getTime() / bucketMs) * bucketMs).toISOString();
        buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
      }
      break;
    }

    case 'error_rate': {
      if (!supportsModel(prisma, 'modelCall')) break;
      const calls = await prisma.modelCall.findMany({
        where: { at: { gte: from, lt: to } },
        select: { at: true, status: true },
        take: 100000,
      });

      // Group by bucket
      const bucketData: Map<string, { total: number; errors: number }> = new Map();
      for (const c of calls) {
        const bucketTime = new Date(Math.floor(c.at.getTime() / bucketMs) * bucketMs).toISOString();
        if (!bucketData.has(bucketTime)) bucketData.set(bucketTime, { total: 0, errors: 0 });
        const data = bucketData.get(bucketTime)!;
        data.total++;
        if (c.status === 'fail') data.errors++;
      }

      for (const [key, data] of bucketData) {
        buckets.set(key, data.total > 0 ? Math.round((data.errors / data.total) * 10000) / 100 : 0);
      }
      break;
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, value]) => ({ t, value }));
}
