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
import { withRetry, type RetryConfig } from "./retry";

export interface ResilienceConfig {
  semaphore: Semaphore;
  circuitBreaker: CircuitBreaker;
  retry?: RetryConfig;
}

function extractStatusFromError(err: unknown): number | null {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return e.status;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (e.response && typeof e.response === "object") {
      const resp = e.response as Record<string, unknown>;
      if (typeof resp.status === "number") return resp.status;
    }
    // Gemini errors often include JSON with status in the message
    if (typeof e.message === "string") {
      const m = e.message.match(/\b([45]\d{2})\b/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
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
      const retryConfig = this.resilience.retry ?? { maxRetries: 0 };
      const { result, attempts } = await withRetry(
        () => this.inner.complete(req, signal),
        retryConfig,
      );
      circuitBreaker.recordSuccess();
      // Attach retry attempts for telemetry
      (result as unknown as Record<string, unknown>).__retryAttempts = attempts;
      return result;
    } catch (err) {
      const status = extractStatusFromError(err);
      if (!status || status >= 500 || status === 429) {
        circuitBreaker.recordFailure();
      }
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
      // For streaming, only retry if no events have been emitted yet.
      // Track whether the sink received any writes.
      let eventsEmitted = false;
      const originalWrite = params.sink.write.bind(params.sink);
      const guardedSink: StreamSink = {
        ...params.sink,
        write(event) {
          eventsEmitted = true;
          originalWrite(event);
        },
        isOpen: params.sink.isOpen.bind(params.sink),
        close: params.sink.close.bind(params.sink),
        flush: params.sink.flush?.bind(params.sink),
        transport: params.sink.transport,
      };

      const retryConfig = this.resilience.retry ?? { maxRetries: 0 };
      const streamRetryConfig: RetryConfig = {
        ...retryConfig,
        shouldRetry: (err, attempt) => {
          // Don't retry after events have been emitted to the sink
          if (eventsEmitted) return false;
          return retryConfig.shouldRetry?.(err, attempt) ?? true;
        },
      };

      const { result, attempts } = await withRetry(
        () => this.inner.stream({ ...params, sink: guardedSink }),
        streamRetryConfig,
      );
      circuitBreaker.recordSuccess();
      (result as unknown as Record<string, unknown>).__retryAttempts = attempts;
      return result;
    } catch (err) {
      const status = extractStatusFromError(err);
      if (!status || status >= 500 || status === 429) {
        circuitBreaker.recordFailure();
      }
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
