import { describe, expect, test } from "@jest/globals";

import {
  countSentences,
  detectJsonLike,
  normalizeNewlines,
} from "./responseContractEnforcer.text";

describe("responseContractEnforcer.text helpers", () => {
  test("normalizeNewlines collapses repeated line breaks and trims edges", () => {
    const out = normalizeNewlines("\nA\n\n\n\nB\r\n\r\nC\n", 2);
    expect(out).toBe("A\n\nB\n\nC");
  });

  test("detectJsonLike matches fenced and raw JSON payloads", () => {
    expect(detectJsonLike("```json\n{\"a\":1}\n```")).toBe(true);
    expect(detectJsonLike("{\"a\":1}")).toBe(true);
    expect(detectJsonLike("[{\"a\":1}]")).toBe(true);
    expect(detectJsonLike("Normal answer text.")).toBe(false);
  });

  test("countSentences counts sentence terminators conservatively", () => {
    expect(countSentences("One. Two? Three!")).toBe(3);
    expect(countSentences("No punctuation here")).toBe(0);
  });
});
