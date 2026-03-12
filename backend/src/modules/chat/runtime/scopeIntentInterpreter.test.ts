import { describe, expect, test } from "@jest/globals";
import { ScopeIntentInterpreter } from "./scopeIntentInterpreter";

describe("ScopeIntentInterpreter", () => {
  test("uses injected clear-scope regex only", () => {
    const interpreter = new ScopeIntentInterpreter({
      clearScopeRegex: [/\breset docs\b/i],
    });

    expect(
      interpreter.shouldClearScope({
        userId: "user-1",
        message: "please reset docs",
      }),
    ).toBe(true);
    expect(
      interpreter.shouldClearScope({
        userId: "user-1",
        message: "clear scope",
      }),
    ).toBe(false);
  });

  test("honors explicit clearScope metadata", () => {
    const interpreter = new ScopeIntentInterpreter({
      clearScopeRegex: [],
    });

    expect(
      interpreter.shouldClearScope({
        userId: "user-1",
        message: "keep the same docs",
        meta: { clearScope: true },
      }),
    ).toBe(true);
  });
});
