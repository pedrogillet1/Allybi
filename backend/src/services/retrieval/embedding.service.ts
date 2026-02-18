// src/services/retrieval/embeddings.service.ts
/**
 * Embeddings Service (OpenAI)
 * - text-embedding-3-small (1536 dims) by default
 * - Cache-first (optional)
 * - Batch support with stable ordering
 * - Robust retry/backoff for 429 + transient 5xx
 */

import OpenAI from 'openai';
import { config } from '../../config/env';
import cacheService from '../cache.service';
import pLimit from 'p-limit';

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[];
  totalProcessed: number;
  failedCount: number;
  processingTime: number;
}

export interface EmbeddingOptions {
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION';
  title?: string;
}

type ServiceConfig = {
  model: string;
  dimensions: number;

  // Safety/perf limits
  maxCharsPerText: number;
  maxBatchItems: number;

  // Retry behavior
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;

  // Cache
  enableCache: boolean;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function jitter(ms: number) {
  // +/- 20% jitter
  const delta = ms * 0.2;
  return Math.max(0, Math.floor(ms + (Math.random() * 2 - 1) * delta));
}

function isRetryable(err: any) {
  const status = err?.status ?? err?.response?.status;
  // OpenAI SDK errors often have .status
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;

  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset')) return true;

  return false;
}

function preprocess(text: string, maxChars: number): string {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length > maxChars) t = t.slice(0, maxChars);
  return t;
}

export class EmbeddingsService {
  private openai: OpenAI;
  private cfg: ServiceConfig;

  constructor(serviceCfg?: Partial<ServiceConfig>) {
    if (!config.OPENAI_API_KEY) {
      // Don’t crash at import time in environments that won’t use embeddings
      // but do fail hard when actually invoked.
      throw new Error('OPENAI_API_KEY is not configured');
    }

    this.openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    this.cfg = {
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536),

      // Keep conservative defaults; raise via env if you want
      maxCharsPerText: Number(process.env.OPENAI_EMBEDDING_MAX_CHARS || 12000),
      maxBatchItems: Number(process.env.OPENAI_EMBEDDING_MAX_BATCH_ITEMS || 256),

      maxRetries: Number(process.env.OPENAI_EMBEDDING_MAX_RETRIES || 3),
      baseBackoffMs: Number(process.env.OPENAI_EMBEDDING_BACKOFF_BASE_MS || 500),
      maxBackoffMs: Number(process.env.OPENAI_EMBEDDING_BACKOFF_MAX_MS || 8000),

      enableCache: (process.env.OPENAI_EMBEDDING_CACHE_ENABLED || 'true').toLowerCase() === 'true',

      ...(serviceCfg || {}),
    };
  }

  getEmbeddingDimensions(): number {
    return this.cfg.dimensions;
  }

  getEmbeddingModel(): string {
    return this.cfg.model;
  }

  getEmbeddingConfig(): { model: string; dimensions: number } {
    return {
      model: this.cfg.model,
      dimensions: this.cfg.dimensions,
    };
  }

  /**
   * Single embedding (cache-first).
   */
  async generateEmbedding(text: string, _options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    const processedText = preprocess(text, this.cfg.maxCharsPerText);
    if (!processedText) {
      throw new Error('Cannot generate embedding for empty text');
    }

    if (this.cfg.enableCache) {
      const cached = await cacheService.getCachedEmbedding(processedText);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        return {
          text: processedText,
          embedding: cached,
          dimensions: cached.length,
          model: this.cfg.model,
        };
      }
    }

    const embedding = await this.callOpenAIEmbeddingWithRetry([processedText]).then((arr) => arr[0]);

    if (this.cfg.enableCache) {
      await cacheService.cacheEmbedding(processedText, embedding);
    }

    return {
      text: processedText,
      embedding,
      dimensions: embedding.length,
      model: this.cfg.model,
    };
  }

  /**
   * Batch embeddings (cache-first, preserves input order).
   */
  async generateBatchEmbeddings(texts: string[], _options: EmbeddingOptions = {}): Promise<BatchEmbeddingResult> {
    const start = Date.now();

    if (!texts || texts.length === 0) {
      return { embeddings: [], totalProcessed: 0, failedCount: 0, processingTime: 0 };
    }

    const processed = texts.map((t) => preprocess(t, this.cfg.maxCharsPerText));

    // Stable slots (same order as input)
    const out: Array<EmbeddingResult | null> = new Array(processed.length).fill(null);

    // 1) Cache pass
    const uncached: Array<{ idx: number; text: string }> = [];
    if (this.cfg.enableCache) {
      const cachedResults = await Promise.all(
        processed.map(async (t, idx) => {
          if (!t) return { idx, text: t, cached: null as number[] | null };
          const cached = await cacheService.getCachedEmbedding(t);
          return { idx, text: t, cached };
        })
      );

      for (const r of cachedResults) {
        if (!r.text) continue;
        if (r.cached && r.cached.length > 0) {
          out[r.idx] = {
            text: r.text,
            embedding: r.cached,
            dimensions: r.cached.length,
            model: this.cfg.model,
          };
        } else {
          uncached.push({ idx: r.idx, text: r.text });
        }
      }
    } else {
      for (let i = 0; i < processed.length; i++) {
        if (processed[i]) uncached.push({ idx: i, text: processed[i] });
      }
    }

    // 2) API pass (only for uncached)
    let failedCount = 0;

    if (uncached.length > 0) {
      const batches = this.chunk(uncached, this.cfg.maxBatchItems);

      // Concurrency matters here: each batch is a separate OpenAI API request.
      // Honor EMBEDDING_CONCURRENCY so operators can tune throughput vs rate-limit risk.
      const embeddingConcurrency = Number(process.env.EMBEDDING_CONCURRENCY || 3);
      const limit = pLimit(Math.max(1, embeddingConcurrency));

      const batchResults = await Promise.all(
        batches.map((batch) =>
          limit(async () => {
            const inputs = batch.map((b) => b.text);
            try {
              const embeddings = await this.callOpenAIEmbeddingWithRetry(inputs);
              return { batch, embeddings, error: false };
            } catch {
              return { batch, embeddings: null, error: true };
            }
          })
        )
      );

      const cachePromises: Promise<void>[] = [];

      for (const { batch, embeddings, error } of batchResults) {
        if (error || !embeddings) {
          failedCount += batch.length;
          for (const { idx, text } of batch) {
            out[idx] = {
              text,
              embedding: new Array(this.cfg.dimensions).fill(0),
              dimensions: this.cfg.dimensions,
              model: this.cfg.model,
            };
          }
          continue;
        }

        for (let j = 0; j < batch.length; j++) {
          const { idx, text } = batch[j];
          const emb = embeddings[j];

          if (!emb || emb.length === 0) {
            failedCount++;
            out[idx] = {
              text,
              embedding: new Array(this.cfg.dimensions).fill(0),
              dimensions: this.cfg.dimensions,
              model: this.cfg.model,
            };
            continue;
          }

          if (this.cfg.enableCache) {
            cachePromises.push(cacheService.cacheEmbedding(text, emb));
          }

          out[idx] = {
            text,
            embedding: emb,
            dimensions: emb.length,
            model: this.cfg.model,
          };
        }
      }

      // Write cache entries in parallel (fire-and-forget, don't block)
      if (cachePromises.length > 0) {
        Promise.all(cachePromises).catch(() => {});
      }
    }

    const embeddings = out.filter((x): x is EmbeddingResult => !!x);

    return {
      embeddings,
      totalProcessed: texts.length,
      failedCount,
      processingTime: Date.now() - start,
    };
  }

  async generateQueryEmbedding(query: string): Promise<EmbeddingResult> {
    return this.generateEmbedding(query, { taskType: 'RETRIEVAL_QUERY', title: 'User Query' });
  }

  async generateDocumentEmbedding(text: string, title?: string): Promise<EmbeddingResult> {
    return this.generateEmbedding(text, { taskType: 'RETRIEVAL_DOCUMENT', title });
  }

  calculateSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Embeddings must have the same dimensions');

    let dot = 0;
    let na = 0;
    let nb = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }

    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  findTopKSimilar(
    queryEmbedding: number[],
    candidates: Array<{ id: string; embedding: number[]; metadata?: any }>,
    k: number = 10
  ): Array<{ id: string; similarity: number; metadata?: any }> {
    return candidates
      .map((c) => ({
        id: c.id,
        similarity: this.calculateSimilarity(queryEmbedding, c.embedding),
        metadata: c.metadata,
      }))
      .sort((x, y) => y.similarity - x.similarity)
      .slice(0, k);
  }

  async clearCache(): Promise<void> {
    await cacheService.clearAll();
  }

  async getCacheStats() {
    return cacheService.getCacheStats();
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  private async callOpenAIEmbeddingWithRetry(inputs: string[]): Promise<number[][]> {
    const cleaned = inputs.map((t) => preprocess(t, this.cfg.maxCharsPerText));
    if (cleaned.some((t) => !t)) {
      throw new Error('Batch contains empty text after preprocessing');
    }

    let attempt = 0;
    let lastErr: any = null;

    while (attempt <= this.cfg.maxRetries) {
      try {
        const res = await this.openai.embeddings.create({
          model: this.cfg.model,
          input: cleaned,
          dimensions: this.cfg.dimensions,
        });

        const out = res.data.map((d) => d.embedding);
        // Basic sanity
        if (!out.length || out.some((e) => !e || e.length === 0)) {
          throw new Error('OpenAI embeddings returned empty vectors');
        }
        return out;
      } catch (err: any) {
        lastErr = err;
        attempt++;

        if (attempt > this.cfg.maxRetries || !isRetryable(err)) break;

        const backoff = Math.min(this.cfg.maxBackoffMs, this.cfg.baseBackoffMs * Math.pow(2, attempt - 1));
        await sleep(jitter(backoff));
      }
    }

    const msg = String(lastErr?.message || lastErr || 'Unknown error');
    throw new Error(`OpenAI embeddings failed after ${this.cfg.maxRetries + 1} attempts: ${msg}`);
  }
}

// Default singleton (DI/container preferred)
const embeddingsService = new EmbeddingsService();
export default embeddingsService;
