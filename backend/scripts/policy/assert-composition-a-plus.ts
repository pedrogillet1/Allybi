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
  "composition-formatting-regressions",
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

function metricNumber(gate: GateReport, key: string): number | null {
  const metrics =
    gate.metrics && typeof gate.metrics === "object" ? gate.metrics : null;
  if (!metrics) return null;
  const value = Number((metrics as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : null;
}

function readJson(relativePath: string): unknown | null {
  const absolute = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function containsExactString(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value === needle;
  if (Array.isArray(value)) {
    return value.some((entry) => containsExactString(entry, needle));
  }
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some((entry) =>
    containsExactString(entry, needle),
  );
}

function enforceCanonicalComposeFollowup(failures: string[]): void {
  const composeServicePath = path.resolve(
    ROOT,
    "src/services/core/enforcement/composeMicrocopy.service.ts",
  );
  if (!fs.existsSync(composeServicePath)) {
    failures.push("compose_followup_canonical_check_missing:composeMicrocopy");
    return;
  }
  const composeSource = fs.readFileSync(composeServicePath, "utf8");
  if (
    composeSource.includes(
      'getOptionalBank<FollowupSuggestionsBank>("followup_suggestions")',
    )
  ) {
    failures.push("compose_followup_canonical_runtime_violation");
  }

  const usageManifest = readJson(
    "src/data_banks/document_intelligence/manifest/usage_manifest.any.json",
  );
  if (usageManifest && containsExactString(usageManifest, "followup_suggestions")) {
    failures.push("compose_followup_canonical_usage_manifest_violation");
  }

  const bankMap = readJson(
    "src/data_banks/semantics/document_intelligence_bank_map.any.json",
  );
  if (bankMap && containsExactString(bankMap, "followup_suggestions")) {
    failures.push("compose_followup_canonical_bank_map_violation");
  }

  const bankRegistry = readJson("src/data_banks/manifest/bank_registry.any.json");
  if (bankRegistry && typeof bankRegistry === "object") {
    const entries = Array.isArray((bankRegistry as Record<string, unknown>).banks)
      ? ((bankRegistry as Record<string, unknown>).banks as Array<Record<string, unknown>>)
      : [];
    const legacy = entries.find((entry) => entry.id === "followup_suggestions");
    const requiredByEnv =
      legacy && typeof legacy.requiredByEnv === "object"
        ? (legacy.requiredByEnv as Record<string, unknown>)
        : null;
    if (
      requiredByEnv &&
      Object.values(requiredByEnv).some((value) => value === true)
    ) {
      failures.push("compose_followup_legacy_required_in_registry");
    }
  }
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

    let passed = gate.passed === true;
    const fresh = gateFresh(gate);
    if (gateId === "composition-formatting-regressions") {
      const openerDistinctCount = metricNumber(gate, "openerDistinctCount");
      const followupDistinctCount = metricNumber(gate, "followupDistinctCount");
      const shortToLongRatio = metricNumber(gate, "shortToLongRatio");
      const claimGuardEvidenceCount = metricNumber(gate, "claimGuardEvidenceCount");
      if (!openerDistinctCount || openerDistinctCount < 2) {
        failures.push("compose_quality_floor_failed:openerDistinctCount");
        passed = false;
      }
      if (!followupDistinctCount || followupDistinctCount < 2) {
        failures.push("compose_quality_floor_failed:followupDistinctCount");
        passed = false;
      }
      if (
        shortToLongRatio === null ||
        shortToLongRatio <= 0 ||
        shortToLongRatio >= 0.98
      ) {
        failures.push("compose_quality_floor_failed:shortToLongRatio");
        passed = false;
      }
      if (!claimGuardEvidenceCount || claimGuardEvidenceCount < 1) {
        failures.push("compose_quality_floor_failed:claimGuardEvidenceCount");
        passed = false;
      }
    }
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

  enforceCanonicalComposeFollowup(failures);

  const score =
    REQUIRED_GATES.length > 0
      ? Math.round((passedCount / REQUIRED_GATES.length) * 10000) / 100
      : 0;
  const grade = gradeFromScore(score);
  const ok = failures.length === 0 && grade === "A+";

  const summary = {
    ok,
    scope: "composition-only",
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
