// src/services/llm/core/telemetryLlmClient.decorator.ts
//
// Transparent wrapper around any LLMClient that logs every complete() and stream()
// call as a ModelCall telemetry event. Sits between the factory and all consumers
// so instrumentation is automatic — no call-site changes needed.

import type {
  LLMClient,
  LLMRequest,
  LLMCompletionResponse,
  LLMStreamResponse,
} from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type {
  StreamSink,
  LLMStreamingConfig,
  StreamingHooks,
  StreamState,
  StreamEvent,
} from "./llmStreaming.types";
import type { TelemetryService } from "../../telemetry/telemetry.service";
import type {
  LLMProviderKey,
  PipelineStage,
} from "../../telemetry/telemetry.types";

function mapProvider(p: LLMProvider): LLMProviderKey {
  if (typeof p === "string") {
    const lower = p.toLowerCase();
    if (lower.includes("google") || lower.includes("gemini")) return "google";
    if (lower.includes("openai") || lower.includes("gpt")) return "openai";
    if (lower.includes("local")) return "local";
  }
  return "unknown";
}

function mapStage(purpose?: string): PipelineStage {
  switch (purpose) {
    case "intent_routing":
      return "intent_operator";
    case "retrieval_planning":
      return "retrieval";
    case "answer_compose":
      return "compose";
    case "validation_pass":
      return "quality_gates";
    default:
      return "compose";
  }
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string" && e.code) return e.code;
    // Check for CircuitOpenError
    if (e.name === "CircuitOpenError") return "CIRCUIT_OPEN";
    if (typeof e.message === "string") return e.message.slice(0, 100);
  }
  return "UNKNOWN";
}

export class TelemetryLLMClient implements LLMClient {
  readonly provider: LLMProvider;

  constructor(
    private readonly inner: LLMClient,
    private readonly telemetry: TelemetryService,
  ) {
    this.provider = inner.provider;
  }

  async ping() {
    const startMs = Date.now();
    try {
      const result = await (this.inner.ping?.() ?? Promise.resolve({
        ok: true,
        provider: this.provider,
        t: Date.now(),
      }));
      return result;
    } catch {
      return { ok: false, provider: this.provider, t: Date.now() };
    }
  }

  async complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMCompletionResponse> {
    const startMs = Date.now();
    let response: LLMCompletionResponse | undefined;
    let errorCode: string | undefined;

    try {
      response = await this.inner.complete(req, signal);
      return response;
    } catch (err: unknown) {
      errorCode = extractErrorCode(err);
      throw err;
    } finally {
      const durationMs = Date.now() - startMs;
      this.telemetry.logModelCall({
        userId: (req.meta?.userId as string) || "system",
        traceId: req.traceId,
        turnId: req.turnId || null,
        provider: mapProvider(req.model.provider),
        model: req.model.model,
        stage: mapStage(req.purpose),
        status: errorCode ? "fail" : "ok",
        errorCode: errorCode || null,
        promptTokens: response?.usage?.promptTokens ?? null,
        completionTokens: response?.usage?.completionTokens ?? null,
        totalTokens: response?.usage?.totalTokens ?? null,
        firstTokenMs: null,
        durationMs,
        retries: null,
        at: new Date(),
      });
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
    const startMs = Date.now();
    let firstTokenMs: number | null = null;
    let response: LLMStreamResponse | undefined;
    let errorCode: string | undefined;

    // Wrap the sink to capture first-token time
    // Use Object.create to preserve prototype methods (isOpen, close, flush)
    const originalSink = params.sink;
    const wrappedSink: StreamSink = {
      transport: originalSink.transport,
      write(event: StreamEvent) {
        if (firstTokenMs === null && event.event === "delta") {
          firstTokenMs = Date.now() - startMs;
        }
        originalSink.write(event);
      },
      flush() {
        originalSink.flush?.();
      },
      close() {
        originalSink.close();
      },
      isOpen() {
        return originalSink.isOpen();
      },
    };

    try {
      response = await this.inner.stream({
        ...params,
        sink: wrappedSink,
      });
      return response;
    } catch (err: unknown) {
      errorCode = extractErrorCode(err);
      throw err;
    } finally {
      const durationMs = Date.now() - startMs;
      this.telemetry.logModelCall({
        userId: (params.req.meta?.userId as string) || "system",
        traceId: params.req.traceId,
        turnId: params.req.turnId || null,
        provider: mapProvider(params.req.model.provider),
        model: params.req.model.model,
        stage: mapStage(params.req.purpose),
        status: errorCode ? "fail" : "ok",
        errorCode: errorCode || null,
        promptTokens: response?.usage?.promptTokens ?? null,
        completionTokens: response?.usage?.completionTokens ?? null,
        totalTokens: response?.usage?.totalTokens ?? null,
        firstTokenMs,
        durationMs,
        retries: null,
        at: new Date(),
      });
    }
  }

  normalizeToolCalls?(raw: unknown) {
    return this.inner.normalizeToolCalls?.(raw) ?? [];
  }
}
