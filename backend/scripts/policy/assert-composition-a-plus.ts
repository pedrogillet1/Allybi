import fs from "node:fs";
import path from "node:path";

type GateReport = {
  gateId: string;
  generatedAt?: string;
  passed?: boolean;
  failures?: string[];
  metrics?: Record<string, unknown>;
};

const ROOT = process.cwd();
const GATES_DIR = path.resolve(ROOT, "reports", "cert", "gates");
const REQUIRED_GATES = [
  "composition-routing",
  "composition-fallback-order",
  "composition-pinned-model-resolution",
  "composition-telemetry-integrity",
  "composition-analytical-structure",
];
const MAX_AGE_HOURS = Number(process.env.CERT_GATE_MAX_AGE_HOURS || 24);
const MAX_AGE_MS =
  Number.isFinite(MAX_AGE_HOURS) && MAX_AGE_HOURS > 0
    ? MAX_AGE_HOURS * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;

function readGate(gateId: string): GateReport | null {
  const filePath = path.join(GATES_DIR, `${gateId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as GateReport;
}

function gateFresh(gate: GateReport): boolean {
  const generatedAt = String(gate.generatedAt || "").trim();
  if (!generatedAt) return false;
  const ts = Date.parse(generatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= MAX_AGE_MS;
}

function gradeFromScore(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  return "C_or_lower";
}

function main() {
  const failures: string[] = [];
  const gateRows: Array<{
    gateId: string;
    present: boolean;
    passed: boolean;
    fresh: boolean;
    failures: number;
  }> = [];

  let passedCount = 0;
  for (const gateId of REQUIRED_GATES) {
    const gate = readGate(gateId);
    if (!gate) {
      failures.push(`missing_gate:${gateId}`);
      gateRows.push({
        gateId,
        present: false,
        passed: false,
        fresh: false,
        failures: 0,
      });
      continue;
    }

    const passed = gate.passed === true;
    const fresh = gateFresh(gate);
    if (!passed) failures.push(`gate_failed:${gateId}`);
    if (!fresh) failures.push(`gate_stale_or_invalid_timestamp:${gateId}`);
    if (passed) passedCount += 1;

    gateRows.push({
      gateId,
      present: true,
      passed,
      fresh,
      failures: Array.isArray(gate.failures) ? gate.failures.length : 0,
    });
  }

  const score =
    REQUIRED_GATES.length > 0
      ? Math.round((passedCount / REQUIRED_GATES.length) * 10000) / 100
      : 0;
  const grade = gradeFromScore(score);
  const ok = failures.length === 0 && grade === "A+";

  const summary = {
    ok,
    score,
    grade,
    requiredGates: REQUIRED_GATES.length,
    passedGates: passedCount,
    failures,
    gates: gateRows,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!ok) process.exitCode = 1;
}

main();
