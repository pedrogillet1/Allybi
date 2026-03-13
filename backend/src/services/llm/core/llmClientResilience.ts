import type { LLMClient } from "./llmClient.interface";

import { ResilienceLLMClient } from "../resilience/resilienceLlmClient.decorator";
import { Semaphore } from "../resilience/semaphore";
import { CircuitBreaker } from "../resilience/circuitBreaker";
import { isRetryableError } from "../resilience/retry";

export interface LLMClientRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface LLMClientResilienceConfig {
  concurrency: number;
  retry: LLMClientRetryConfig;
}

export function wrapClientWithResilience(
  raw: LLMClient,
  name: string,
  config: LLMClientResilienceConfig,
): LLMClient {
  return new ResilienceLLMClient(raw, {
    semaphore: new Semaphore(config.concurrency),
    circuitBreaker: new CircuitBreaker(`llm:${name}`),
    retry: {
      maxRetries: config.retry.maxRetries,
      baseDelayMs: config.retry.baseDelayMs,
      maxDelayMs: config.retry.maxDelayMs,
      shouldRetry: isRetryableError,
    },
  });
}
