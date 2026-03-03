import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import { CacheService } from "./cache.service";

describe("CacheService", () => {
  let svc: CacheService;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    svc = new CacheService();
  });

  afterEach(async () => {
    await svc.clearAll();
    await svc.close();
    jest.restoreAllMocks();
  });

  test("generateKey is deterministic for the same payload", () => {
    const a = svc.generateKey("search", "u1", "what is revenue");
    const b = svc.generateKey("search", "u1", "what is revenue");
    expect(a).toBe(b);
  });

  test("caches and retrieves document buffers", async () => {
    const docId = "doc-1";
    const payload = Buffer.from("hello world", "utf8");

    await svc.cacheDocumentBuffer(docId, payload);
    const cached = await svc.getCachedDocumentBuffer(docId);

    expect(cached).toBeInstanceOf(Buffer);
    expect(cached?.toString("utf8")).toBe("hello world");
  });

  test("stores and retrieves mode-based query responses", async () => {
    await svc.cacheQueryResponse(
      "u1",
      "Summarize my latest report",
      "doc_grounded_single",
      { answer: "summary", sources: [{ id: "doc-1" }] },
      60,
    );

    const cached = await svc.getCachedQueryResponse(
      "u1",
      "Summarize my latest report",
      "doc_grounded_single",
    );

    expect(cached?.answer).toBe("summary");
    expect(Array.isArray(cached?.sources)).toBe(true);
    expect(cached?.mode).toBe("doc_grounded_single");
    expect(typeof cached?.timestamp).toBe("number");
  });

  test("invalidates all mode-based query cache entries for a user", async () => {
    await svc.cacheQueryResponse(
      "u1",
      "a",
      "doc_grounded_single",
      { answer: "x", sources: [] },
      60,
    );
    await svc.cacheQueryResponse(
      "u1",
      "b",
      "general_answer",
      { answer: "y", sources: [] },
      60,
    );

    await svc.invalidateUserQueryCache("u1");

    const first = await svc.getCachedQueryResponse("u1", "a", "doc_grounded_single");
    const second = await svc.getCachedQueryResponse("u1", "b", "general_answer");
    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});
