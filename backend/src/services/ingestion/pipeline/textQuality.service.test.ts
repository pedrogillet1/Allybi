import { describe, expect, test } from "@jest/globals";
import { deriveTextQuality } from "./textQuality.service";

describe("deriveTextQuality", () => {
  test("rejects 'highjacked' as high quality", () => {
    const result = deriveTextQuality(
      { textQuality: "highjacked" } as any,
      "some text",
    );
    expect(result.label).not.toBe("high");
  });

  test("maps exact 'high' correctly", () => {
    const result = deriveTextQuality(
      { textQuality: "high" } as any,
      "some text",
    );
    expect(result.label).toBe("high");
  });

  test("maps exact 'medium' correctly", () => {
    const result = deriveTextQuality(
      { textQuality: "medium" } as any,
      "some text",
    );
    expect(result.label).toBe("medium");
  });

  test("maps exact 'low' correctly", () => {
    const result = deriveTextQuality(
      { textQuality: "low" } as any,
      "some text",
    );
    expect(result.label).toBe("low");
  });

  test("maps 'weak' to low", () => {
    const result = deriveTextQuality(
      { textQuality: "weak" } as any,
      "some text",
    );
    expect(result.label).toBe("low");
  });

  test("falls back to score when label unknown", () => {
    const result = deriveTextQuality(
      { textQualityScore: 0.9 } as any,
      "some text",
    );
    expect(result.label).toBe("high");
  });

  test("long garbage text without quality signal is NOT rated high", () => {
    const garbage = "asdf".repeat(1000);
    const result = deriveTextQuality({} as any, garbage);
    // Without a quality signal, should return conservative default
    expect(result.score).toBeNull();
    expect(result.label).toBe("medium");
  });

  test("empty text returns none", () => {
    const result = deriveTextQuality({} as any, "");
    expect(result.label).toBe("none");
    expect(result.score).toBe(0);
  });
});
