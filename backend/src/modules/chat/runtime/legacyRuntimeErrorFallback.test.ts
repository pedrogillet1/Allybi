import { describe, expect, test } from "@jest/globals";
import { resolveLegacyRuntimePolicyErrorCode } from "./legacyRuntimeErrorFallback";

describe("legacyRuntimeErrorFallback", () => {
  test("maps missing provenance messages at compatibility edges", () => {
    expect(
      resolveLegacyRuntimePolicyErrorCode(
        new Error("missing provenance for answer"),
      ),
    ).toBe("MISSING_PROVENANCE");
  });

  test("maps scope errors from legacy messages", () => {
    expect(
      resolveLegacyRuntimePolicyErrorCode(
        new Error("answer out of scope for doc lock"),
      ),
    ).toBe("OUT_OF_SCOPE");
  });

  test("prefers explicit structured codes over message parsing", () => {
    expect(
      resolveLegacyRuntimePolicyErrorCode({
        code: "POLICY_BLOCKED",
        message: "scope issue that should not win",
      }),
    ).toBe("POLICY_BLOCKED");
  });
});
