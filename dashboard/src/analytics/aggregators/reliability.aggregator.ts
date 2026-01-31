/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { ReliabilityResponse, DateRange, HealthBadge, SeriesPoint } from "../types";
import TelemetryRepo from "../repositories/telemetry.repo";
import ApiPerfRepo from "../repositories/apiPerf.repo";
import ErrorLogsRepo from "../repositories/errorLogs.repo";

/**
 * reliability.aggregator.ts (Koda)
 * --------------------------------
 * Produces the admin "Reliability" dashboard payload:
 *  - streaming health: ttft, totalMs, abort/disconnect rates
 *  - API performance: p95 totalMs approximation
 *  - error + fallback rates
 *
 * Source of truth:
 *  - QueryTelemetry for stream + routing flags
 *  - APIPerformanceLog for endpoint latency/error rate
 *  - ErrorLog for crash visibility
 *
 * Notes:
 *  - Uses bounded sampling (no full scans)
 *  - Percentiles are approximations unless you add SQL views/materialized rollups
 */

export interface ReliabilityDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface ReliabilityInput {
  range: DateRange;
  bucket?: "hour" | "day";
  sampleLimit?: number; // default 1200
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function clampBucket(range: DateRange, preferred?: "hour" | "day"): "hour" | "day" {
  if (preferred) return preferred;
  const d = daysBetween(toDate(range.from), toDate(range.to));
  return d <= 2 ? "hour" : "day";
}

function bucketKey(d: Date, bucket: "hour" | "day") {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  if (bucket === "day") return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00:00.000Z`;
}

function mapSeries(map: Map<string, number>): SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, v]) => ({ t, v }));
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx] ?? null;
}

function badges(cfg: AnalyticsConfig, kpis: any): HealthBadge[] {
  const out: HealthBadge[] = [];

  if (typeof kpis.errorRate === "number") {
    if (kpis.errorRate >= cfg.thresholds.errorRateError) out.push({ status: "error", metric: "errorRate", value: kpis.errorRate, threshold: cfg.thresholds.errorRateError, reason: "High error rate" });
    else if (kpis.errorRate >= cfg.thresholds.errorRateWarn) out.push({ status: "warn", metric: "errorRate", value: kpis.errorRate, threshold: cfg.thresholds.errorRateWarn, reason: "Elevated error rate" });
  }

  if (typeof kpis.fallbackRate === "number" && kpis.fallbackRate >= cfg.thresholds.fallbackRateWarn) {
    out.push({ status: "warn", metric: "fallbackRate", value: kpis.fallbackRate, threshold: cfg.thresholds.fallbackRateWarn, reason: "Fallback rate elevated" });
  }

  if (typeof kpis.avgTtftMs === "number") {
    if (kpis.avgTtftMs >= cfg.thresholds.ttftMsError) out.push({ status: "error", metric: "ttftMs", value: kpis.avgTtftMs, threshold: cfg.thresholds.ttftMsError, reason: "TTFT too high" });
    else if (kpis.avgTtftMs >= cfg.thresholds.ttftMsWarn) out.push({ status: "warn", metric: "ttftMs", value: kpis.avgTtftMs, threshold: cfg.thresholds.ttftMsWarn, reason: "TTFT elevated" });
  }

  return out;
}

export class ReliabilityAggregator {
  private telemetryRepo: TelemetryRepo;
  private apiRepo: ApiPerfRepo;
  private errorRepo: ErrorLogsRepo;

  constructor(private deps: ReliabilityDeps) {
    const cfg = deps.config;
    this.telemetryRepo = new TelemetryRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.apiRepo = new ApiPerfRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
    this.errorRepo = new ErrorLogsRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: ReliabilityInput): Promise<ReliabilityResponse> {
    const sampleLimit = Math.min(Math.max(input.sampleLimit ?? 1200, 300), 3000);
    const bucket = clampBucket(input.range, input.bucket);

    const from = toDate(input.range.from);
    const to = toDate(input.range.to);

    // sample telemetry rows for reliability
    const telem = await this.telemetryRepo.list({ range: input.range } as any, { limit: sampleLimit });
    const rows: any[] = telem.items || [];

    const ttftVals: number[] = [];
    const totalVals: number[] = [];

    let streamCount = 0;
    let aborted = 0;
    let disconnected = 0;

    let errors = 0;
    let fallbacks = 0;

    const seriesErrors = new Map<string, number>();
    const seriesAborts = new Map<string, number>();
    const seriesTtft = new Map<string, { sum: number; n: number }>();
    const seriesTotal = new Map<string, { sum: number; n: number }>();

    for (const r of rows) {
      const t = toDate(r.timestamp);
      if (t < from || t >= to) continue;
      const key = bucketKey(t, bucket);

      // stream heuristics: messageId indicates a response
      if (r.messageId) streamCount++;

      if (r.wasAborted) {
        aborted++;
        seriesAborts.set(key, (seriesAborts.get(key) || 0) + 1);
      }

      if (r.clientDisconnected) disconnected++;

      if (r.hasErrors) {
        errors++;
        seriesErrors.set(key, (seriesErrors.get(key) || 0) + 1);
      }

      if (r.hadFallback) fallbacks++;

      if (typeof r.ttft === "number") {
        ttftVals.push(r.ttft);
        const cur = seriesTtft.get(key) || { sum: 0, n: 0 };
        cur.sum += r.ttft;
        cur.n += 1;
        seriesTtft.set(key, cur);
      }

      if (typeof r.totalMs === "number") {
        totalVals.push(r.totalMs);
        const cur = seriesTotal.get(key) || { sum: 0, n: 0 };
        cur.sum += r.totalMs;
        cur.n += 1;
        seriesTotal.set(key, cur);
      }
    }

    ttftVals.sort((a, b) => a - b);
    totalVals.sort((a, b) => a - b);

    const avgTtftMs = avg(ttftVals);
    const avgTotalMs = avg(totalVals);

    const p95TotalMs = percentile(totalVals, 0.95);

    const errorRate = streamCount ? errors / streamCount : 0;
    const fallbackRate = streamCount ? fallbacks / streamCount : 0;

    const streamAbortedRate = streamCount ? aborted / streamCount : 0;
    const clientDisconnectRate = streamCount ? disconnected / streamCount : 0;

    // API perf (approx) for general backend reliability
    const apiAgg = await this.apiRepo.aggregate({ range: input.range } as any);

    return {
      range: input.range,
      kpis: {
        streamAbortedRate,
        clientDisconnectRate,
        avgTtftMs: avgTtftMs ?? undefined,
        avgTotalMs: avgTotalMs ?? undefined,
        p95TotalMs: p95TotalMs ?? undefined,
        errorRate: apiAgg?.errorRate ?? errorRate,
        fallbackRate,
      },
      badges: badges(this.deps.config, { errorRate: apiAgg?.errorRate ?? errorRate, fallbackRate, avgTtftMs }),
      series: {
        ttftMs: mapAvgSeries(seriesTtft),
        totalMs: mapAvgSeries(seriesTotal),
        errors: mapSeries(seriesErrors),
        aborts: mapSeries(seriesAborts),
      },
    };
  }
}

function avg(xs: number[]) {
  if (!xs.length) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  return sum / xs.length;
}

function mapAvgSeries(map: Map<string, { sum: number; n: number }>): SeriesPoint[] {
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, v]) => ({ t, v: v.n ? v.sum / v.n : 0 }));
}

export default ReliabilityAggregator;
