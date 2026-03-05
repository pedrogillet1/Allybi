import {
  describe,
  expect,
  test,
} from "@jest/globals";
import {
  resolveGovernanceFailClosed,
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
});
