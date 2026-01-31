/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * errorLogs.repo.ts (Koda)
 * ------------------------
 * Read-only repository for ErrorLog + AnalyticsError (if used).
 *
 * Goals:
 *  - Provide a unified list for admin dashboards
 *  - Keep stack hidden by default (front-end can request includeStack)
 *  - Allow filtering by service, severity, resolved status
 */

export interface ErrorLogsRepoConfig {
  maxLimit: number;
  defaultLimit: number;
}

export interface ErrorLogFilters {
  range: DateRange;
  service?: string;
  severity?: string;   // "warn"|"error"|"fatal" (your schema uses string)
  resolved?: boolean;
  userId?: string;
  conversationId?: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ErrorLogRow {
  id: string;
  ts: string;

  service: string;
  errorType: string;
  severity: string;

  message: string;
  statusCode?: number | null;

  resolved: boolean;
  resolvedAt?: string | null;

  userId?: string | null;
  conversationId?: string | null;

  requestPath?: string | null;
  httpMethod?: string | null;

  // stack omitted by default
  stack?: string | null;

  // safe metadata blob for drilldown
  metadata?: any;
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

export class ErrorLogsRepo {
  constructor(private prisma: any, private cfg: ErrorLogsRepoConfig) {}

  async list(
    filters: ErrorLogFilters,
    opts: { limit?: number; cursor?: string | null; includeStack?: boolean } = {}
  ): Promise<CursorPage<ErrorLogRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };

    if (filters.service) where.service = filters.service;
    if (filters.severity) where.severity = filters.severity;
    if (typeof filters.resolved === "boolean") where.resolved = filters.resolved;
    if (filters.userId) where.userId = filters.userId;
    if (filters.conversationId) where.conversationId = filters.conversationId;

    const rows = await this.prisma.errorLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        service: true,
        errorType: true,
        errorMessage: true,
        errorStack: Boolean(opts.includeStack ?? false),
        severity: true,
        resolved: true,
        resolvedAt: true,
        userId: true,
        conversationId: true,
        requestPath: true,
        httpMethod: true,
        statusCode: true,
        metadata: true,
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        id: r.id,
        ts: new Date(r.createdAt).toISOString(),
        service: r.service,
        errorType: r.errorType,
        severity: r.severity,
        message: r.errorMessage,
        statusCode: r.statusCode ?? null,
        resolved: Boolean(r.resolved),
        resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
        userId: r.userId ?? null,
        conversationId: r.conversationId ?? null,
        requestPath: r.requestPath ?? null,
        httpMethod: r.httpMethod ?? null,
        stack: opts.includeStack ? r.errorStack ?? null : null,
        metadata: r.metadata ?? null,
      })),
      nextCursor,
    };
  }

  /**
   * Aggregate summary for dashboard tiles: counts by severity and top services.
   */
  async aggregate(filters: ErrorLogFilters) {
    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };
    if (filters.service) where.service = filters.service;

    const total = await this.prisma.errorLog.count({ where });

    const bySeverity = await this.prisma.errorLog.groupBy({
      by: ["severity"],
      where,
      _count: { _all: true },
    });

    const byService = await this.prisma.errorLog.groupBy({
      by: ["service"],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
      take: 10,
    });

    return {
      total,
      bySeverity: bySeverity.map((x: any) => ({ key: x.severity, count: x._count._all })),
      byService: byService.map((x: any) => ({ key: x.service, count: x._count._all })),
    };
  }
}

export default ErrorLogsRepo;
