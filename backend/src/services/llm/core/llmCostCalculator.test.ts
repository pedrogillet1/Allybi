import {
  computeCostUsd,
  lookupCostEntry,
  toCostFamilyModel,
  type CostTable,
} from "./llmCostCalculator";

const mockCostTable: CostTable = {
  models: {
    "google:gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.60 },
    "openai:gpt-5-mini": { inputPer1M: 0.30, outputPer1M: 1.20 },
    "openai:gpt-5.2": { inputPer1M: 2.50, outputPer1M: 10.00 },
    "local:*": { inputPer1M: 0, outputPer1M: 0 },
  },
};

describe("computeCostUsd", () => {
  it("should compute cost for Gemini Flash", () => {
    const cost = computeCostUsd("google", "gemini-2.5-flash", 1000, 500, mockCostTable);
    // input: 1000/1M * 0.15 = 0.00015
    // output: 500/1M * 0.60 = 0.0003
    expect(cost).toBeCloseTo(0.00045, 6);
  });

  it("should compute cost for GPT-5.2", () => {
    const cost = computeCostUsd("openai", "gpt-5.2", 10000, 2000, mockCostTable);
    // input: 10000/1M * 2.50 = 0.025
    // output: 2000/1M * 10.00 = 0.02
    expect(cost).toBeCloseTo(0.045, 6);
  });

  it("should fallback to wildcard model", () => {
    const cost = computeCostUsd("local", "some-model", 1000, 1000, mockCostTable);
    expect(cost).toBe(0);
  });

  it("should return 0 for unknown provider", () => {
    const cost = computeCostUsd("anthropic", "claude", 1000, 1000, mockCostTable);
    expect(cost).toBe(0);
  });

  it("should return 0 for null tokens", () => {
    const cost = computeCostUsd("google", "gemini-2.5-flash", null, null, mockCostTable);
    expect(cost).toBe(0);
  });

  it("should return 0 for null cost table", () => {
    const cost = computeCostUsd("google", "gemini-2.5-flash", 1000, 500, null);
    expect(cost).toBe(0);
  });

  it("should handle only input tokens", () => {
    const cost = computeCostUsd("google", "gemini-2.5-flash", 1_000_000, 0, mockCostTable);
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it("should handle only output tokens", () => {
    const cost = computeCostUsd("openai", "gpt-5.2", 0, 1_000_000, mockCostTable);
    expect(cost).toBeCloseTo(10.0, 6);
  });

  it("should resolve pinned OpenAI model to family price key", () => {
    const lookup = lookupCostEntry(
      "openai",
      "gpt-5.2-2026-01-15",
      mockCostTable,
    );
    expect(lookup.matchedBy).toBe("family");
    expect(lookup.matchedKey).toBe("openai:gpt-5.2");

    const cost = computeCostUsd(
      "openai",
      "gpt-5.2-2026-01-15",
      10000,
      2000,
      mockCostTable,
    );
    expect(cost).toBeCloseTo(0.045, 6);
  });

  it("should resolve pinned Gemini model to family price key", () => {
    const lookup = lookupCostEntry(
      "google",
      "gemini-2.5-flash-001",
      mockCostTable,
    );
    expect(lookup.matchedBy).toBe("family");
    expect(lookup.matchedKey).toBe("google:gemini-2.5-flash");
  });

  it("should normalize family model helper", () => {
    expect(toCostFamilyModel("gpt-5-mini-2026-01-15")).toBe("gpt-5-mini");
    expect(toCostFamilyModel("gemini-2.5-flash-001")).toBe(
      "gemini-2.5-flash",
    );
  });
});
