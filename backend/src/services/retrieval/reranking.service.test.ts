import { describe, expect, test, jest, beforeEach } from "@jest/globals";

const mockRerank = jest.fn();

jest.mock("cohere-ai", () => ({
  CohereClient: jest.fn().mockImplementation(() => ({
    v2: { rerank: mockRerank },
  })),
}));

import { RerankingService } from "./reranking.service";

describe("RerankingService", () => {
  beforeEach(() => {
    process.env.COHERE_API_KEY = "test-key";
    process.env.RETRIEVAL_RERANK_ENABLED = "true";
    mockRerank.mockReset();
    mockRerank.mockResolvedValue({
      results: [
        { index: 0, relevanceScore: 0.95 },
        { index: 1, relevanceScore: 0.42 },
        { index: 2, relevanceScore: 0.88 },
      ],
    });
  });

  test("assigns rerankScore to candidates", async () => {
    const service = new RerankingService();
    const candidates = [
      { candidateId: "a", snippet: "Revenue was $10M", scores: {} },
      { candidateId: "b", snippet: "Employee count grew", scores: {} },
      { candidateId: "c", snippet: "Net income $2M", scores: {} },
    ];
    const result = await service.rerank(
      "What is the revenue?",
      candidates as any,
    );
    expect(result[0].scores.rerankScore).toBe(0.95);
    expect(result[1].scores.rerankScore).toBe(0.42);
    expect(result[2].scores.rerankScore).toBe(0.88);
  });

  test("gracefully degrades when API fails", async () => {
    mockRerank.mockRejectedValue(new Error("timeout"));
    const service = new RerankingService();
    const candidates = [{ candidateId: "a", snippet: "text", scores: {} }];
    const result = await service.rerank("query", candidates as any);
    expect(result[0].scores.rerankScore).toBeUndefined();
  });

  test("skips when disabled", async () => {
    process.env.RETRIEVAL_RERANK_ENABLED = "false";
    const service = new RerankingService();
    const candidates = [{ candidateId: "a", snippet: "text", scores: {} }];
    const result = await service.rerank("query", candidates as any);
    expect(result[0].scores.rerankScore).toBeUndefined();
  });

  test("skips candidates with null/empty snippets (encrypted mode)", async () => {
    mockRerank.mockResolvedValue({
      results: [{ index: 0, relevanceScore: 0.91 }],
    });
    const service = new RerankingService();
    const candidates = [
      { candidateId: "a", snippet: "Revenue $10M", scores: {} },
      { candidateId: "b", snippet: "", scores: {} },
      { candidateId: "c", snippet: null, scores: {} },
    ];
    const result = await service.rerank("revenue", candidates as any);
    expect(result[0].scores.rerankScore).toBe(0.91);
    expect(result[1].scores.rerankScore).toBeUndefined();
    expect(result[2].scores.rerankScore).toBeUndefined();
  });

  test("only reranks top N candidates", async () => {
    mockRerank.mockResolvedValue({
      results: [
        { index: 0, relevanceScore: 0.80 },
        { index: 1, relevanceScore: 0.70 },
      ],
    });
    const service = new RerankingService({ topN: 2 });
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      candidateId: `c${i}`,
      snippet: `text ${i}`,
      scores: {},
    }));
    const result = await service.rerank("query", candidates as any);
    const reranked = result.filter(
      (c: any) => c.scores.rerankScore !== undefined,
    );
    expect(reranked.length).toBe(2);
  });
});
