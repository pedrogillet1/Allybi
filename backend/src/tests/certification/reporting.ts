import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import type { CertificationGateReport } from "./types";

const CERT_DIR = path.resolve(process.cwd(), "reports/cert");
const CERT_GATES_DIR = path.join(CERT_DIR, "gates");

function ensureDirs(): void {
  fs.mkdirSync(CERT_GATES_DIR, { recursive: true });
}

function resolveCommitHash(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const hash = String(result.stdout || "").trim();
  return hash || null;
}

export function writeCertificationGateReport(
  gateId: string,
  report: Omit<CertificationGateReport, "gateId" | "generatedAt">,
): CertificationGateReport {
  ensureDirs();
  const resolved: CertificationGateReport = {
    gateId,
    generatedAt: new Date().toISOString(),
    meta: {
      commitHash: resolveCommitHash(),
      source: process.env.CERT_GATE_SOURCE || "jest",
      lifecycleEvent: process.env.npm_lifecycle_event || "",
    },
    passed: report.passed,
    metrics: report.metrics,
    thresholds: report.thresholds,
    failures: report.failures,
  };
  const filePath = path.join(CERT_GATES_DIR, `${gateId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
  return resolved;
}
