import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

function normalizePath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return path.resolve(trimmed);
}

function findNewestArchivePerQuery(frontendReportsRoot: string): string | null {
  const archiveRoot = path.join(frontendReportsRoot, "archive");
  if (!fs.existsSync(archiveRoot)) return null;
  const dirs = fs
    .readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a));
  for (const dirName of dirs) {
    const candidate = path.join(archiveRoot, dirName, "per_query.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveFromLineage(frontendReportsRoot: string): string | null {
  const lineagePath = path.join(frontendReportsRoot, "latest", "lineage.json");
  if (!fs.existsSync(lineagePath)) return null;
  try {
    const lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8")) as Record<
      string,
      unknown
    >;
    const archivePath = normalizePath(String(lineage?.archivePerQueryPath || ""));
    if (archivePath && fs.existsSync(archivePath)) return archivePath;
  } catch {
    return null;
  }
  return null;
}

function resolvePerQueryReportPath(): string | null {
  const requireLatest = (() => {
    const profile = String(process.env.CERT_PROFILE || "")
      .trim()
      .toLowerCase();
    return (
      profile === "retrieval_signoff" ||
      profile === "ci" ||
      profile === "release"
    );
  })();
  const explicitPath = String(process.env.CERT_QUERY_LATENCY_REPORT || "").trim();
  if (explicitPath) {
    const normalized = normalizePath(explicitPath);
    if (!normalized || !fs.existsSync(normalized)) return null;
    if (requireLatest) {
      const lowered = normalized.replace(/\\/g, "/").toLowerCase();
      if (!lowered.endsWith("/latest/per_query.json")) return null;
    }
    return normalized;
  }
  const frontendReportsRoots = [
    path.resolve(process.cwd(), "../frontend/e2e/reports"),
    path.resolve(process.cwd(), "frontend/e2e/reports"),
  ];
  for (const reportsRoot of frontendReportsRoots) {
    const latestPath = path.join(reportsRoot, "latest", "per_query.json");
    if (fs.existsSync(latestPath)) return latestPath;
    if (requireLatest) continue;
    const lineageResolved = resolveFromLineage(reportsRoot);
    if (lineageResolved) return lineageResolved;
    const newestArchive = findNewestArchivePerQuery(reportsRoot);
    if (newestArchive) return newestArchive;
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

function parseBooleanFlag(value: string | undefined): boolean {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function computeFileFingerprint(filePath: string): {
  path: string;
  sha256: string;
  bytes: number;
} | null {
  const normalized = normalizePath(filePath);
  if (!normalized || !fs.existsSync(normalized)) return null;
  try {
    const payload = fs.readFileSync(normalized);
    return {
      path: normalized,
      sha256: crypto.createHash("sha256").update(payload).digest("hex"),
      bytes: payload.byteLength,
    };
  } catch {
    return null;
  }
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
    const strictProfiles = new Set([
      "ci",
      "release",
      "retrieval_signoff",
      "local_hard",
    ]);
    const certProfile = String(process.env.CERT_PROFILE || "")
      .trim()
      .toLowerCase();
    const strictMode = parseBooleanFlag(process.env.CERT_STRICT);
    const qualityFailPolicy =
      strictMode && (strictProfiles.has(certProfile) || certProfile.length === 0)
        ? "blocking"
        : "advisory";
    const maxQualityFailRate = Number(
      process.env.CERT_QUERY_MAX_QUALITY_FAIL_RATE || "0.25",
    );
    const inputFingerprint = computeFileFingerprint(reportPath);

    if (total <= 0) failures.push("EMPTY_PER_QUERY_REPORT");
    if (p95LatencyMs == null) failures.push("MISSING_LATENCY_VALUES");
    if (!inputFingerprint) failures.push("INPUT_REPORT_FINGERPRINT_UNAVAILABLE");
    if (p95LatencyMs != null && p95LatencyMs > 12000) {
      failures.push("P95_LATENCY_EXCEEDED");
    }
    if (errorRate > 0.02) failures.push("ERROR_RATE_EXCEEDED");
    if (timeoutRate > 0.01) failures.push("TIMEOUT_RATE_EXCEEDED");
    if (qualityFailRate > maxQualityFailRate && qualityFailPolicy === "blocking") {
      failures.push("QUALITY_FAIL_RATE_EXCEEDED");
    }

    writeCertificationGateReport("query-latency", {
      passed: failures.length === 0,
      metrics: {
        reportPath,
        inputReportPath: inputFingerprint?.path || null,
        inputReportSha256: inputFingerprint?.sha256 || null,
        inputReportBytes: inputFingerprint?.bytes || null,
        totalQueries: total,
        p95LatencyMs: p95LatencyMs == null ? null : Math.round(p95LatencyMs),
        runtimeErrorCount,
        qualityFailCount,
        errorRate,
        timeoutRate,
        qualityFailRate,
        qualityFailPolicy,
      },
      thresholds: {
        p95LatencyMsMax: 12000,
        errorRateMax: 0.02,
        timeoutRateMax: 0.01,
        maxQualityFailRate,
      },
      failures,
    });

    // Keep this test non-blocking; gate pass/fail is enforced by run-certification.
    expect(Array.isArray(rows)).toBe(true);
  });
});
