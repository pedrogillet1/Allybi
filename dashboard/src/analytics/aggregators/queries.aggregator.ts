/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { QueriesResponse, DateRange, QueryRow } from "../types";
import TelemetryRepo from "../repositories/telemetry.repo";

/**
 * queries.aggregator.ts (Koda)
 * ----------------------------
 * Builds the Admin "Queries" explorer payload:
 *  - paginated QueryTelemetry rows
 *  - lightweight summary stats for filters
 *
 * Notes:
 *  - This reads QueryTelemetry (pipeline traces) only.
 *  - Heavy per-query details are fetched by queryId via TelemetryRepo.getByQueryId().
 */

export interface QueriesAggregatorDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface QueriesQueryInput {
  range: DateRange;

  // Filters
  userId?: string;
  conversationId?: string;
  messageId?: string;
  intent?: string;
  domain?: string;
  answerMode?: string;
  retrievalMethod?: string;
  hasErrors?: boolean;
  hadFallback?: boolean;
  failureCategory?: string;
  languageMismatch?: boolean;

  limit?: number;
  cursor?: string | null;
}

export class QueriesAggregator {
  private telemetryRepo: TelemetryRepo;

  constructor(private deps: QueriesAggregatorDeps) {
    const cfg = deps.config;
    this.telemetryRepo = new TelemetryRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: QueriesQueryInput): Promise<QueriesResponse> {
    const range = input.range;

    const page = await this.telemetryRepo.list(
      {
        range,
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        intent: input.intent,
        domain: input.domain,
        answerMode: input.answerMode,
        retrievalMethod: input.retrievalMethod,
        hasErrors: input.hasErrors,
        hadFallback: input.hadFallback,
        failureCategory: input.failureCategory,
        languageMismatch: input.languageMismatch,
      },
      {
        limit: input.limit,
        cursor: input.cursor || null,
      }
    );

    // Map QueryTelemetryRow -> QueryRow contract for frontend tables
    const items: QueryRow[] = page.items.map((r: any) => ({
      id: r.queryId || r.id,
      ts: r.timestamp,
      userId: r.userId ?? null,
      conversationId: r.conversationId ?? null,
      messageId: r.messageId ?? null,
      intent: r.intent ?? null,
      confidence: r.intentConfidence ?? null,
      domain: r.domain ?? null,
      answerMode: (r as any).answerMode ?? null, // if your QueryTelemetry table stores answerMode
      retrievalMethod: r.retrievalMethod ?? null,
      distinctDocs: r.distinctDocs ?? null,
      chunksReturned: r.chunksReturned ?? null,
      ttftMs: r.ttft ?? null,
      totalMs: r.totalMs ?? null,
      hadFallback: Boolean(r.hadFallback ?? false),
      hasErrors: Boolean(r.hasErrors ?? false),
      failureCategory: r.failureCategory ?? null,
    }));

    // Lightweight stats for UI filter chips (computed from returned page)
    const stats = computeStats(items);

    return {
      range,
      page: { items, nextCursor: page.nextCursor },
      stats: {
        ...stats,
        returned: items.length,
        nextCursor: page.nextCursor,
      },
    };
  }
}

function computeStats(items: QueryRow[]) {
  const intents = new Map<string, number>();
  const domains = new Map<string, number>();
  let errors = 0;
  let fallbacks = 0;

  for (const it of items) {
    if (it.intent) intents.set(it.intent, (intents.get(it.intent) || 0) + 1);
    if (it.domain) domains.set(it.domain, (domains.get(it.domain) || 0) + 1);
    if (it.hasErrors) errors++;
    if (it.hadFallback) fallbacks++;
  }

  return {
    errorCount: errors,
    fallbackCount: fallbacks,
    topIntents: [...intents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, count]) => ({ key, count })),
    topDomains: [...domains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([key, count]) => ({ key, count })),
  };
}

export default QueriesAggregator;
