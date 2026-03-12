import { describe, expect, test } from "@jest/globals";
import {
  RuntimePolicyError,
  isRuntimePolicyError,
  normalizeRuntimeFailureCode,
  toRuntimePolicyErrorCode,
} from "./runtimePolicyError";

describe("runtimePolicyError", () => {
  test("recognizes branded runtime policy errors only", () => {
    const typed = new RuntimePolicyError("MISSING_SOURCES", "missing source");
    expect(isRuntimePolicyError(typed)).toBe(true);
    expect(isRuntimePolicyError({ code: "MISSING_SOURCES" })).toBe(false);
  });

  test("maps structured explicit codes without message parsing", () => {
    expect(toRuntimePolicyErrorCode({ code: "MISSING_PROVENANCE" })).toBe(
      "MISSING_PROVENANCE",
    );
  });

  test("normalizes known runtime failure codes directly", () => {
    expect(normalizeRuntimeFailureCode("EMPTY_OUTPUT")).toBe("EMPTY_OUTPUT");
    expect(normalizeRuntimeFailureCode("not_a_runtime_code")).toBeNull();
  });

  test("prefers explicit typed codes over any other fields", () => {
    expect(
      toRuntimePolicyErrorCode({
        code: "POLICY_BLOCKED",
        message: "scope issue that should not win",
      }),
    ).toBe("POLICY_BLOCKED");
  });
});
