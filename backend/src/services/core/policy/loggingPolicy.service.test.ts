import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("./policyBankResolver.service", () => ({
  resolvePolicyBank: jest.fn(),
}));

import { resolvePolicyBank } from "./policyBankResolver.service";
import { LoggingPolicyService } from "./loggingPolicy.service";

const mockedResolvePolicyBank = resolvePolicyBank as jest.MockedFunction<
  typeof resolvePolicyBank
>;

describe("LoggingPolicyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolvePolicyBank.mockReturnValue(null);
  });

  test("falls back to defaults when bank is unavailable", () => {
    const config = new LoggingPolicyService().resolveConfig();
    expect(config.enabled).toBe(true);
    expect(config.strict).toBe(true);
    expect(config.redactKeys).toContain("token");
    expect(config.runtimePathsNoRawConsole.length).toBeGreaterThan(0);
  });

  test("honors configured redact keys and runtime paths", () => {
    mockedResolvePolicyBank.mockReturnValue({
      config: {
        enabled: true,
        strict: false,
        failClosedInProd: false,
        redactKeys: ["Authorization", "Api-Key"],
        runtimePathsNoRawConsole: ["src/runtime/foo.ts"],
      },
    });

    const config = new LoggingPolicyService().resolveConfig();
    expect(config.strict).toBe(false);
    expect(config.failClosedInProd).toBe(false);
    expect(config.redactKeys).toEqual(["authorization", "apikey"]);
    expect(config.runtimePathsNoRawConsole).toEqual(["src/runtime/foo.ts"]);
  });

  test("redacts sensitive keys recursively", () => {
    mockedResolvePolicyBank.mockReturnValue({
      config: {
        redactKeys: ["token", "authorization", "apiKey"],
      },
    });

    const service = new LoggingPolicyService();
    const sanitized = service.sanitizeContext({
      token: "abc",
      nested: {
        Authorization: "Bearer xyz",
        safe: "ok",
      },
      list: [{ apiKey: "123" }, { notSecret: "value" }],
    });

    expect(sanitized.token).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).Authorization).toBe(
      "[REDACTED]",
    );
    expect((sanitized.nested as Record<string, unknown>).safe).toBe("ok");
    expect(
      ((sanitized.list as unknown[])?.[0] as Record<string, unknown>)?.apiKey,
    ).toBe("[REDACTED]");
    expect(
      ((sanitized.list as unknown[])?.[1] as Record<string, unknown>)
        ?.notSecret,
    ).toBe("value");
  });
});
