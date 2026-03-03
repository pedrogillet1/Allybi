import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import { PineconeService } from "./pinecone.service";

describe("PineconeService", () => {
  const originalApiKey = process.env.PINECONE_API_KEY;

  beforeEach(() => {
    delete process.env.PINECONE_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) process.env.PINECONE_API_KEY = originalApiKey;
    else delete process.env.PINECONE_API_KEY;
  });

  test("reports unavailable when API key is missing", () => {
    const svc = new PineconeService();
    expect(svc.isAvailable()).toBe(false);
  });

  test("returns empty results when unavailable", async () => {
    const svc = new PineconeService();
    const result = await svc.searchSimilarChunks(new Array(1536).fill(0.1), "u1");
    expect(result).toEqual([]);
  });

  test("verifyDocumentEmbeddings returns clear unavailable message", async () => {
    const svc = new PineconeService();
    const result = await svc.verifyDocumentEmbeddings("doc-1");
    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    expect(result.message).toMatch(/not available/i);
  });

  test("metadata sanitizer keeps primitives and serializes complex values", () => {
    const svc = new PineconeService() as any;
    const out = svc.sanitizeMetadata({
      a: "x",
      b: 1,
      c: true,
      d: ["x", 2],
      e: { deep: { value: "ok" } },
    });
    expect(out.a).toBe("x");
    expect(out.b).toBe(1);
    expect(out.c).toBe(true);
    expect(out.d).toEqual(["x", 2]);
    expect(typeof out.e).toBe("string");
  });

  test("scoped filter uses document lock when documentId is provided", () => {
    const svc = new PineconeService() as any;
    const filter = svc.buildFilter({
      userId: "u1",
      documentId: "doc-42",
      folderId: "folder-1",
    });
    expect(filter).toEqual({
      $and: [
        { userId: { $eq: "u1" } },
        { documentId: { $eq: "doc-42" } },
      ],
    });
  });
});
