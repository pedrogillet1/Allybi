import {
  canonicalizeProvider,
  canonicalizeProviderWithUnknown,
  canonicalizeToLlmProvider,
} from "./providerNormalization";

describe("providerNormalization", () => {
  test("maps gemini aliases to google", () => {
    expect(canonicalizeProvider("gemini")).toBe("google");
    expect(canonicalizeProvider("Google Gemini")).toBe("google");
  });

  test("maps openai aliases to openai", () => {
    expect(canonicalizeProvider("openai")).toBe("openai");
    expect(canonicalizeProvider("gpt")).toBe("openai");
  });

  test("maps local aliases to local", () => {
    expect(canonicalizeProvider("local")).toBe("local");
    expect(canonicalizeProvider("ollama")).toBe("local");
  });

  test("unknown values do not map to google", () => {
    expect(canonicalizeProvider("")).toBeNull();
    expect(canonicalizeProvider("unknown")).toBeNull();
    expect(canonicalizeProvider("mystery-provider")).toBeNull();
    expect(canonicalizeProviderWithUnknown("mystery-provider")).toBe("unknown");
    expect(canonicalizeToLlmProvider("mystery-provider")).toBe("unknown");
  });
});
