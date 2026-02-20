import { describe, expect, it } from "@jest/globals";

import { MemoryRedactionService } from "./memoryRedaction.service";

describe("MemoryRedactionService", () => {
  it("produces deterministic hashes for the same input and salt", () => {
    const service = new MemoryRedactionService({ salt: "test-salt" });
    const a = service.hashText("  Revenue Growth  ");
    const b = service.hashText("revenue growth");
    expect(a).toBe(b);
    expect(a).toHaveLength(24);
  });

  it("deduplicates and caps source document ids", () => {
    const service = new MemoryRedactionService();
    const result = service.sanitizeSourceDocumentIds(
      ["doc-1", "doc-2", "doc-1", " ", "doc-3"],
      2,
    );
    expect(result).toEqual(["doc-1", "doc-2"]);
  });

  it("builds structural persisted recall entries without raw content", () => {
    const service = new MemoryRedactionService({ salt: "test-salt" });
    const entry = service.buildPersistedRecallEntry({
      messageId: "m1",
      role: "assistant",
      intentFamily: "Compare Numbers",
      sourceDocumentIds: ["doc-a", "doc-b"],
      content: "Sensitive clause text here",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(entry.summary).toBe("role:assistant;intent:compare_numbers;sources:2");
    expect(entry.sourceCount).toBe(2);
    expect(entry.contentHash).not.toContain("Sensitive clause text here");
  });

  it("returns max safe integer when byte approximation cannot stringify", () => {
    const service = new MemoryRedactionService();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(service.approximateBytes(circular)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
