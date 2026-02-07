/**
 * Query Trace Service
 * Provides detailed forensic trace data for individual queries
 * Includes waterfall timeline, bank usage, keywords, and entities
 */

import type { PrismaClient } from '@prisma/client';
import { supportsModel } from './_shared/prismaAdapter';

// ============================================================================
// Types
// ============================================================================

export interface TraceSpan {
  id: string;
  stepName: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: string; // ok, error, skipped
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
}

export interface BankUsage {
  id: string;
  bankType: string;
  bankId: string;
  bankVersion: string | null;
  stageUsed: string;
  createdAt: string;
}

export interface KeywordItem {
  keyword: string;
  weight: number | null;
}

export interface EntityItem {
  type: string;
  value: string;
  confidence: number | null;
}

export interface QueryTraceDetail {
  // Header
  traceId: string;
  queryId: string;
  userId: string;
  timestamp: string;
  language: string;

  // Routing
  domain: string;
  domainConfidence: number | null;
  intent: string;
  intentConfidence: number;
  operator: string;
  subIntent: string | null;

  // Quality
  answerScore: number | null;
  weakEvidence: boolean;
  noEvidence: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;

  // Performance
  latencyTotalMs: number | null;
  ttftMs: number | null;
  cost: number | null;

  // Retrieval
  docsEligible: number;
  docsSearched: number;
  chunksReturned: number;
  chunksUsed: number;
  topScore: number | null;

  // Answer
  answerMode: string | null;
  outputShape: string | null;
  answerLength: number | null;
  citationCount: number;

  // Waterfall
  spans: TraceSpan[];

  // Banks used
  banksUsed: BankUsage[];

  // Keywords/Entities
  keywords: KeywordItem[];
  entities: EntityItem[];

  // Model calls for this trace
  modelCalls: Array<{
    provider: string;
    model: string;
    stage: string;
    status: string;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number | null;
    errorCode: string | null;
  }>;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Get detailed trace data for a query
 * Combines data from QueryTelemetry, TraceSpan, BankUsageEvent, QueryKeyword, QueryEntity, and ModelCall
 */
export async function getQueryTrace(
  prisma: PrismaClient,
  traceId: string
): Promise<QueryTraceDetail | null> {
  // Try to find the query in QueryTelemetry first
  let baseTelemetry: any = null;

  if (supportsModel(prisma, 'queryTelemetry')) {
    baseTelemetry = await prisma.queryTelemetry.findFirst({
      where: {
        OR: [
          { queryId: traceId },
          { id: traceId },
        ],
      },
    });
  }

  // Fallback to RetrievalEvent if not found
  if (!baseTelemetry && supportsModel(prisma, 'retrievalEvent')) {
    const event = await prisma.retrievalEvent.findFirst({
      where: { traceId },
    });
    if (event) {
      baseTelemetry = {
        queryId: event.traceId,
        userId: event.userId,
        conversationId: event.conversationId,
        timestamp: event.at,
        intent: event.intent,
        intentConfidence: 0.8, // Default
        domain: event.domain,
        family: event.operator,
        chunksReturned: event.sourcesCount ?? 0,
        topRelevanceScore: event.evidenceStrength,
        hadFallback: !!event.fallbackReasonCode,
        fallbackScenario: event.fallbackReasonCode,
        totalMs: null,
        answerMode: event.navPillsUsed ? 'nav_pills' : 'doc_grounded_single',
        resolvedLang: 'en',
      };
    }
  }

  if (!baseTelemetry) {
    return null;
  }

  // Get trace spans (waterfall)
  let spans: TraceSpan[] = [];
  if (supportsModel(prisma, 'traceSpan')) {
    const spanRecords = await prisma.traceSpan.findMany({
      where: { traceId },
      orderBy: { startedAt: 'asc' },
    });
    spans = spanRecords.map(s => ({
      id: s.id,
      stepName: s.stepName,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      durationMs: s.durationMs,
      status: s.status,
      errorCode: s.errorCode,
      metadata: s.metadata as Record<string, unknown> | null,
    }));
  }

  // Get bank usage events
  let banksUsed: BankUsage[] = [];
  if (supportsModel(prisma, 'bankUsageEvent')) {
    const bankRecords = await prisma.bankUsageEvent.findMany({
      where: { traceId },
      orderBy: { createdAt: 'asc' },
    });
    banksUsed = bankRecords.map(b => ({
      id: b.id,
      bankType: b.bankType,
      bankId: b.bankId,
      bankVersion: b.bankVersion,
      stageUsed: b.stageUsed,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  // Get keywords
  let keywords: KeywordItem[] = [];
  if (supportsModel(prisma, 'queryKeyword')) {
    const keywordRecords = await prisma.queryKeyword.findMany({
      where: { traceId },
      orderBy: { weight: 'desc' },
    });
    keywords = keywordRecords.map(k => ({
      keyword: k.keyword,
      weight: k.weight,
    }));
  }

  // Get entities
  let entities: EntityItem[] = [];
  if (supportsModel(prisma, 'queryEntity')) {
    const entityRecords = await prisma.queryEntity.findMany({
      where: { traceId },
      orderBy: { confidence: 'desc' },
    });
    entities = entityRecords.map(e => ({
      type: e.entityType,
      value: e.value,
      confidence: e.confidence,
    }));
  }

  // Get model calls
  let modelCalls: QueryTraceDetail['modelCalls'] = [];
  if (supportsModel(prisma, 'modelCall')) {
    const callRecords = await prisma.modelCall.findMany({
      where: { traceId },
      orderBy: { at: 'asc' },
    });
    modelCalls = callRecords.map(c => ({
      provider: c.provider,
      model: c.model,
      stage: c.stage,
      status: c.status,
      promptTokens: c.promptTokens,
      completionTokens: c.completionTokens,
      durationMs: c.durationMs,
      errorCode: c.errorCode,
    }));
  }

  // Calculate totals
  const totalTokens = modelCalls.reduce(
    (sum, c) => sum + (c.promptTokens ?? 0) + (c.completionTokens ?? 0),
    0
  );
  const totalDuration = modelCalls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);

  // Derive evidence flags
  const weakEvidence = baseTelemetry.fallbackScenario === 'WEAK_EVIDENCE' ||
    (baseTelemetry.topRelevanceScore !== null && baseTelemetry.topRelevanceScore < 0.35);
  const noEvidence = baseTelemetry.fallbackScenario === 'NO_EVIDENCE' ||
    baseTelemetry.fallbackScenario === 'NO_DOCS' ||
    baseTelemetry.chunksReturned === 0;

  // Build response
  return {
    // Header
    traceId,
    queryId: baseTelemetry.queryId ?? baseTelemetry.id,
    userId: baseTelemetry.userId,
    timestamp: baseTelemetry.timestamp instanceof Date
      ? baseTelemetry.timestamp.toISOString()
      : baseTelemetry.timestamp,
    language: baseTelemetry.resolvedLang ?? 'en',

    // Routing
    domain: baseTelemetry.domain ?? 'general',
    domainConfidence: baseTelemetry.domainConfidence ?? null,
    intent: baseTelemetry.intent ?? 'chat',
    intentConfidence: baseTelemetry.intentConfidence ?? 0.8,
    operator: baseTelemetry.family ?? baseTelemetry.operatorFamily ?? 'qa',
    subIntent: baseTelemetry.subIntent ?? null,

    // Quality
    answerScore: baseTelemetry.topRelevanceScore ?? null,
    weakEvidence,
    noEvidence,
    fallbackUsed: baseTelemetry.hadFallback ?? false,
    fallbackReason: baseTelemetry.fallbackScenario ?? null,

    // Performance
    latencyTotalMs: baseTelemetry.totalMs ?? totalDuration ?? null,
    ttftMs: baseTelemetry.ttft ?? null,
    cost: baseTelemetry.estimatedCostUsd ?? null,

    // Retrieval
    docsEligible: baseTelemetry.distinctDocs ?? 0,
    docsSearched: baseTelemetry.distinctDocs ?? 0,
    chunksReturned: baseTelemetry.chunksReturned ?? 0,
    chunksUsed: baseTelemetry.chunksReturned ?? 0,
    topScore: baseTelemetry.topRelevanceScore ?? null,

    // Answer
    answerMode: baseTelemetry.answerMode ?? null,
    outputShape: baseTelemetry.outputShape ?? null,
    answerLength: baseTelemetry.answerLength ?? null,
    citationCount: baseTelemetry.citationCount ?? 0,

    // Waterfall
    spans,

    // Banks used
    banksUsed,

    // Keywords/Entities
    keywords,
    entities,

    // Model calls
    modelCalls,
  };
}

// ============================================================================
// Waterfall Stats Helper
// ============================================================================

/**
 * Get aggregated waterfall stats for a time range
 * Useful for identifying slow pipeline steps
 */
export interface WaterfallStats {
  stepName: string;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  errorRate: number;
  callCount: number;
}

export async function getWaterfallStats(
  prisma: PrismaClient,
  params: { from: Date; to: Date }
): Promise<WaterfallStats[]> {
  if (!supportsModel(prisma, 'traceSpan')) {
    return [];
  }

  const { from, to } = params;

  // Get all spans in range
  const spans = await prisma.traceSpan.findMany({
    where: {
      startedAt: { gte: from, lt: to },
    },
    select: {
      stepName: true,
      durationMs: true,
      status: true,
    },
  });

  // Group by step name
  const byStep = new Map<string, Array<{ durationMs: number | null; status: string }>>();
  for (const span of spans) {
    const arr = byStep.get(span.stepName) ?? [];
    arr.push({ durationMs: span.durationMs, status: span.status });
    byStep.set(span.stepName, arr);
  }

  // Calculate stats for each step
  const stats: WaterfallStats[] = [];
  for (const [stepName, entries] of byStep) {
    const durations = entries
      .map(e => e.durationMs)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    const errorCount = entries.filter(e => e.status === 'error').length;

    if (durations.length === 0) {
      stats.push({
        stepName,
        avgDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        errorRate: entries.length > 0 ? errorCount / entries.length : 0,
        callCount: entries.length,
      });
      continue;
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];

    stats.push({
      stepName,
      avgDurationMs: Math.round(avg),
      p50DurationMs: p50,
      p95DurationMs: p95,
      errorRate: errorCount / entries.length,
      callCount: entries.length,
    });
  }

  // Sort by pipeline order
  const pipelineOrder = [
    'DOC_INDEX_LOAD',
    'QUERY_NORMALIZE',
    'INTENT_RESOLVE',
    'CONVERSATION_CHECK',
    'DOC_AVAILABILITY',
    'QUERY_REWRITE',
    'SCOPE_RESOLVE',
    'CANDIDATE_FILTER',
    'RETRIEVAL',
    'RANKING',
    'ANSWER_MODE_ROUTE',
    'ANSWER_GENERATE',
    'RENDER_POLICY',
    'GROUNDING_CHECK',
    'SOURCE_FILTER',
    'QUALITY_GATES',
    'FINALIZE',
    'STATE_UPDATE',
    'TELEMETRY_EMIT',
  ];

  stats.sort((a, b) => {
    const aIdx = pipelineOrder.indexOf(a.stepName);
    const bIdx = pipelineOrder.indexOf(b.stepName);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return stats;
}
