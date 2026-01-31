/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { UsersResponse, DateRange } from "../types";
import UsersRepo from "../repositories/users.repo";
import TelemetryRepo from "../repositories/telemetry.repo";

/**
 * users.aggregator.ts (Koda)
 * --------------------------
 * Builds the Users screen response:
 *  - paginated users table
 *  - optional stats enrichment (last active approximation)
 *
 * Notes:
 *  - Keep it fast: no per-user N+1 lookups.
 *  - If you have a proper lastActive field/table, wire it here.
 */

export interface UsersAggregatorDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface UsersQueryInput {
  range: DateRange;
  query?: string;
  role?: string;
  subscriptionTier?: string;
  limit?: number;
  cursor?: string | null;
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class UsersAggregator {
  private usersRepo: UsersRepo;
  private telemetryRepo: TelemetryRepo;

  constructor(private deps: UsersAggregatorDeps) {
    const cfg = deps.config;
    this.usersRepo = new UsersRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.telemetryRepo = new TelemetryRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: UsersQueryInput): Promise<UsersResponse> {
    const { range } = input;

    const page = await this.usersRepo.list(
      {
        range,
        query: input.query,
        role: input.role,
        subscriptionTier: input.subscriptionTier,
      },
      {
        limit: input.limit,
        cursor: input.cursor || null,
      }
    );

    // Best-effort enrichment: approximate lastActiveAt using AnalyticsUserActivity if present
    // If not present, leave null (front-end can display "\u2014")
    const userIds = page.items.map((u) => u.id);
    const lastActiveByUser = await this.fetchLastActiveApprox(userIds, range);

    const items = page.items.map((u: any) => ({
      ...u,
      lastActiveAt: lastActiveByUser.get(u.id) || null,
    }));

    return {
      range,
      page: { items, nextCursor: page.nextCursor },
      stats: {
        returned: items.length,
        nextCursor: page.nextCursor,
      },
    };
  }

  private async fetchLastActiveApprox(userIds: string[], range: DateRange): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!userIds.length) return out;

    // Prefer AnalyticsUserActivity if your schema includes it
    if (this.deps.prisma.analyticsUserActivity) {
      try {
        const rows = await this.deps.prisma.analyticsUserActivity.findMany({
          where: { userId: { in: userIds }, date: { gte: toDate(range.from), lt: toDate(range.to) } },
          select: { userId: true, lastActiveAt: true, date: true },
          orderBy: [{ lastActiveAt: "desc" }, { date: "desc" }],
        });

        for (const r of rows) {
          if (!out.has(r.userId) && (r.lastActiveAt || r.date)) {
            out.set(r.userId, new Date(r.lastActiveAt || r.date).toISOString());
          }
        }
        return out;
      } catch {
        // ignore and fallback
      }
    }

    // Fallback: use QueryTelemetry timestamp as last activity approximation
    try {
      // Pull a small window of telemetry and compute per-user max timestamp
      const telem = await this.telemetryRepo.list(
        { range },
        { limit: 500 }
      );

      for (const row of telem.items || []) {
        const uid = (row as any).userId;
        if (!uid || !userIds.includes(uid)) continue;
        const ts = new Date((row as any).timestamp).toISOString();
        if (!out.has(uid) || ts > (out.get(uid) as string)) out.set(uid, ts);
      }
    } catch {
      // ignore
    }

    return out;
  }
}

export default UsersAggregator;
