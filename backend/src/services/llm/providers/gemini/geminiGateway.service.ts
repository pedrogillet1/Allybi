/**
 * geminiGateway.service.ts
 *
 * High-level Gemini gateway for Allybi.
 * Responsibilities (aligned with README):
 * - Choose the right Gemini model (Flash vs non-Flash) for low-latency work
 * - Enforce deterministic pre-flight controls (rate limit, cache)
 * - Emit telemetry events (no raw text, no user-facing copy)
 * - Delegate execution to GeminiClientService (complete + stream)
 *
 * Non-responsibilities:
 * - No trust/safety microcopy (handled by Trust Gate + banks elsewhere)
 * - No retrieval logic (handled by RAG pipeline)
 * - No tool execution orchestration (handled by orchestrator)
 */

import type {
  LLMRequest,
  LLMCompletionResponse,
  LLMStreamResponse,
} from "./llmClient.interface";
import type { StreamSink } from "./llmStreaming.types";
import type { LLMStreamingConfig } from "./llmStreaming.types";

import {
  GeminiClientService,
  type GeminiClientConfig,
} from "./geminiClient.service";
import { LLMCacheService, type CacheKeyParts } from "./llmCache.service";
import { LLMRateLimitService } from "./llmRateLimit.service";
import { LLMTelemetryService } from "./llmTelemetry.service";
import type { TelemetryReasonCode } from "./llmTelemetry.types";

export interface GeminiGatewayConfig {
  enabled: boolean;

  /** Default model names */
  models: {
    gemini3: string; // e.g. "gemini-2.5-flash"
    gemini3Flash: string; // e.g. "gemini-2.5-flash"
  };

  /**
   * Which request purposes should strongly prefer Flash.
   * In Allybi README spirit: routing/scope/discovery/first-pass answers.
   */
  flashPurposes: Array<
    | "intent_routing"
    | "retrieval_planning"
    | "answer_compose"
    | "validation_pass"
    | "other"
  >;

  /**
   * Cache policy:
   * - complete requests are cacheable (deterministic given same inputs + state)
   * - streaming is generally NOT cached (but you can cache prefill signals if you want)
   */
  cache: {
    enabled: boolean;
    /** Default TTL for LLM complete responses (ms) */
    ttlMs: number;
    /** Optional max bytes stored per entry */
    maxBytes?: number;
  };

  /**
   * Rate limiting strategy:
   * - requests metric: 1 unit per call
   * - tokens metric: predicted tokens (optional) should be checked upstream
   */
  rateLimit: {
    enabled: boolean;
  };

  /**
   * When Gemini should be used as "always-on fast worker"
   * vs when upstream should route to a different model.
   * This gateway assumes it is invoked only when Gemini is selected.
   */
  strictModelEnforcement?: boolean;
}

export class GeminiGatewayService {
  private readonly client: GeminiClientService;

  constructor(
    private readonly gatewayCfg: GeminiGatewayConfig,
    clientCfg: GeminiClientConfig,
    private readonly cache: LLMCacheService,
    private readonly rateLimit: LLMRateLimitService,
    private readonly telemetry: LLMTelemetryService,
  ) {
    this.client = new GeminiClientService(clientCfg);
  }

  /**
   * Non-streamed completion with:
   * - model selection (Flash vs non-Flash)
   * - rate-limit preflight
   * - cache (if enabled)
   * - telemetry
   */
  async complete(req: LLMRequest): Promise<LLMCompletionResponse> {
    if (!this.gatewayCfg.enabled) {
      // Caller decides fallback; throw a deterministic error for upstream handling.
      throw new Error("GEMINI_GATEWAY_DISABLED");
    }

    const resolved = this.resolveModel(req);

    this.telemetry.requestStarted({
      traceId: resolved.traceId,
      turnId: resolved.turnId,
      provider: "google",
      model: resolved.model.model,
      docLockEnabled: !!resolved.meta?.["docLockEnabled"],
      lockedDocId: resolved.meta?.["lockedDocId"] as string | undefined,
      lockedFilename: resolved.meta?.["lockedFilename"] as string | undefined,
    });

    // Rate limit (requests metric)
    if (this.gatewayCfg.rateLimit.enabled) {
      const rl = await this.rateLimit.checkAndConsume({
        traceId: resolved.traceId,
        identity: {
          tenantId:
            (resolved.meta?.["tenantId"] as string | undefined) ?? undefined,
          userId:
            (resolved.meta?.["userId"] as string | undefined) ?? undefined,
          provider: "google",
          model: resolved.model.model,
        },
        units: 1,
      });

      this.telemetry.stageCompleted({
        name: "trust.ratelimit.decided",
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        stage: "trust_gate",
        reason: rl.allowed ? "OK" : "RATE_LIMIT",
        meta: { allowed: rl.allowed, retryAtMs: rl.retryAtMs },
      });

      if (!rl.allowed) {
        this.telemetry.requestFailed({
          traceId: resolved.traceId,
          turnId: resolved.turnId,
          reason: "RATE_LIMIT",
          meta: { retryAtMs: rl.retryAtMs },
        });
        // Upstream maps to bank-driven fallback.
        throw new Error("LLM_PROVIDER_RATE_LIMIT");
      }
    }

    // Cache lookup
    const cacheKey =
      this.gatewayCfg.cache.enabled && this.gatewayCfg.cache.enabled
        ? this.buildCompleteCacheKey(resolved)
        : null;

    if (this.gatewayCfg.cache.enabled && cacheKey) {
      const hit = await this.cache.get<LLMCompletionResponse>(cacheKey);
      if (hit.hit && hit.entry?.value) {
        this.telemetry.stageCompleted({
          name: "llm.request.completed",
          traceId: resolved.traceId,
          turnId: resolved.turnId,
          stage: "compose",
          reason: "OK",
          meta: { cache: "hit" },
        });
        return hit.entry.value;
      }
    }

    const startMs = Date.now();

    try {
      const out = await this.client.complete(resolved);

      this.telemetry.requestCompleted({
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        usage: out.usage,
        timing: {
          startMs,
          endMs: Date.now(),
        },
      });

      // Cache set (best-effort)
      if (this.gatewayCfg.cache.enabled && cacheKey) {
        await this.cache.set(cacheKey, out, {
          ttlMs: this.gatewayCfg.cache.ttlMs,
          maxBytes: this.gatewayCfg.cache.maxBytes,
          namespace: "llm_complete",
        });
      }

      return out;
    } catch (e) {
      const reason = this.mapErrorToTelemetryReason(e);
      this.telemetry.requestFailed({
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        reason,
        meta: { err: safeErrorString(e) },
      });
      throw e;
    }
  }

  /**
   * Streamed completion with:
   * - model selection (Flash vs non-Flash)
   * - rate-limit preflight
   * - telemetry
   *
   * NOTE: We generally avoid caching streamed output.
   */
  async stream(params: {
    req: LLMRequest;
    sink: StreamSink;
    config: LLMStreamingConfig;
  }): Promise<LLMStreamResponse> {
    const { req, sink, config } = params;

    if (!this.gatewayCfg.enabled) {
      throw new Error("GEMINI_GATEWAY_DISABLED");
    }

    const resolved = this.resolveModel(req);

    this.telemetry.stageCompleted({
      name: "llm.stream.started",
      traceId: resolved.traceId,
      turnId: resolved.turnId,
      stage: "stream",
      reason: "OK",
      meta: { provider: "google", model: resolved.model.model },
    });

    // Rate limit (requests metric)
    if (this.gatewayCfg.rateLimit.enabled) {
      const rl = await this.rateLimit.checkAndConsume({
        traceId: resolved.traceId,
        identity: {
          tenantId:
            (resolved.meta?.["tenantId"] as string | undefined) ?? undefined,
          userId:
            (resolved.meta?.["userId"] as string | undefined) ?? undefined,
          provider: "google",
          model: resolved.model.model,
        },
        units: 1,
      });

      this.telemetry.stageCompleted({
        name: "trust.ratelimit.decided",
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        stage: "trust_gate",
        reason: rl.allowed ? "OK" : "RATE_LIMIT",
        meta: { allowed: rl.allowed, retryAtMs: rl.retryAtMs },
      });

      if (!rl.allowed) {
        // Caller maps to bank fallback
        throw new Error("LLM_PROVIDER_RATE_LIMIT");
      }
    }

    const startMs = Date.now();

    try {
      const out = await this.client.stream({
        req: resolved,
        sink,
        config,
        hooks: {
          onFirstToken: (state) => {
            this.telemetry.stageCompleted({
              name: "llm.stream.first_token",
              traceId: resolved.traceId,
              turnId: resolved.turnId,
              stage: "stream",
              reason: "OK",
              meta: {
                firstTokenMs: state.firstTokenAtMs
                  ? state.firstTokenAtMs - startMs
                  : undefined,
              },
            });
          },
          onFinal: (final) => {
            this.telemetry.stageCompleted({
              name: "llm.stream.completed",
              traceId: resolved.traceId,
              turnId: resolved.turnId,
              stage: "stream",
              reason: "OK",
              meta: {
                durationMs: Date.now() - startMs,
                textLen: final.text?.length ?? 0,
              },
            });
          },
          onAbort: () => {
            this.telemetry.stageCompleted({
              name: "llm.stream.aborted",
              traceId: resolved.traceId,
              turnId: resolved.turnId,
              stage: "stream",
              reason: "ABORTED",
            });
          },
          onError: (err) => {
            this.telemetry.requestFailed({
              traceId: resolved.traceId,
              turnId: resolved.turnId,
              reason: this.mapErrorToTelemetryReason(err),
              meta: { code: err.code },
            });
          },
        },
      });

      // Stream response timing
      this.telemetry.stageCompleted({
        name: "llm.request.completed",
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        stage: "stream",
        reason: "OK",
        meta: { durationMs: Date.now() - startMs },
      });

      return out;
    } catch (e) {
      this.telemetry.requestFailed({
        traceId: resolved.traceId,
        turnId: resolved.turnId,
        reason: this.mapErrorToTelemetryReason(e),
        meta: { err: safeErrorString(e) },
      });
      throw e;
    }
  }

  /* ----------------------- internal: model selection ----------------------- */

  private resolveModel(req: LLMRequest): LLMRequest {
    const wantsGoogle =
      req.model.provider === "google" ||
      !this.gatewayCfg.strictModelEnforcement;
    if (!wantsGoogle) return req;

    const purpose = req.purpose ?? "other";

    // Prefer Flash for configured purposes
    const preferFlash = this.gatewayCfg.flashPurposes.includes(purpose);

    const selectedModel = preferFlash
      ? this.gatewayCfg.models.gemini3Flash
      : this.gatewayCfg.models.gemini3;

    // If caller already specified a model, respect it unless strict enforcement says otherwise.
    const incoming = req.model.model;
    const finalModel = incoming?.trim() ? incoming : selectedModel;

    return {
      ...req,
      model: {
        provider: "google",
        model: finalModel,
      },
    };
  }

  private buildCompleteCacheKey(req: LLMRequest): string {
    const parts: CacheKeyParts = {
      namespace: "llm_complete",
      tenantId: (req.meta?.["tenantId"] as string | undefined) ?? undefined,
      conversationId:
        (req.meta?.["conversationId"] as string | undefined) ?? undefined,
      turnId: req.turnId,
      docLock: req.meta?.["docLockEnabled"]
        ? {
            enabled: true,
            docId: req.meta?.["lockedDocId"] as string | undefined,
            filename: req.meta?.["lockedFilename"] as string | undefined,
          }
        : { enabled: false },
      model: { provider: req.model.provider, name: req.model.model },
      version: "v1",
      payload: {
        purpose: req.purpose ?? "other",
        messages: sanitizeMessagesForCache(req),
        sampling: req.sampling ?? null,
        toolsEnabled: req.tools?.enabled ?? false,
        // We avoid caching full tool schemas; upstream should keep them stable anyway.
        toolNames: req.tools?.registry?.tools?.map((t) => t.name) ?? [],
      },
    };

    return this.cache.buildKey(parts);
  }

  /* ----------------------- internal: telemetry reason mapping ----------------------- */

  private mapErrorToTelemetryReason(e: unknown): TelemetryReasonCode {
    const s = safeErrorString(e).toLowerCase();

    if (s.includes("rate_limit")) return "RATE_LIMIT";
    if (s.includes("timeout") || s.includes("abort")) return "TIMEOUT";
    if (s.includes("auth")) return "AUTH";
    if (s.includes("network")) return "NETWORK";
    if (s.includes("bad_request") || s.includes("http_error"))
      return "BAD_REQUEST";

    return "UNKNOWN";
  }
}

/* ----------------------- helpers ----------------------- */

function safeErrorString(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Cache safety: do not store raw content by default unless your policy allows it.
 * Here we store role + length + hashes only, to keep cache deterministic without content leakage.
 * If you need full caching for speed, do it behind an explicit config flag and privacy bank.
 */
function sanitizeMessagesForCache(
  req: LLMRequest,
): Array<{ role: string; len: number }> {
  return req.messages.map((m) => ({
    role: m.role,
    len: (m.content ?? "").length,
  }));
}
