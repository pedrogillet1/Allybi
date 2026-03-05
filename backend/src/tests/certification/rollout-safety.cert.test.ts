import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { BankRolloutService } from "../../services/core/banks/bankRollout.service";

import { writeCertificationGateReport } from "./reporting";

describe("Certification: rollout safety", () => {
  test("feature flag canary policy and thresholds are wired", () => {
    const bankPath = path.resolve(
      process.cwd(),
      "src/data_banks/manifest/feature_flags.any.json",
    );
    const bank = JSON.parse(fs.readFileSync(bankPath, "utf8")) as Record<
      string,
      unknown
    >;
    const config = (bank.config || {}) as Record<string, unknown>;
    const rolloutSafety = (config.rolloutSafety || {}) as Record<string, unknown>;
    const thresholds = (rolloutSafety.thresholds || {}) as Record<string, unknown>;
    const flags = Array.isArray(bank.flags) ? bank.flags : [];

    const highRiskFlags = flags.filter(
      (flag) =>
        String((flag as Record<string, unknown>)?.riskLevel || "").toLowerCase() ===
        "high",
    ) as Array<Record<string, unknown>>;
    const highRiskWithoutCanaryPolicy = highRiskFlags.filter((flag) => {
      const rollout = (flag.rollout || {}) as Record<string, unknown>;
      return rollout.requiresCanary !== true;
    });

    const service = new BankRolloutService();
    const assessment = service.evaluateCanaryHealth({
      sampleSize: 150,
      errorRate: 0.05,
      p95LatencyMs: 13000,
      weakEvidenceRate: 0.2,
    });
    const rolloutServicePath = path.resolve(
      process.cwd(),
      "src/services/core/banks/bankRollout.service.ts",
    );
    const rolloutServiceSource = fs.readFileSync(rolloutServicePath, "utf8");
    const canaryEnforcementWired =
      rolloutServiceSource.includes("BANK_ROLLOUT_ENFORCE_CANARY") &&
      rolloutServiceSource.includes("shouldEnforceCanaryPolicy") &&
      rolloutServiceSource.includes("envName === \"production\"") &&
      rolloutServiceSource.includes("shouldEnforceCanaryForFlag") &&
      rolloutServiceSource.includes("recommendation !== \"continue\"");

    const failures: string[] = [];
    if (rolloutSafety.enabled !== true) failures.push("ROLLOUT_SAFETY_DISABLED");
    if (Number(thresholds.minSampleSize) <= 0)
      failures.push("ROLLOUT_THRESHOLD_MIN_SAMPLE_INVALID");
    if (Number(thresholds.maxErrorRate) <= 0)
      failures.push("ROLLOUT_THRESHOLD_ERROR_RATE_INVALID");
    if (Number(thresholds.maxP95LatencyMs) <= 0)
      failures.push("ROLLOUT_THRESHOLD_P95_INVALID");
    if (Number(thresholds.maxWeakEvidenceRate) <= 0)
      failures.push("ROLLOUT_THRESHOLD_WEAK_EVIDENCE_INVALID");
    if (highRiskFlags.length === 0) failures.push("NO_HIGH_RISK_FLAGS_DECLARED");
    if (highRiskWithoutCanaryPolicy.length > 0)
      failures.push("HIGH_RISK_FLAGS_MISSING_CANARY_POLICY");
    if (assessment.recommendation !== "rollback")
      failures.push("CANARY_HEALTH_ROLLBACK_NOT_TRIGGERED");
    if (!canaryEnforcementWired) failures.push("CANARY_ENFORCEMENT_NOT_WIRED");

    writeCertificationGateReport("rollout-safety", {
      passed: failures.length === 0,
      metrics: {
        rolloutSafetyEnabled: rolloutSafety.enabled === true,
        highRiskFlagCount: highRiskFlags.length,
        highRiskCanaryPolicyCount:
          highRiskFlags.length - highRiskWithoutCanaryPolicy.length,
        canaryRecommendation: assessment.recommendation,
        thresholdMinSampleSize: Number(thresholds.minSampleSize || 0),
        thresholdMaxErrorRate: Number(thresholds.maxErrorRate || 0),
        thresholdMaxP95LatencyMs: Number(thresholds.maxP95LatencyMs || 0),
        thresholdMaxWeakEvidenceRate: Number(thresholds.maxWeakEvidenceRate || 0),
        canaryEnforcementWired,
      },
      thresholds: {
        rolloutSafetyEnabled: true,
        highRiskFlagCountMin: 1,
        highRiskCanaryPolicyCountMin: highRiskFlags.length,
        canaryRecommendation: "rollback",
        canaryEnforcementWired: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
