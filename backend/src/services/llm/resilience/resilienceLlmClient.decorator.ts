/**
 * resilienceLlmClient.decorator.ts
 *
 * LLMClient decorator that adds circuit-breaking and concurrency control.
 * Wraps any raw provider client with resilience patterns.
 *
 * Chain order (outermost → innermost):
 *   TelemetryLLMClient → ResilienceLLMClient → raw provider
 */

import type {
  LLMClient,
  LLMRequest,
  LLMCompletionResponse,
  LLMStreamResponse,
} from "../core/llmClient.interface";
import type { LLMProvider } from "../core/llmErrors.types";
import type { LLMStreamingConfig, StreamSink, StreamState, StreamingHooks } from "../types/llmStreaming.types";
import { CircuitBreaker, CircuitOpenError } from "./circuitBreaker";
import { Semaphore } from "./semaphore";

export interface ResilienceConfig {
  semaphore: Semaphore;
  circuitBreaker: CircuitBreaker;
}

export class ResilienceLLMClient implements LLMClient {
  readonly provider: LLMProvider;

  constructor(
    private readonly inner: LLMClient,
    private readonly resilience: ResilienceConfig,
  ) {
    this.provider = inner.provider;
  }

  async ping(): Promise<{ ok: boolean; provider: LLMProvider; t: number }> {
    if (this.inner.ping) {
      return this.inner.ping();
    }
    return { ok: true, provider: this.provider, t: Date.now() };
  }

  async complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMCompletionResponse> {
    const { circuitBreaker, semaphore } = this.resilience;

    if (circuitBreaker.isOpen()) {
      throw new CircuitOpenError(this.provider);
    }
    circuitBreaker.recordHalfOpenAttempt();

    await semaphore.acquire();
    try {
      const result = await this.inner.complete(req, signal);
      circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      circuitBreaker.recordFailure();
      throw err;
    } finally {
      semaphore.release();
    }
  }

  async stream(params: {
    req: LLMRequest;
    sink: StreamSink;
    config: LLMStreamingConfig;
    hooks?: StreamingHooks;
    initialState?: Partial<StreamState>;
    signal?: AbortSignal;
  }): Promise<LLMStreamResponse> {
    const { circuitBreaker, semaphore } = this.resilience;

    if (circuitBreaker.isOpen()) {
      // For streaming, emit error event to sink before throwing
      if (params.sink.isOpen()) {
        params.sink.write({
          event: "error",
          data: {
            code: "CIRCUIT_OPEN",
            message: `Circuit breaker open for provider: ${this.provider}`,
            t: Date.now(),
          },
        });
        params.sink.close();
      }
      throw new CircuitOpenError(this.provider);
    }
    circuitBreaker.recordHalfOpenAttempt();

    await semaphore.acquire();
    try {
      const result = await this.inner.stream(params);
      circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      circuitBreaker.recordFailure();
      throw err;
    } finally {
      semaphore.release();
    }
  }

  /** Expose internals for health-check endpoints. */
  getCircuitSnapshot() {
    return this.resilience.circuitBreaker.getSnapshot();
  }

  getSemaphoreStats() {
    return {
      inflight: this.resilience.semaphore.inflight,
      queued: this.resilience.semaphore.queued,
    };
  }
}
