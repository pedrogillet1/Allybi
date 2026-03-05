import {
  describe,
  expect,
  test,
} from "@jest/globals";
import {
  resolveGovernanceFailClosed,
  resolveGovernanceQualityGateEnforcement,
  resolveGovernanceRuntimeEnv,
} from "./governanceFailClosedPolicy";

describe("governanceFailClosedPolicy", () => {
  test("resolves runtime env aliases deterministically", () => {
    expect(resolveGovernanceRuntimeEnv({ runtimeEnv: "prod" })).toBe(
      "production",
    );
    expect(resolveGovernanceRuntimeEnv({ runtimeEnv: "stage" })).toBe(
      "staging",
    );
    expect(resolveGovernanceRuntimeEnv({ runtimeEnv: "local" })).toBe("local");
    expect(resolveGovernanceRuntimeEnv({ runtimeEnv: "development" })).toBe(
      "dev",
    );
  });

  test("forces fail-closed in protected env even when configured false", () => {
    const out = resolveGovernanceFailClosed({
      nodeEnv: "production",
      runtimeEnv: "production",
      configuredFailClosed: false,
    });
    expect(out.failClosed).toBe(true);
    expect(out.protectedEnv).toBe(true);
  });

  test("uses configured failClosed in non-protected env", () => {
    const out = resolveGovernanceFailClosed({
      nodeEnv: "development",
      runtimeEnv: "dev",
      configuredFailClosed: true,
    });
    expect(out.failClosed).toBe(true);
    expect(out.protectedEnv).toBe(false);
  });

  test("explicit strict flag forces fail-closed", () => {
    const out = resolveGovernanceFailClosed({
      nodeEnv: "development",
      runtimeEnv: "dev",
      configuredFailClosed: false,
      strictGovernanceFlag: "true",
    });
    expect(out.failClosed).toBe(true);
  });

  test("explicit opt-out only works in non-protected env", () => {
    const nonProtected = resolveGovernanceFailClosed({
      nodeEnv: "development",
      runtimeEnv: "dev",
      configuredFailClosed: true,
      strictGovernanceFlag: "false",
    });
    expect(nonProtected.failClosed).toBe(false);

    const protectedOut = resolveGovernanceFailClosed({
      nodeEnv: "production",
      runtimeEnv: "production",
      configuredFailClosed: false,
      strictGovernanceFlag: "false",
    });
    expect(protectedOut.failClosed).toBe(true);
  });

  test("strict certification profiles are protected by default", () => {
    const out = resolveGovernanceFailClosed({
      nodeEnv: "development",
      runtimeEnv: "dev",
      certProfile: "ci",
      configuredFailClosed: false,
    });
    expect(out.strictCertProfile).toBe(true);
    expect(out.protectedEnv).toBe(true);
    expect(out.failClosed).toBe(true);
  });

  test("enforces quality gates in protected env even when QUALITY_GATES_ENFORCING is false", () => {
    const out = resolveGovernanceQualityGateEnforcement({
      nodeEnv: "production",
      runtimeEnv: "production",
      qualityGatesEnforcingFlag: "false",
    });
    expect(out.failClosed).toBe(true);
    expect(out.enforceQualityGates).toBe(true);
    expect(out.reasonCode).toBe("strict_fail_closed");
  });

  test("allows quality gate opt-out in non-protected env only", () => {
    const out = resolveGovernanceQualityGateEnforcement({
      nodeEnv: "development",
      runtimeEnv: "dev",
      qualityGatesEnforcingFlag: "false",
      configuredFailClosed: false,
    });
    expect(out.failClosed).toBe(false);
    expect(out.enforceQualityGates).toBe(false);
    expect(out.reasonCode).toBe("quality_gates_enforcing_disabled");
  });

  test("forces quality gates when strict governance flag is true", () => {
    const out = resolveGovernanceQualityGateEnforcement({
      nodeEnv: "development",
      runtimeEnv: "dev",
      qualityGatesEnforcingFlag: "false",
      strictGovernanceFlag: "true",
    });
    expect(out.failClosed).toBe(true);
    expect(out.enforceQualityGates).toBe(true);
    expect(out.reasonCode).toBe("strict_fail_closed");
  });

  test("resolves deterministic precedence matrix for strictness and quality enforcement", () => {
    const scenarios = [
      {
        id: "local-default",
        input: { nodeEnv: "development", runtimeEnv: "dev" },
        expected: { failClosed: false, enforceQualityGates: true },
      },
      {
        id: "local-optout",
        input: {
          nodeEnv: "development",
          runtimeEnv: "dev",
          qualityGatesEnforcingFlag: "false",
        },
        expected: { failClosed: false, enforceQualityGates: false },
      },
      {
        id: "ci-profile-forces-strict",
        input: {
          nodeEnv: "development",
          runtimeEnv: "dev",
          certProfile: "ci",
          qualityGatesEnforcingFlag: "false",
        },
        expected: { failClosed: true, enforceQualityGates: true },
      },
      {
        id: "explicit-strict-forces-closed",
        input: {
          nodeEnv: "development",
          runtimeEnv: "dev",
          strictGovernanceFlag: "true",
          qualityGatesEnforcingFlag: "false",
        },
        expected: { failClosed: true, enforceQualityGates: true },
      },
      {
        id: "production-always-closed",
        input: {
          nodeEnv: "production",
          runtimeEnv: "production",
          strictGovernanceFlag: "false",
          qualityGatesEnforcingFlag: "false",
        },
        expected: { failClosed: true, enforceQualityGates: true },
      },
    ] as const;

    for (const scenario of scenarios) {
      const out = resolveGovernanceQualityGateEnforcement(scenario.input);
      expect(out.failClosed).toBe(scenario.expected.failClosed);
      expect(out.enforceQualityGates).toBe(
        scenario.expected.enforceQualityGates,
      );
    }
  });
});
