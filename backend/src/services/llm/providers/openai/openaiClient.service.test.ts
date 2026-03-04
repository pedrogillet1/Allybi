import { describe, expect, test } from "@jest/globals";
import { resolveOpenAIModel } from "./openaiClient.service";

describe("resolveOpenAIModel", () => {
  const cfg = {
    allowedModels: ["gpt-5.2"],
    defaultModelFinal: "gpt-5.2",
  };

  test("keeps pinned model version when family is allowlisted", () => {
    const out = resolveOpenAIModel("gpt-5.2-2026-01-15", cfg);
    expect(out).toBe("gpt-5.2-2026-01-15");
  });

  test("returns exact model when exact value is allowlisted", () => {
    const out = resolveOpenAIModel("gpt-5.2", cfg);
    expect(out).toBe("gpt-5.2");
  });

  test("falls back to default for disallowed model", () => {
    const out = resolveOpenAIModel("gpt-4.1", cfg);
    expect(out).toBe("gpt-5.2");
  });
});
