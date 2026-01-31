/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * dau.calculator.ts (Koda)
 * ------------------------
 * DAU (Daily Active Users) calculator.
 *
 * Definition (practical for Koda):
 *  - A user is "active" on a day if they have at least one qualifying event that day.
 *
 * Qualifying event sources (choose what exists in your DB):
 *  1) analytics_user_activity (best, if present)
 *  2) query_telemetry (good proxy for "active in product")
 *  3) messages (fallback proxy)
 *
 * This calculator supports both:
 *  - "for one day" DAU
 *  - "daily series" DAU for a range
 */

export interface DauInput {
  from: string; // ISO inclusive
  to: string;   // ISO exclusive
  source?: "analytics_user_activity" | "query_telemetry" | "messages";
}

export interface DauSeriesPoint {
  day: string; // YYYY-MM-DD
  dau: number;
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dayKey(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export class DauCalculator {
  constructor(private prisma: any) {}

  /**
   * DAU series across a date range (bounded by the caller).
   */
  async series(input: DauInput): Promise<DauSeriesPoint[]> {
    const from = toDate(input.from);
    const to = toDate(input.to);

    const source = input.source || this.pickBestSource();

    // Build daily buckets
    const buckets: Record<string, Set<string>> = {};
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      buckets[dayKey(d)] = new Set();
    }

    if (source === "analytics_user_activity" && this.prisma.analyticsUserActivity) {
      const rows = await this.prisma.analyticsUserActivity.findMany({
        where: { date: { gte: from, lt: to } },
        select: { userId: true, date: true },
      });

      for (const r of rows) {
        const k = dayKey(new Date(r.date));
        if (!buckets[k]) continue;
        buckets[k].add(r.userId);
      }
    } else if (source === "query_telemetry" && this.prisma.queryTelemetry) {
      // Use query telemetry as proxy of activity
      const rows = await this.prisma.queryTelemetry.findMany({
        where: { timestamp: { gte: from, lt: to } },
        select: { userId: true, timestamp: true },
        take: 20000, // bounded; you can swap to SQL rollup later
        orderBy: { timestamp: "desc" },
      });

      for (const r of rows) {
        if (!r.userId) continue;
        const k = dayKey(new Date(r.timestamp));
        if (!buckets[k]) continue;
        buckets[k].add(r.userId);
      }
    } else {
      // Fallback to messages
      const rows = await this.prisma.message.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { conversationId: true, createdAt: true, conversation: { select: { userId: true } } },
        take: 20000,
        orderBy: { createdAt: "desc" },
      });

      for (const r of rows) {
        const userId = r.conversation?.userId;
        if (!userId) continue;
        const k = dayKey(new Date(r.createdAt));
        if (!buckets[k]) continue;
        buckets[k].add(userId);
      }
    }

    return Object.keys(buckets)
      .sort()
      .map((day) => ({ day, dau: buckets[day].size }));
  }

  /**
   * DAU for the last complete UTC day (or custom day window).
   */
  async value(input: DauInput): Promise<number> {
    const points = await this.series(input);
    return points.reduce((sum, p) => sum + p.dau, 0) / Math.max(1, points.length);
  }

  private pickBestSource(): DauInput["source"] {
    if (this.prisma.analyticsUserActivity) return "analytics_user_activity";
    if (this.prisma.queryTelemetry) return "query_telemetry";
    return "messages";
  }
}

export default DauCalculator;
