/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * wau.calculator.ts (Koda)
 * ------------------------
 * WAU (Weekly Active Users) calculator.
 *
 * Definition:
 *  - A user is "active" in a 7-day window if they have >=1 qualifying event in that window.
 *
 * Output:
 *  - WAU value for a range (moving weekly window), or a single WAU for a given period.
 */

export interface WauInput {
  from: string; // ISO inclusive
  to: string;   // ISO exclusive
  source?: "analytics_user_activity" | "query_telemetry" | "messages";
  windowDays?: number; // default 7
}

export interface WauSeriesPoint {
  weekStart: string; // YYYY-MM-DD (UTC)
  wau: number;
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

export class WauCalculator {
  constructor(private prisma: any) {}

  async series(input: WauInput): Promise<WauSeriesPoint[]> {
    const from = toDate(input.from);
    const to = toDate(input.to);
    const windowDays = Math.max(2, Math.min(30, input.windowDays ?? 7));

    // Build daily active sets first (reuse logic similar to DAU)
    const daily = await this.dailyActiveSets(from, to, input.source);

    // Now compute WAU windows
    const days = Object.keys(daily).sort();
    const points: WauSeriesPoint[] = [];

    for (let i = 0; i < days.length; i++) {
      const startDay = days[i];
      const startDate = toDate(`${startDay}T00:00:00.000Z`);
      const endDate = addDays(startDate, windowDays);

      // union users across window
      const users = new Set<string>();
      for (let j = i; j < days.length; j++) {
        const d = toDate(`${days[j]}T00:00:00.000Z`);
        if (d >= endDate) break;
        for (const uid of daily[days[j]]) users.add(uid);
      }

      points.push({ weekStart: startDay, wau: users.size });
    }

    return points;
  }

  async value(input: WauInput): Promise<number> {
    const pts = await this.series(input);
    if (!pts.length) return 0;
    return pts[pts.length - 1].wau;
  }

  private async dailyActiveSets(from: Date, to: Date, source?: WauInput["source"]) {
    const bestSource = source || this.pickBestSource();
    const buckets: Record<string, Set<string>> = {};
    for (let d = new Date(from); d < to; d = addDays(d, 1)) {
      buckets[dayKey(d)] = new Set();
    }

    if (bestSource === "analytics_user_activity" && this.prisma.analyticsUserActivity) {
      const rows = await this.prisma.analyticsUserActivity.findMany({
        where: { date: { gte: from, lt: to } },
        select: { userId: true, date: true },
      });

      for (const r of rows) {
        const k = dayKey(new Date(r.date));
        buckets[k]?.add(r.userId);
      }
      return buckets;
    }

    if (bestSource === "query_telemetry" && this.prisma.queryTelemetry) {
      const rows = await this.prisma.queryTelemetry.findMany({
        where: { timestamp: { gte: from, lt: to } },
        select: { userId: true, timestamp: true },
        take: 30000,
        orderBy: { timestamp: "desc" },
      });

      for (const r of rows) {
        if (!r.userId) continue;
        const k = dayKey(new Date(r.timestamp));
        buckets[k]?.add(r.userId);
      }
      return buckets;
    }

    // messages fallback
    const rows = await this.prisma.message.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { createdAt: true, conversation: { select: { userId: true } } },
      take: 30000,
      orderBy: { createdAt: "desc" },
    });

    for (const r of rows) {
      const uid = r.conversation?.userId;
      if (!uid) continue;
      const k = dayKey(new Date(r.createdAt));
      buckets[k]?.add(uid);
    }
    return buckets;
  }

  private pickBestSource(): WauInput["source"] {
    if (this.prisma.analyticsUserActivity) return "analytics_user_activity";
    if (this.prisma.queryTelemetry) return "query_telemetry";
    return "messages";
  }
}

export default WauCalculator;
