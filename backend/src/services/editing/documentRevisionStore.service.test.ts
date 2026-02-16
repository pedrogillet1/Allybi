import { looksLikeTruncatedSpanPayload } from "./docxSpanPayloadGuard";

describe("documentRevisionStore span payload guard", () => {
  test("flags span-only payload that would collapse a paragraph", () => {
    const before = "The quick brown fox jumps over the lazy dog near the river bank.";
    const after = "cat";
    expect(looksLikeTruncatedSpanPayload(before, after)).toBe(true);
  });

  test("allows full-paragraph payload for normal span replacement", () => {
    const before = "The quick brown fox jumps over the lazy dog near the river bank.";
    const after = "The quick brown cat jumps over the lazy dog near the river bank.";
    expect(looksLikeTruncatedSpanPayload(before, after)).toBe(false);
  });
});
