import fs from "fs";
import path from "path";
import type { CertificationGateReport } from "./types";

const CERT_DIR = path.resolve(process.cwd(), "reports/cert");
const CERT_GATES_DIR = path.join(CERT_DIR, "gates");

function ensureDirs(): void {
  fs.mkdirSync(CERT_GATES_DIR, { recursive: true });
}

export function writeCertificationGateReport(
  gateId: string,
  report: Omit<CertificationGateReport, "gateId" | "generatedAt">,
): CertificationGateReport {
  ensureDirs();
  const resolved: CertificationGateReport = {
    gateId,
    generatedAt: new Date().toISOString(),
    passed: report.passed,
    metrics: report.metrics,
    thresholds: report.thresholds,
    failures: report.failures,
  };
  const filePath = path.join(CERT_GATES_DIR, `${gateId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(resolved, null, 2)}\n`, "utf8");
  return resolved;
}
