import { CohereClient } from "cohere-ai";

interface RerankCandidate {
  candidateId: string;
  snippet: string | null;
  scores: Record<string, number | undefined>;
}

interface RerankConfig {
  topN?: number;
  model?: string;
  timeoutMs?: number;
}

export class RerankingService {
  private readonly client: CohereClient | null;
  private readonly topN: number;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config?: RerankConfig) {
    const apiKey = process.env.COHERE_API_KEY;
    this.client = apiKey ? new CohereClient({ token: apiKey }) : null;
    this.topN = config?.topN ?? Number(process.env.RERANK_TOP_N || 25);
    this.model = config?.model ?? (process.env.RERANK_MODEL || "rerank-v3.5");
    this.timeoutMs =
      config?.timeoutMs ?? Number(process.env.RERANK_TIMEOUT_MS || 3000);
  }

  async rerank<T extends RerankCandidate>(
    query: string,
    candidates: T[],
  ): Promise<T[]> {
    if (!this.isEnabled() || !this.client || candidates.length === 0)
      return candidates;

    // Filter to candidates with valid snippets (encrypted mode has null)
    const rerankable: Array<{ idx: number; candidate: T }> = [];
    for (let i = 0; i < Math.min(candidates.length, this.topN); i++) {
      if (candidates[i].snippet && candidates[i].snippet!.trim().length > 0) {
        rerankable.push({ idx: i, candidate: candidates[i] });
      }
    }
    if (rerankable.length === 0) return candidates;

    try {
      const response = await Promise.race([
        this.client.v2.rerank({
          model: this.model,
          query,
          documents: rerankable.map((r) => r.candidate.snippet!),
          topN: rerankable.length,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Rerank timeout")),
            this.timeoutMs,
          ),
        ),
      ]);

      for (const result of response.results) {
        const entry = rerankable[result.index];
        if (entry) entry.candidate.scores.rerankScore = result.relevanceScore;
      }
    } catch {
      // Graceful degradation — return candidates without rerankScore
    }

    return candidates;
  }

  private isEnabled(): boolean {
    return ["1", "true", "yes"].includes(
      (process.env.RETRIEVAL_RERANK_ENABLED || "").trim().toLowerCase(),
    );
  }
}
