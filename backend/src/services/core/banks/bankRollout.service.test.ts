import { afterAll, beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

import { getOptionalBank } from "./bankLoader.service";
import { BankRolloutService } from "./bankRollout.service";

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("BankRolloutService", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnforcePolicy = process.env.BANK_ROLLOUT_ENFORCE_POLICY;
  const previousEnforceCanary = process.env.BANK_ROLLOUT_ENFORCE_CANARY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "production";
    delete process.env.BANK_ROLLOUT_ENFORCE_POLICY;
    delete process.env.BANK_ROLLOUT_ENFORCE_CANARY;
  });

  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.BANK_ROLLOUT_ENFORCE_POLICY = previousEnforcePolicy;
    process.env.BANK_ROLLOUT_ENFORCE_CANARY = previousEnforceCanary;
  });

  test("uses feature_flags id/defaultByEnv schema", () => {
    mockedGetOptionalBank.mockReturnValue({
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { production: true },
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {});
    expect(out).toBe(true);
  });

  test("respects rolloutPercent when base flag is enabled", () => {
    mockedGetOptionalBank.mockReturnValue({
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { local: true },
          rolloutPercent: 0,
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {
      userId: "user-1",
    });
    expect(out).toBe(false);
  });

  test("enforces rollout policy cap when BANK_ROLLOUT_ENFORCE_POLICY is enabled", () => {
    process.env.BANK_ROLLOUT_ENFORCE_POLICY = "true";
    mockedGetOptionalBank.mockReturnValue({
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { production: true },
          rolloutPercent: 90,
          rollout: {
            maxPercentByEnv: {
              production: 0,
            },
          },
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {
      userId: "user-1",
    });
    expect(out).toBe(false);
  });

  test("evaluateCanaryHealth returns rollback when thresholds are exceeded", () => {
    mockedGetOptionalBank.mockReturnValue({
      config: {
        rolloutSafety: {
          enabled: true,
          thresholds: {
            minSampleSize: 20,
            maxErrorRate: 0.02,
            maxP95LatencyMs: 12000,
            maxWeakEvidenceRate: 0.15,
          },
        },
      },
    } as any);

    const out = new BankRolloutService().evaluateCanaryHealth({
      sampleSize: 150,
      errorRate: 0.05,
      p95LatencyMs: 13000,
      weakEvidenceRate: 0.2,
    });

    expect(out.policyEnabled).toBe(true);
    expect(out.recommendation).toBe("rollback");
  });

  test("isEnabled fail-closes high-risk canary flags when rollout health is unhealthy", () => {
    process.env.BANK_ROLLOUT_ENFORCE_CANARY = "true";
    mockedGetOptionalBank.mockReturnValue({
      config: {
        rolloutSafety: {
          enabled: true,
          thresholds: {
            minSampleSize: 20,
            maxErrorRate: 0.02,
            maxP95LatencyMs: 12000,
            maxWeakEvidenceRate: 0.15,
          },
        },
      },
      flags: [
        {
          id: "ff.sample",
          defaultByEnv: { production: true },
          rolloutPercent: 100,
          riskLevel: "high",
          rollout: {
            requiresCanary: true,
          },
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.sample", {
      userId: "user-1",
      canarySnapshot: {
        sampleSize: 150,
        errorRate: 0.05,
        p95LatencyMs: 13000,
        weakEvidenceRate: 0.2,
      },
    });
    expect(out).toBe(false);
  });

  test("production defaults canary enforcement to fail-closed for high-risk flags", () => {
    delete process.env.BANK_ROLLOUT_ENFORCE_CANARY;
    process.env.NODE_ENV = "production";
    mockedGetOptionalBank.mockReturnValue({
      config: {
        rolloutSafety: {
          enabled: true,
          thresholds: {
            minSampleSize: 20,
            maxErrorRate: 0.02,
            maxP95LatencyMs: 12000,
            maxWeakEvidenceRate: 0.15,
          },
        },
      },
      flags: [
        {
          id: "ff.highrisk",
          defaultByEnv: { production: true },
          rolloutPercent: 100,
          riskLevel: "high",
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.highrisk", {
      userId: "user-1",
      canarySnapshot: {
        sampleSize: 150,
        errorRate: 0.05,
        p95LatencyMs: 13000,
        weakEvidenceRate: 0.2,
      },
    });

    expect(out).toBe(false);
  });

  test("explicit canary override can disable enforcement outside strict production defaults", () => {
    process.env.BANK_ROLLOUT_ENFORCE_CANARY = "false";
    process.env.NODE_ENV = "production";
    mockedGetOptionalBank.mockReturnValue({
      config: {
        rolloutSafety: {
          enabled: true,
          thresholds: {
            minSampleSize: 20,
            maxErrorRate: 0.02,
            maxP95LatencyMs: 12000,
            maxWeakEvidenceRate: 0.15,
          },
        },
      },
      flags: [
        {
          id: "ff.highrisk.override",
          defaultByEnv: { production: true },
          rolloutPercent: 100,
          riskLevel: "high",
        },
      ],
    } as any);

    const out = new BankRolloutService().isEnabled("ff.highrisk.override", {
      userId: "user-1",
      canarySnapshot: {
        sampleSize: 150,
        errorRate: 0.05,
        p95LatencyMs: 13000,
        weakEvidenceRate: 0.2,
      },
    });

    expect(out).toBe(true);
  });
});
