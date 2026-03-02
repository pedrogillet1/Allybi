import { describe, expect, test } from "@jest/globals";
import { redactObjectDeep } from "./redact.service";

describe("redactObjectDeep", () => {
  // 1. Redacts known sensitive keys
  test("redacts known sensitive keys like password and email", () => {
    const input = { password: "secret123", email: "user@test.com" };
    const result = redactObjectDeep(input);

    expect(result).toEqual({
      password: "[REDACTED]",
      email: "[REDACTED]",
    });
  });

  // 2. Preserves non-sensitive keys
  test("preserves non-sensitive keys unchanged", () => {
    const input = { name: "John", age: 30 };
    const result = redactObjectDeep(input);

    expect(result).toEqual({ name: "John", age: 30 });
  });

  // 3. Pattern matching on key suffixes
  test("redacts keys matching the sensitive suffix pattern", () => {
    const input = {
      myApiToken: "abc",
      customSecret: "xyz",
      authHash: "h",
    };
    const result = redactObjectDeep(input);

    expect(result).toEqual({
      myApiToken: "[REDACTED]",
      customSecret: "[REDACTED]",
      authHash: "[REDACTED]",
    });
  });

  // 4. Deep nesting
  test("redacts sensitive keys in deeply nested objects", () => {
    const input = {
      user: {
        credentials: { password: "x" },
        name: "John",
      },
    };
    const result = redactObjectDeep(input);

    expect(result).toEqual({
      user: {
        credentials: { password: "[REDACTED]" },
        name: "John",
      },
    });
  });

  // 5. Arrays
  test("redacts sensitive keys inside arrays of objects", () => {
    const input = [{ password: "x" }, { name: "y" }];
    const result = redactObjectDeep(input);

    expect(result).toEqual([{ password: "[REDACTED]" }, { name: "y" }]);
  });

  // 6. Null/undefined passthrough
  test("returns null when input is null", () => {
    expect(redactObjectDeep(null)).toBeNull();
  });

  test("returns undefined when input is undefined", () => {
    expect(redactObjectDeep(undefined)).toBeUndefined();
  });
});
