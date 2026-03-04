import { beforeEach, describe, expect, jest, test } from "@jest/globals";

/* ------------------------------------------------------------------ */
/*  Hoisted mock fns                                                  */
/* ------------------------------------------------------------------ */

const mockEmbeddingsCreate = jest.fn();
const mockGetCachedEmbedding = jest.fn();
const mockCacheEmbedding = jest.fn();
const mockClearAll = jest.fn();
const mockGetCacheStats = jest.fn();

/* ------------------------------------------------------------------ */
/*  Module mocks                                                      */
/* ------------------------------------------------------------------ */

jest.mock("openai", () => ({
  __esModule: true,
  default: class OpenAI {
    embeddings = { create: (...args: any[]) => mockEmbeddingsCreate(...args) };
  },
}));

jest.mock("../cache.service", () => ({
  __esModule: true,
  default: {
    getCachedEmbedding: (...args: any[]) => mockGetCachedEmbedding(...args),
    cacheEmbedding: (...args: any[]) => mockCacheEmbedding(...args),
    clearAll: (...args: any[]) => mockClearAll(...args),
    getCacheStats: (...args: any[]) => mockGetCacheStats(...args),
  },
}));

jest.mock("p-limit", () => ({
  __esModule: true,
  default: () => (fn: () => any) => fn(),
}));

jest.mock("../../config/env", () => ({
  __esModule: true,
  config: {
    OPENAI_API_KEY: "test-api-key-123",
  },
}));

import { EmbeddingsService } from "./embedding.service";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeEmbedding(dims: number = 1536): number[] {
  return new Array(dims).fill(0).map((_, i) => Math.sin(i));
}

function mockOpenAIResponse(embeddings: number[][]) {
  return {
    data: embeddings.map((embedding, i) => ({ index: i, embedding })),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("EmbeddingsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedEmbedding.mockResolvedValue(null);
    mockCacheEmbedding.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(undefined);
    mockGetCacheStats.mockResolvedValue({});
    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([makeEmbedding()]));
  });

  // ================================================================
  // Constructor / config
  // ================================================================

  test("constructor throws when OPENAI_API_KEY is missing", () => {
    // Temporarily remove the key from config
    const envMod = require("../../config/env");
    const original = envMod.config.OPENAI_API_KEY;
    envMod.config.OPENAI_API_KEY = "";

    expect(() => new EmbeddingsService()).toThrow("OPENAI_API_KEY");

    envMod.config.OPENAI_API_KEY = original;
  });

  test("default config has expected model and dimensions", () => {
    const svc = new EmbeddingsService();
    expect(svc.getEmbeddingModel()).toBe("text-embedding-3-small");
    expect(svc.getEmbeddingDimensions()).toBe(1536);
  });

  test("getEmbeddingConfig returns model and dimensions", () => {
    const svc = new EmbeddingsService({ model: "text-embedding-3-large", dimensions: 3072 });
    const cfg = svc.getEmbeddingConfig();
    expect(cfg.model).toBe("text-embedding-3-large");
    expect(cfg.dimensions).toBe(3072);
  });

  // ================================================================
  // generateEmbedding
  // ================================================================

  test("generateEmbedding returns cached embedding on cache hit", async () => {
    const cachedVec = makeEmbedding();
    mockGetCachedEmbedding.mockResolvedValue(cachedVec);

    const svc = new EmbeddingsService();
    const result = await svc.generateEmbedding("hello world");

    expect(result.embedding).toEqual(cachedVec);
    expect(result.model).toBe("text-embedding-3-small");
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
  });

  test("generateEmbedding calls API on cache miss and caches result", async () => {
    const apiVec = makeEmbedding();
    mockGetCachedEmbedding.mockResolvedValue(null);
    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService();
    const result = await svc.generateEmbedding("hello world");

    expect(result.embedding).toEqual(apiVec);
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    expect(mockCacheEmbedding).toHaveBeenCalledWith(
      "hello world",
      apiVec,
      "text-embedding-3-small",
      1536,
    );
  });

  test("generateEmbedding throws on empty text", async () => {
    const svc = new EmbeddingsService();
    await expect(svc.generateEmbedding("")).rejects.toThrow("empty text");
  });

  test("generateEmbedding throws on whitespace-only text", async () => {
    const svc = new EmbeddingsService();
    await expect(svc.generateEmbedding("   \n\t  ")).rejects.toThrow("empty text");
  });

  test("generateEmbedding preprocesses text by collapsing whitespace", async () => {
    const apiVec = makeEmbedding();
    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService();
    await svc.generateEmbedding("  hello   \n  world  ");

    expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: ["hello world"],
      }),
    );
  });

  test("generateEmbedding truncates text to maxCharsPerText", async () => {
    const apiVec = makeEmbedding();
    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService({ maxCharsPerText: 10 });
    await svc.generateEmbedding("this is a very long text that exceeds the limit");

    const callArgs = mockEmbeddingsCreate.mock.calls[0][0] as any;
    expect(callArgs.input[0].length).toBeLessThanOrEqual(10);
  });

  test("generateEmbedding skips cache when enableCache is false", async () => {
    const apiVec = makeEmbedding();
    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService({ enableCache: false });
    await svc.generateEmbedding("test text");

    expect(mockGetCachedEmbedding).not.toHaveBeenCalled();
    expect(mockCacheEmbedding).not.toHaveBeenCalled();
  });

  // ================================================================
  // generateBatchEmbeddings
  // ================================================================

  test("generateBatchEmbeddings returns empty result for empty input", async () => {
    const svc = new EmbeddingsService();
    const result = await svc.generateBatchEmbeddings([]);

    expect(result.embeddings).toEqual([]);
    expect(result.totalProcessed).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  test("generateBatchEmbeddings splits large batches and preserves order", async () => {
    const batchSize = 3;
    const texts = ["alpha", "beta", "gamma", "delta", "epsilon"];
    const vecs = texts.map((_, i) => new Array(1536).fill(i * 0.1));

    // Will be called once per batch chunk (ceil(5/3) = 2)
    mockEmbeddingsCreate
      .mockResolvedValueOnce(mockOpenAIResponse(vecs.slice(0, 3)))
      .mockResolvedValueOnce(mockOpenAIResponse(vecs.slice(3)));

    const svc = new EmbeddingsService({ maxBatchItems: batchSize, enableCache: false });
    const result = await svc.generateBatchEmbeddings(texts);

    expect(result.totalProcessed).toBe(5);
    expect(result.embeddings.length).toBe(5);
    // Verify order preserved
    expect(result.embeddings[0].text).toBe("alpha");
    expect(result.embeddings[4].text).toBe("epsilon");
    expect(result.embeddings[0].embedding).toEqual(vecs[0]);
    expect(result.embeddings[4].embedding).toEqual(vecs[4]);
  });

  test("generateBatchEmbeddings uses cache hits and only calls API for misses", async () => {
    const cachedVec = makeEmbedding();
    const apiVec = makeEmbedding(1536);

    // "alpha" is cached, "beta" is not
    mockGetCachedEmbedding
      .mockResolvedValueOnce(cachedVec) // alpha
      .mockResolvedValueOnce(null); // beta

    mockEmbeddingsCreate.mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService();
    const result = await svc.generateBatchEmbeddings(["alpha", "beta"]);

    expect(result.embeddings.length).toBe(2);
    expect(result.embeddings[0].embedding).toEqual(cachedVec);
    // API called only for the uncached item
    const callArgs = mockEmbeddingsCreate.mock.calls[0][0] as any;
    expect(callArgs.input).toEqual(["beta"]);
  });

  test("generateBatchEmbeddings counts partial failures and fills zeros", async () => {
    const goodVec = makeEmbedding();
    // Simulate batch where second item has empty embedding
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { index: 0, embedding: goodVec },
        { index: 1, embedding: [] },
      ],
    });

    // Disable failclose so we can see partial failure behavior
    const origVal = process.env.EMBEDDING_FAILCLOSE_V1;
    process.env.EMBEDDING_FAILCLOSE_V1 = "false";

    const svc = new EmbeddingsService({ enableCache: false });
    const result = await svc.generateBatchEmbeddings(["good text", "bad text"]);

    expect(result.failedCount).toBe(1);
    expect(result.embeddings[1].embedding.every((v: number) => v === 0)).toBe(true);

    if (origVal !== undefined) process.env.EMBEDDING_FAILCLOSE_V1 = origVal;
    else delete process.env.EMBEDDING_FAILCLOSE_V1;
  });

  test("generateBatchEmbeddings throws when failclose is enabled and batch fails", async () => {
    mockEmbeddingsCreate.mockRejectedValue(new Error("API down"));

    const origVal = process.env.EMBEDDING_FAILCLOSE_V1;
    process.env.EMBEDDING_FAILCLOSE_V1 = "true";

    const svc = new EmbeddingsService({
      enableCache: false,
      maxRetries: 0,
    });

    await expect(
      svc.generateBatchEmbeddings(["some text"]),
    ).rejects.toThrow(/failed/i);

    if (origVal !== undefined) process.env.EMBEDDING_FAILCLOSE_V1 = origVal;
    else delete process.env.EMBEDDING_FAILCLOSE_V1;
  });

  // ================================================================
  // Retry behavior
  // ================================================================

  test("retries on 429 rate-limit error", async () => {
    const err429 = new Error("rate limited");
    (err429 as any).status = 429;

    const apiVec = makeEmbedding();
    mockEmbeddingsCreate
      .mockRejectedValueOnce(err429)
      .mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService({
      maxRetries: 2,
      baseBackoffMs: 1,
      maxBackoffMs: 2,
    });

    const result = await svc.generateEmbedding("retry test");
    expect(result.embedding).toEqual(apiVec);
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
  });

  test("retries on 5xx server error", async () => {
    const err500 = new Error("internal server error");
    (err500 as any).status = 503;

    const apiVec = makeEmbedding();
    mockEmbeddingsCreate
      .mockRejectedValueOnce(err500)
      .mockResolvedValue(mockOpenAIResponse([apiVec]));

    const svc = new EmbeddingsService({
      maxRetries: 2,
      baseBackoffMs: 1,
      maxBackoffMs: 2,
    });

    const result = await svc.generateEmbedding("server error test");
    expect(result.embedding).toEqual(apiVec);
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
  });

  test("does not retry on 400 bad request", async () => {
    const err400 = new Error("bad request");
    (err400 as any).status = 400;

    mockEmbeddingsCreate.mockRejectedValue(err400);

    const svc = new EmbeddingsService({
      maxRetries: 3,
      baseBackoffMs: 1,
      maxBackoffMs: 2,
    });

    await expect(svc.generateEmbedding("bad input")).rejects.toThrow();
    // Should only call once — no retries for 400
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
  });

  test("throws after exhausting all retries", async () => {
    const errTimeout = new Error("timeout");
    (errTimeout as any).status = 429;

    mockEmbeddingsCreate.mockRejectedValue(errTimeout);

    const svc = new EmbeddingsService({
      maxRetries: 2,
      baseBackoffMs: 1,
      maxBackoffMs: 2,
    });

    await expect(svc.generateEmbedding("exhaust retries")).rejects.toThrow(
      /failed after/i,
    );
    // initial + 2 retries = 3
    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3);
  });

  // ================================================================
  // calculateSimilarity
  // ================================================================

  test("calculateSimilarity returns 1.0 for identical vectors", () => {
    const svc = new EmbeddingsService();
    const vec = [0.5, 0.3, 0.8, 0.1];
    const similarity = svc.calculateSimilarity(vec, vec);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  test("calculateSimilarity returns 0 for orthogonal vectors", () => {
    const svc = new EmbeddingsService();
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = svc.calculateSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.0, 5);
  });

  test("calculateSimilarity throws on dimension mismatch", () => {
    const svc = new EmbeddingsService();
    const a = [0.1, 0.2, 0.3];
    const b = [0.1, 0.2];
    expect(() => svc.calculateSimilarity(a, b)).toThrow("same dimensions");
  });
});
