/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * telemetry.repo.ts (Koda)
 * ------------------------
 * Read-only repository for QueryTelemetry (pipeline trace table).
 *
 * Goals:
 *  - Provide bounded, paginated access for admin dashboards
 *  - Keep query shapes stable and predictable
 *  - Never mutate data (read-only)
 */

export interface TelemetryRepoConfig {
  maxLimit: number;       // e.g. 200
  defaultLimit: number;   // e.g. 50
}

export interface TelemetryListFilters {
  range: DateRange;
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
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface QueryTelemetryRow {
  id: string;
  queryId: string;

  userId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;

  timestamp: string; // ISO

  intent?: string | null;
  intentConfidence?: number | null;
  domain?: string | null;
  family?: string | null;
  subIntent?: string | null;
  questionType?: string | null;

  retrievalMethod?: string | null;
  chunksReturned?: number | null;
  distinctDocs?: number | null;
  bm25Results?: number | null;
  vectorResults?: number | null;
  topRelevanceScore?: number | null;
  avgRelevanceScore?: number | null;

  formatMode?: string | null;
  formattingPassed?: boolean | null;
  formattingViolations?: string[] | null;

  resolvedLang?: string | null;
  languageMismatch?: boolean | null;

  ttft?: number | null;
  totalMs?: number | null;

  hadFallback?: boolean | null;
  fallbackScenario?: string | null;
  hasErrors?: boolean | null;
  failureCategory?: string | null;
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class TelemetryRepo {
  constructor(private prisma: any, private cfg: TelemetryRepoConfig) {}

  /**
   * Cursor-based pagination for QueryTelemetry rows.
   * Cursor is the Prisma row id.
   */
  async list(filters: TelemetryListFilters, opts: { limit?: number; cursor?: string | null } = {}): Promise<CursorPage<QueryTelemetryRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      timestamp: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;
    if (filters.messageId) where.messageId = filters.messageId;
    if (filters.intent) where.intent = filters.intent;
    if (filters.domain) where.domain = filters.domain;
    if (filters.answerMode) where.answerMode = filters.answerMode;
    if (filters.retrievalMethod) where.retrievalMethod = filters.retrievalMethod;
    if (typeof filters.hasErrors === "boolean") where.hasErrors = filters.hasErrors;
    if (typeof filters.hadFallback === "boolean") where.hadFallback = filters.hadFallback;
    if (filters.failureCategory) where.failureCategory = filters.failureCategory;
    if (typeof filters.languageMismatch === "boolean") where.languageMismatch = filters.languageMismatch;

    const rows = await this.prisma.queryTelemetry.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      select: {
        id: true,
        queryId: true,
        userId: true,
        conversationId: true,
        messageId: true,
        timestamp: true,

        intent: true,
        intentConfidence: true,
        domain: true,
        family: true,
        subIntent: true,
        questionType: true,

        retrievalMethod: true,
        chunksReturned: true,
        distinctDocs: true,
        bm25Results: true,
        vectorResults: true,
        topRelevanceScore: true,
        avgRelevanceScore: true,

        formatMode: true,
        formattingPassed: true,
        formattingViolations: true,

        resolvedLang: true,
        languageMismatch: true,

        ttft: true,
        totalMs: true,

        hadFallback: true,
        fallbackScenario: true,
        hasErrors: true,
        failureCategory: true,
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        ...r,
        timestamp: new Date(r.timestamp).toISOString(),
      })),
      nextCursor,
    };
  }

  /**
   * Fetch a single QueryTelemetry row for drill-down.
   * Include heavy fields (errors, budgets, constraints) for detail view.
   */
  async getByQueryId(queryId: string) {
    if (!queryId) return null;
    return this.prisma.queryTelemetry.findUnique({
      where: { queryId },
    });
  }
}

export default TelemetryRepo;
