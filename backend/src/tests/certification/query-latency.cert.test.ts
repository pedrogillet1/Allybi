import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function resolvePerQueryReportPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../frontend/e2e/reports/latest/per_query.json"),
    path.resolve(process.cwd(), "frontend/e2e/reports/latest/per_query.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function isRuntimeFailureCode(value: unknown): boolean {
  const code = String(value || "")
    .trim()
    .toLowerCase();
  if (!code) return false;
  const runtimeSignals = [
    "timeout",
    "network",
    "connection",
    "transport",
    "provider",
    "gateway",
    "rate_limit",
    "internal",
    "server_error",
    "unavailable",
  ];
  return runtimeSignals.some((token) => code.includes(token));
}

describe("Certification: query latency gate", () => {
  test("records p95 query latency and pass/fail thresholds", () => {
    const failures: string[] = [];
    const reportPath = resolvePerQueryReportPath();
    if (!reportPath) {
      failures.push("MISSING_PER_QUERY_REPORT");
      writeCertificationGateReport("query-latency", {
        passed: false,
        metrics: {},
        thresholds: {
          p95LatencyMsMax: 12000,
          errorRateMax: 0.02,
          timeoutRateMax: 0.01,
        },
        failures,
      });
      expect(failures.length).toBeGreaterThanOrEqual(1);
      return;
    }

    const rows = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    const latencies = rows
      .map((row) => Number(row.latencyMs))
      .filter((value) => Number.isFinite(value) && value > 0);
    const p95LatencyMs = percentile(latencies, 95);
    const total = rows.length;
    const runtimeErrorCount = rows.filter((row) => {
      const status = String(row.status || "").trim().toUpperCase();
      const hasErrorField = String(row.error || "").trim().length > 0;
      return (
        status === "ERROR" ||
        hasErrorField ||
        isRuntimeFailureCode(row.failureCode)
      );
    }).length;
    const qualityFailCount = rows.filter((row) => {
      const status = String(row.status || "").trim().toUpperCase();
      return status === "FAIL" || status === "PARTIAL";
    }).length;
    const timeoutCount = rows.filter((row) => {
      const failureCode = String(row.failureCode || "")
        .trim()
        .toLowerCase();
      return failureCode.includes("timeout");
    }).length;

    const errorRate = total > 0 ? runtimeErrorCount / total : 1;
    const timeoutRate = total > 0 ? timeoutCount / total : 1;
    const qualityFailRate = total > 0 ? qualityFailCount / total : 1;

    if (total <= 0) failures.push("EMPTY_PER_QUERY_REPORT");
    if (p95LatencyMs == null) failures.push("MISSING_LATENCY_VALUES");
    if (p95LatencyMs != null && p95LatencyMs > 12000) {
      failures.push("P95_LATENCY_EXCEEDED");
    }
    if (errorRate > 0.02) failures.push("ERROR_RATE_EXCEEDED");
    if (timeoutRate > 0.01) failures.push("TIMEOUT_RATE_EXCEEDED");

    writeCertificationGateReport("query-latency", {
      passed: failures.length === 0,
      metrics: {
        reportPath,
        totalQueries: total,
        p95LatencyMs: p95LatencyMs == null ? null : Math.round(p95LatencyMs),
        runtimeErrorCount,
        qualityFailCount,
        errorRate,
        timeoutRate,
        qualityFailRate,
      },
      thresholds: {
        p95LatencyMsMax: 12000,
        errorRateMax: 0.02,
        timeoutRateMax: 0.01,
      },
      failures,
    });

    // Keep this test non-blocking; gate pass/fail is enforced by run-certification.
    expect(Array.isArray(rows)).toBe(true);
  });
});
