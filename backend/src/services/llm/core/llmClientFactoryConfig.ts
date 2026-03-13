import type { LLMClientResilienceConfig } from "./llmClientResilience";

export type LLMClientKey = "openai" | "google" | "local";

export type PartialClientResilienceConfig = Partial<{
  concurrency: number;
  retry: Partial<LLMClientResilienceConfig["retry"]>;
}>;

export type FactoryResilienceConfig = Partial<
  Record<LLMClientKey, PartialClientResilienceConfig>
>;

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function positiveOrFallback(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

export function resolveFactoryResilienceConfig(
  input?: FactoryResilienceConfig,
): Record<LLMClientKey, LLMClientResilienceConfig> {
  return {
    openai: {
      concurrency: positiveOrFallback(
        input?.openai?.concurrency,
        envInt("OPENAI_MAX_CONCURRENT", 8),
      ),
      retry: {
        maxRetries: positiveOrFallback(
          input?.openai?.retry?.maxRetries,
          envInt("OPENAI_RETRY_MAX", 2),
        ),
        baseDelayMs: positiveOrFallback(
          input?.openai?.retry?.baseDelayMs,
          envInt("OPENAI_RETRY_BASE_DELAY_MS", 500),
        ),
        maxDelayMs: positiveOrFallback(
          input?.openai?.retry?.maxDelayMs,
          envInt("OPENAI_RETRY_MAX_DELAY_MS", 8000),
        ),
      },
    },
    google: {
      concurrency: positiveOrFallback(
        input?.google?.concurrency,
        envInt("GEMINI_CONCURRENCY", 6),
      ),
      retry: {
        maxRetries: positiveOrFallback(
          input?.google?.retry?.maxRetries,
          envInt("GOOGLE_RETRY_MAX", 2),
        ),
        baseDelayMs: positiveOrFallback(
          input?.google?.retry?.baseDelayMs,
          envInt("GOOGLE_RETRY_BASE_DELAY_MS", 500),
        ),
        maxDelayMs: positiveOrFallback(
          input?.google?.retry?.maxDelayMs,
          envInt("GOOGLE_RETRY_MAX_DELAY_MS", 8000),
        ),
      },
    },
    local: {
      concurrency: positiveOrFallback(
        input?.local?.concurrency,
        envInt("LOCAL_LLM_CONCURRENCY", 2),
      ),
      retry: {
        maxRetries: positiveOrFallback(
          input?.local?.retry?.maxRetries,
          envInt("LOCAL_RETRY_MAX", 2),
        ),
        baseDelayMs: positiveOrFallback(
          input?.local?.retry?.baseDelayMs,
          envInt("LOCAL_RETRY_BASE_DELAY_MS", 500),
        ),
        maxDelayMs: positiveOrFallback(
          input?.local?.retry?.maxDelayMs,
          envInt("LOCAL_RETRY_MAX_DELAY_MS", 8000),
        ),
      },
    },
  };
}
