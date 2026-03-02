import { describe, expect, test } from "@jest/globals";
import { assertNoPlaintext } from "./plaintextPolicy";

describe("assertNoPlaintext", () => {
  // 1. null passes
  test("does not throw for null", () => {
    expect(() => assertNoPlaintext("test", null)).not.toThrow();
  });

  // 2. undefined passes
  test("does not throw for undefined", () => {
    expect(() => assertNoPlaintext("test", undefined)).not.toThrow();
  });

  // 3. empty string passes
  test("does not throw for empty string", () => {
    expect(() => assertNoPlaintext("test", "")).not.toThrow();
  });

  // 4. whitespace-only string passes
  test("does not throw for whitespace-only string", () => {
    expect(() => assertNoPlaintext("test", "   ")).not.toThrow();
  });

  // 5. non-empty string throws
  test("throws for a non-empty string with the correct label", () => {
    expect(() => assertNoPlaintext("Field", "hello")).toThrow(
      "[SECURITY] plaintext not allowed for Field",
    );
  });

  // 6. number passes (not a string)
  test("does not throw for a number value", () => {
    expect(() => assertNoPlaintext("test", 42)).not.toThrow();
  });
});
