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
import { computeCostUsd, type CostTable } from "./llmCostCalculator";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { canonicalizeProviderWithUnknown } from "./providerNormalization";

let costTableCache: CostTable | null | undefined;
function getCostTable(): CostTable | null {
  if (costTableCache !== undefined) return costTableCache;
  costTableCache = getOptionalBank<CostTable>("llm_cost_table") ?? null;
  return costTableCache;
}

function mapProvider(p: LLMProvider): LLMProviderKey {
  return canonicalizeProviderWithUnknown(p);
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function asNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => item != null);
}

function buildModelCallMeta(rawMeta: unknown): Record<string, unknown> | null {
  const meta = asRecord(rawMeta);
  const route = asRecord(meta.route);
  const routingDecision = asRecord(meta.routingDecision);
  const followupReasons = asStringArray(routingDecision.followupReasonCodes);
  const followupReasonCodes = followupReasons.length > 0
    ? followupReasons.join(",")
    : null;
  const followupDegraded = followupReasons.some((reason) =>
    reason.startsWith("followup_overlay_patterns_missing"),
  )
    ? true
    : null;
  const eventMeta: Record<string, unknown> = {
    promptType: asString(meta.promptType),
    routeLane: asString(meta.routeLane) ?? asString(route.lane),
    qualityReason:
      asString(meta.qualityReason) ?? asString(route.qualityReason),
    policyRuleId: asString(meta.policyRuleId) ?? asString(route.policyRuleId),
    modelFamily: asString(meta.modelFamily) ?? asString(route.modelFamily),
    pinnedModel: asString(meta.pinnedModel),
    fallbackRank: asNumber(meta.fallbackRank),
    fallbackPolicyRuleId: asString(meta.fallbackPolicyRuleId),
    routedProvider: asString(route.provider),
    routedModel: asString(route.model),
    routingIntentFamily:
      asString(routingDecision.intentFamily) ?? asString(meta.intentFamily),
    routingOperator: asString(routingDecision.operator) ?? asString(meta.operator),
    routingRoute: asString(routingDecision.route),
    routingLocale: asString(routingDecision.locale),
    routingFollowupSource: asString(routingDecision.followupSource),
    routingFollowupReasonCodes: followupReasonCodes,
    routingFollowupDegraded: followupDegraded,
  };

  const normalized = Object.fromEntries(
    Object.entries(eventMeta).filter(([, value]) => value !== null),
  );
  return Object.keys(normalized).length > 0 ? normalized : null;
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
      const requestedProvider = req.model.provider;
      const requestedModel = req.model.model;
      const executedProvider = response?.executedModel?.provider || requestedProvider;
      const executedModel = response?.executedModel?.model || requestedModel;
      const baseMeta = buildModelCallMeta(req.meta) || {};
      this.telemetry.logModelCall({
        userId: (req.meta?.userId as string) || "system",
        traceId: req.traceId,
        turnId: req.turnId || null,
        provider: mapProvider(executedProvider),
        model: executedModel,
        stage: mapStage(req.purpose),
        status: errorCode ? "fail" : "ok",
        errorCode: errorCode || null,
        promptTokens: response?.usage?.promptTokens ?? null,
        completionTokens: response?.usage?.completionTokens ?? null,
        totalTokens: response?.usage?.totalTokens ?? null,
        firstTokenMs: null,
        durationMs,
        retries: (response as Record<string, unknown> | undefined)?.__retryAttempts as number ?? null,
        costUsd: computeCostUsd(
          mapProvider(executedProvider),
          executedModel,
          response?.usage?.promptTokens,
          response?.usage?.completionTokens,
          getCostTable(),
        ) || null,
        at: new Date(),
        meta: {
          ...baseMeta,
          requestedProvider,
          requestedModel,
          executedProvider,
          executedModel,
        },
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
      const requestedProvider = params.req.model.provider;
      const requestedModel = params.req.model.model;
      const executedProvider =
        response?.executedModel?.provider || requestedProvider;
      const executedModel = response?.executedModel?.model || requestedModel;
      const baseMeta = buildModelCallMeta(params.req.meta) || {};
      this.telemetry.logModelCall({
        userId: (params.req.meta?.userId as string) || "system",
        traceId: params.req.traceId,
        turnId: params.req.turnId || null,
        provider: mapProvider(executedProvider),
        model: executedModel,
        stage: mapStage(params.req.purpose),
        status: errorCode ? "fail" : "ok",
        errorCode: errorCode || null,
        promptTokens: response?.usage?.promptTokens ?? null,
        completionTokens: response?.usage?.completionTokens ?? null,
        totalTokens: response?.usage?.totalTokens ?? null,
        firstTokenMs,
        durationMs,
        retries: (response as Record<string, unknown> | undefined)?.__retryAttempts as number ?? null,
        costUsd: computeCostUsd(
          mapProvider(executedProvider),
          executedModel,
          response?.usage?.promptTokens,
          response?.usage?.completionTokens,
          getCostTable(),
        ) || null,
        at: new Date(),
        meta: {
          ...baseMeta,
          requestedProvider,
          requestedModel,
          executedProvider,
          executedModel,
        },
      });
    }
  }

  normalizeToolCalls?(raw: unknown) {
    return this.inner.normalizeToolCalls?.(raw) ?? [];
  }
}
