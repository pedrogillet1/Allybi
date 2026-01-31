/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { SecurityResponse, DateRange } from "../types";
import ErrorLogsRepo from "../repositories/errorLogs.repo";
import ApiPerfRepo from "../repositories/apiPerf.repo";

/**
 * security.aggregator.ts (Koda)
 * -----------------------------
 * Produces the admin "Security" dashboard payload.
 *
 * Source of truth:
 *  - Security telemetry events are typically stored in AnalyticsEvent (eventType="security")
 *    and/or ErrorLog for access denied / suspicious sessions.
 *
 * Since your schema already has:
 *  - AuditLog
 *  - Session.isSuspicious + suspicionReason
 *  - ErrorLog
 * This aggregator uses a safe hybrid approach:
 *  - suspicious sessions from Session table
 *  - rate limit/access denied from AuditLog + AnalyticsEvent (if present)
 *
 * Adjust mappings once you finalize the telemetry persistence strategy for security events.
 */

export interface SecurityDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface SecurityInput {
  range: DateRange;
  limit?: number;
  cursor?: string | null;
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

export class SecurityAggregator {
  private errorRepo: ErrorLogsRepo;
  private apiRepo: ApiPerfRepo;

  constructor(private deps: SecurityDeps) {
    const cfg = deps.config;
    this.errorRepo = new ErrorLogsRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.apiRepo = new ApiPerfRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: SecurityInput): Promise<SecurityResponse> {
    const from = toDate(input.range.from);
    const to = toDate(input.range.to);

    // suspicious sessions from Session table
    const suspiciousSessions = await this.deps.prisma.session.count({
      where: { isSuspicious: true, createdAt: { gte: from, lt: to } },
    }).catch(() => 0);

    // rate-limit and access-denied from AuditLog (if used consistently)
    const rateLimitHits = await this.deps.prisma.auditLog.count({
      where: { action: { contains: "rate", mode: "insensitive" }, createdAt: { gte: from, lt: to } },
    }).catch(() => 0);

    const accessDenied = await this.deps.prisma.auditLog.count({
      where: { status: { in: ["denied", "forbidden", "unauthorized"] }, createdAt: { gte: from, lt: to } },
    }).catch(() => 0);

    const failedLogins = await this.deps.prisma.auditLog.count({
      where: { action: { contains: "login", mode: "insensitive" }, status: { in: ["failed", "denied"] }, createdAt: { gte: from, lt: to } },
    }).catch(() => 0);

    // A simple feed: use AnalyticsEvent if present, else ErrorLog fallback
    const limit = clampInt(input.limit, 1, this.deps.config.maxPageSize, this.deps.config.defaultPageSize);
    const cursor = input.cursor || null;

    const page = await this.listSecurityEvents(input.range, { limit, cursor });

    return {
      range: input.range,
      kpis: {
        suspiciousSessions,
        rateLimitHits,
        accessDenied,
        failedLogins,
      },
      page,
    };
  }

  private async listSecurityEvents(range: DateRange, opts: { limit: number; cursor?: string | null }) {
    const from = toDate(range.from);
    const to = toDate(range.to);
    const cursor = opts.cursor || null;

    // Prefer AnalyticsEvent (eventType="security") if you write security telemetry there
    if (this.deps.prisma.analyticsEvent) {
      const rows = await this.deps.prisma.analyticsEvent.findMany({
        where: { eventType: "security", timestamp: { gte: from, lt: to } },
        take: opts.limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        select: { id: true, timestamp: true, userId: true, eventName: true, category: true, properties: true },
      });

      const hasNext = rows.length > opts.limit;
      const page = hasNext ? rows.slice(0, opts.limit) : rows;
      const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

      return {
        items: page.map((r: any) => ({
          id: r.id,
          ts: new Date(r.timestamp).toISOString(),
          type: r.eventName || "security",
          severity: "info",
          userId: r.userId ?? null,
          ip: r.properties?.ip ?? null,
          meta: r.properties ?? null,
        })),
        nextCursor,
      };
    }

    // Fallback: show ErrorLog filtered by "security"/"auth"
    const rows = await this.errorRepo.list(
      {
        range,
        service: "security",
      } as any,
      {
        limit: opts.limit,
        cursor,
        includeStack: false,
      }
    );

    return rows;
  }
}

export default SecurityAggregator;
