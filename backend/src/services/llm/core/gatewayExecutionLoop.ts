import type {
  LLMClient,
  LLMCompletionResponse,
  LLMRequest,
  LLMStreamResponse,
} from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type { LLMStreamingConfig, StreamSink } from "./llmStreaming.types";

import { toCostFamilyModel } from "./llmCostCalculator";

type GatewayExecutionAttempt = {
  provider: LLMProvider;
  model: string;
  status: "ok" | "fail";
  durationMs: number;
  errorCode?: string | null;
};

type RouteLike = {
  provider: string;
  model: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function buildAttemptRequest(
  request: LLMRequest,
  candidate: { provider: LLMProvider; model: string },
  idx: number,
): LLMRequest {
  const baseMeta = asRecord(request.meta);
  const routeMeta = asRecord(baseMeta.route);
  const attemptModelFamily =
    toCostFamilyModel(String(candidate.model)) || String(candidate.model);

  return {
    ...request,
    model: {
      provider: candidate.provider,
      model: candidate.model,
    },
    meta: {
      ...baseMeta,
      routeLane:
        asStringOrNull(baseMeta.routeLane) ?? asStringOrNull(routeMeta.lane),
      qualityReason:
        asStringOrNull(baseMeta.qualityReason) ??
        asStringOrNull(routeMeta.qualityReason),
      policyRuleId:
        asStringOrNull(baseMeta.policyRuleId) ??
        asStringOrNull(routeMeta.policyRuleId),
      modelFamily: attemptModelFamily,
      pinnedModel: String(candidate.model),
      fallbackRank: idx,
      fallbackPolicyRuleId: idx > 0 ? "provider_fallbacks" : null,
    },
  };
}

export async function executeCompletionWithFallback(args: {
  route: RouteLike;
  request: LLMRequest;
  buildAttemptOrder: (route: RouteLike) => Array<{ provider: LLMProvider; model: string }>;
  resolveClient: (provider: LLMProvider) => LLMClient | null;
  toErrorCode: (err: unknown) => string;
}): Promise<{
  response: LLMCompletionResponse;
  attempts: GatewayExecutionAttempt[];
  routed: { provider: LLMProvider; model: string };
  executed: { provider: LLMProvider; model: string };
  fallbackUsed: boolean;
}> {
  const routed = {
    provider: args.route.provider as LLMProvider,
    model: args.route.model,
  };
  const attempts: GatewayExecutionAttempt[] = [];
  const order = args.buildAttemptOrder(args.route);
  let lastError: unknown = null;

  for (let idx = 0; idx < order.length; idx++) {
    const candidate = order[idx]!;
    const client = args.resolveClient(candidate.provider);
    if (!client) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "fail",
        durationMs: 0,
        errorCode: "LLM_CLIENT_NOT_CONFIGURED",
      });
      continue;
    }

    const startedAtMs = Date.now();
    try {
      const response = await client.complete(
        buildAttemptRequest(args.request, candidate, idx),
      );
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "ok",
        durationMs: Date.now() - startedAtMs,
        errorCode: null,
      });
      return {
        response,
        attempts,
        routed,
        executed: candidate,
        fallbackUsed:
          candidate.provider !== routed.provider || candidate.model !== routed.model,
      };
    } catch (err) {
      lastError = err;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "fail",
        durationMs: Date.now() - startedAtMs,
        errorCode: args.toErrorCode(err),
      });
    }
  }

  if (lastError) throw lastError;
  throw new Error("LLM_CLIENT_NOT_CONFIGURED");
}

export async function executeStreamWithFallback(args: {
  route: RouteLike;
  request: LLMRequest;
  sink: StreamSink;
  streamingConfig: LLMStreamingConfig;
  buildAttemptOrder: (route: RouteLike) => Array<{ provider: LLMProvider; model: string }>;
  resolveClient: (provider: LLMProvider) => LLMClient | null;
  toErrorCode: (err: unknown) => string;
}): Promise<{
  response: LLMStreamResponse;
  attempts: GatewayExecutionAttempt[];
  routed: { provider: LLMProvider; model: string };
  executed: { provider: LLMProvider; model: string };
  fallbackUsed: boolean;
}> {
  const routed = {
    provider: args.route.provider as LLMProvider,
    model: args.route.model,
  };
  const attempts: GatewayExecutionAttempt[] = [];
  const order = args.buildAttemptOrder(args.route);
  let lastError: unknown = null;

  for (let idx = 0; idx < order.length; idx++) {
    const candidate = order[idx]!;
    const client = args.resolveClient(candidate.provider);
    if (!client) {
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "fail",
        durationMs: 0,
        errorCode: "LLM_CLIENT_NOT_CONFIGURED",
      });
      continue;
    }

    let wroteEvents = 0;
    let closeRequested = false;
    const retryableSink: StreamSink = {
      transport: args.sink.transport,
      write(event) {
        wroteEvents += 1;
        args.sink.write(event);
      },
      flush: args.sink.flush ? () => args.sink.flush!() : undefined,
      close() {
        closeRequested = true;
      },
      isOpen() {
        return args.sink.isOpen();
      },
    };

    const startedAtMs = Date.now();
    try {
      const response = await client.stream({
        req: buildAttemptRequest(args.request, candidate, idx),
        sink: retryableSink,
        config: args.streamingConfig,
      });
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "ok",
        durationMs: Date.now() - startedAtMs,
        errorCode: null,
      });
      if (closeRequested && args.sink.isOpen()) args.sink.close();
      return {
        response,
        attempts,
        routed,
        executed: candidate,
        fallbackUsed:
          candidate.provider !== routed.provider || candidate.model !== routed.model,
      };
    } catch (err) {
      lastError = err;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        status: "fail",
        durationMs: Date.now() - startedAtMs,
        errorCode: args.toErrorCode(err),
      });
      if (wroteEvents > 0 || closeRequested) throw err;
    }
  }

  if (lastError) throw lastError;
  throw new Error("LLM_CLIENT_NOT_CONFIGURED");
}
