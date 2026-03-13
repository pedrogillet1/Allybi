import type { LLMClient } from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type { LLMStreamingConfig, StreamSink } from "./llmStreaming.types";
import type { LlmRoutePlan } from "../types/llm.types";

import { LlmRouterService } from "./llmRouter.service";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import {
  LlmRequestBuilderService,
  type EvidencePackLike,
} from "./llmRequestBuilder.service";
import { getAnswerModeRouterService } from "../../config/answerModeRouter.service";
import {
  checkBudget,
  recordUsage,
  TokenBudgetExceededError,
} from "./tokenBudgetLimiter.service";
import {
  computeCostUsd,
  toCostFamilyModel,
  type CostTable,
} from "./llmCostCalculator";
import { canonicalizeToLlmProvider } from "./providerNormalization";
import {
  buildComposeCacheKey,
  getSharedComposedFragmentCache,
} from "./gatewayPromptCache";
import {
  executeCompletionWithFallback,
  executeStreamWithFallback,
} from "./gatewayExecutionLoop";
import {
  prepareProviderRequest,
  type GatewayPromptTrace,
} from "./gatewayRequestPreparation";

export { clearGatewayCaches } from "./gatewayPromptCache";

export type GatewayChatRole = "system" | "user" | "assistant";

export interface LlmGatewayConfig {
  env: "production" | "staging" | "dev" | "local";
  provider: LLMProvider;
  modelId: string;
  defaultTemperature?: number;
  defaultMaxOutputTokens?: number;
}

export interface LlmGatewayRequest {
  traceId: string;
  userId: string;
  conversationId: string;
  messages: Array<{
    role: GatewayChatRole;
    content: string;
    attachments?: unknown | null;
  }>;
  evidencePack?: EvidencePackLike | null;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface GatewayClientResolver {
  resolve(provider: LLMProvider): LLMClient | null;
}

interface GatewayExecutionAttempt {
  provider: LLMProvider;
  model: string;
  status: "ok" | "fail";
  durationMs: number;
  errorCode?: string | null;
}

function mapProviderForRequest(provider: LLMProvider): LLMProvider {
  return canonicalizeToLlmProvider(provider);
}


export class LlmGatewayService {
  private readonly answerModeRouter: ReturnType<typeof getAnswerModeRouterService>;
  private readonly clientResolver?: GatewayClientResolver;

  constructor(
    private readonly llmClient: LLMClient,
    private readonly router: LlmRouterService,
    private readonly builder: LlmRequestBuilderService,
    private readonly cfg: LlmGatewayConfig,
    answerModeRouterOrResolver:
      | ReturnType<typeof getAnswerModeRouterService>
      | GatewayClientResolver = getAnswerModeRouterService(),
    maybeResolver?: GatewayClientResolver,
  ) {
    if (LlmGatewayService.isClientResolver(answerModeRouterOrResolver)) {
      this.answerModeRouter = getAnswerModeRouterService();
      this.clientResolver = answerModeRouterOrResolver;
    } else {
      this.answerModeRouter = answerModeRouterOrResolver;
      this.clientResolver = maybeResolver;
    }
  }

  private static isClientResolver(
    value:
      | ReturnType<typeof getAnswerModeRouterService>
      | GatewayClientResolver,
  ): value is GatewayClientResolver {
    return (
      !!value &&
      typeof value === "object" &&
      typeof (value as GatewayClientResolver).resolve === "function"
    );
  }

  private static resolveFallbackRank(
    attempts: GatewayExecutionAttempt[],
    executed: { provider: LLMProvider; model: string },
  ): number | null {
    if (!Array.isArray(attempts) || attempts.length < 1) return null;
    const idx = attempts.findIndex(
      (attempt) =>
        attempt.status === "ok" &&
        attempt.provider === executed.provider &&
        attempt.model === executed.model,
    );
    return idx >= 0 ? idx : null;
  }

  async generate(params: LlmGatewayRequest): Promise<{
    text: string;
    telemetry?: Record<string, unknown>;
    promptTrace: GatewayPromptTrace;
  }> {
    const prepared = prepareProviderRequest({
      params,
      streaming: false,
      env: this.cfg.env,
      modelId: this.cfg.modelId,
      defaultTemperature: this.cfg.defaultTemperature,
      router: this.router,
      builder: this.builder,
      answerModeRouter: this.answerModeRouter,
    });
    const routedProvider = prepared.request.model.provider;
    const routedModel = prepared.request.model.model;
    const composeCacheEnabled =
      process.env.BANK_MULTI_LEVEL_CACHE_ENABLED === "true" &&
      process.env.BANK_COMPOSE_CACHE_ENABLED !== "false";
    const composeCacheKey =
      composeCacheEnabled && prepared.promptMode === "compose"
        ? buildComposeCacheKey(params.evidencePack || null, prepared)
        : null;
    if (composeCacheKey) {
      const cached = getSharedComposedFragmentCache().get(composeCacheKey);
      if (cached) {
        const modelFamily = toCostFamilyModel(String(routedModel)) || String(routedModel);
        return {
          text: cached.text,
          telemetry: {
            ...(cached.telemetry || {}),
            provider: routedProvider,
            model: routedModel,
            modelFamily,
            pinnedModel: routedModel,
            routedProvider,
            routedModel,
            executedProvider: routedProvider,
            executedModel: routedModel,
            fallbackUsed: false,
            fallbackRank: 0,
            fallbackPolicyRuleId: null,
            routeLane: prepared.route.lane ?? null,
            qualityReason: prepared.route.qualityReason ?? null,
            policyRuleId: prepared.route.policyRuleId ?? null,
            attemptCount: 0,
            attempts: [],
            finishReason: "cache_hit",
            promptType: prepared.promptType,
            requestedMaxOutputTokens:
              prepared.request.sampling?.maxOutputTokens ?? null,
            cacheHit: true,
            ...cached.promptTrace,
          },
          promptTrace: cached.promptTrace,
        };
      }
    }
    // Token budget check (fail-open if bank not loaded)
    const userId = (params.meta?.userId as string) || params.userId || "system";
    const estimatedInputTokens = Math.ceil(
      prepared.request.messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0) / 4,
    );
    const budgetCheck = checkBudget(userId, estimatedInputTokens);
    if (!budgetCheck.allowed) {
      throw new TokenBudgetExceededError(userId, budgetCheck.window);
    }

    const execution = await executeCompletionWithFallback({
      route: prepared.route,
      request: prepared.request,
      buildAttemptOrder: (route) => this.buildAttemptOrder(route as LlmRoutePlan),
      resolveClient: (provider) => this.resolveClient(provider),
      toErrorCode: (err) => LlmGatewayService.toErrorCode(err),
    });
    const response = execution.response;
    const modelFamily =
      toCostFamilyModel(String(execution.executed.model)) ||
      String(execution.executed.model);
    const fallbackRank = LlmGatewayService.resolveFallbackRank(
      execution.attempts,
      execution.executed,
    );

    // Record actual usage after success
    const actualCost = computeCostUsd(
      String(execution.executed.provider),
      String(execution.executed.model),
      response.usage?.promptTokens,
      response.usage?.completionTokens,
      getOptionalBank<CostTable>("llm_cost_table"),
    );
    recordUsage(
      userId,
      response.usage?.promptTokens ?? 0,
      response.usage?.completionTokens ?? 0,
      actualCost,
    );

    const telemetry = {
      provider: execution.executed.provider,
      model: execution.executed.model,
      modelFamily,
      pinnedModel: execution.executed.model,
      routedProvider: execution.routed.provider,
      routedModel: execution.routed.model,
      executedProvider: execution.executed.provider,
      executedModel: execution.executed.model,
      fallbackUsed: execution.fallbackUsed,
      fallbackRank,
      fallbackPolicyRuleId: execution.fallbackUsed ? "provider_fallbacks" : null,
      routeLane: prepared.route.lane ?? null,
      qualityReason: prepared.route.qualityReason ?? null,
      policyRuleId: prepared.route.policyRuleId ?? null,
      attemptCount: execution.attempts.length,
      attempts: execution.attempts,
      finishReason: response.finishReason || "unknown",
      usage: response.usage,
      costUsd: actualCost || null,
      promptType: prepared.promptType,
      requestedMaxOutputTokens:
        prepared.request.sampling?.maxOutputTokens ?? null,
      cacheHit: false,
      ...prepared.promptTrace,
    };
    if (composeCacheKey && !execution.fallbackUsed) {
      getSharedComposedFragmentCache().set(composeCacheKey, {
        text: response.content,
        telemetry,
        promptTrace: prepared.promptTrace,
      });
    }

    return {
      text: response.content,
      telemetry,
      promptTrace: prepared.promptTrace,
    };
  }

  async generateRetrievalPlan(params: LlmGatewayRequest): Promise<{
    text: string;
    telemetry?: Record<string, unknown>;
    promptTrace: GatewayPromptTrace;
  }> {
    const enriched: LlmGatewayRequest = {
      ...params,
      meta: {
        ...(params.meta || {}),
        purpose: "retrieval_planning",
        promptMode: "retrieval_plan",
      },
    };
    const prepared = prepareProviderRequest({
      params: enriched,
      streaming: false,
      env: this.cfg.env,
      modelId: this.cfg.modelId,
      defaultTemperature: this.cfg.defaultTemperature,
      router: this.router,
      builder: this.builder,
      answerModeRouter: this.answerModeRouter,
    });
    const execution = await executeCompletionWithFallback({
      route: prepared.route,
      request: prepared.request,
      buildAttemptOrder: (route) => this.buildAttemptOrder(route as LlmRoutePlan),
      resolveClient: (provider) => this.resolveClient(provider),
      toErrorCode: (err) => LlmGatewayService.toErrorCode(err),
    });
    const response = execution.response;
    const modelFamily =
      toCostFamilyModel(String(execution.executed.model)) ||
      String(execution.executed.model);
    const fallbackRank = LlmGatewayService.resolveFallbackRank(
      execution.attempts,
      execution.executed,
    );

    return {
      text: response.content,
      telemetry: {
        provider: execution.executed.provider,
        model: execution.executed.model,
        modelFamily,
        pinnedModel: execution.executed.model,
        routedProvider: execution.routed.provider,
        routedModel: execution.routed.model,
        executedProvider: execution.executed.provider,
        executedModel: execution.executed.model,
        fallbackUsed: execution.fallbackUsed,
        fallbackRank,
        fallbackPolicyRuleId: execution.fallbackUsed ? "provider_fallbacks" : null,
        routeLane: prepared.route.lane ?? null,
        qualityReason: prepared.route.qualityReason ?? null,
        policyRuleId: prepared.route.policyRuleId ?? null,
        attemptCount: execution.attempts.length,
        attempts: execution.attempts,
        finishReason: response.finishReason || "unknown",
        usage: response.usage,
        promptType: prepared.promptType,
        requestedMaxOutputTokens:
          prepared.request.sampling?.maxOutputTokens ?? null,
        ...prepared.promptTrace,
      },
      promptTrace: prepared.promptTrace,
    };
  }

  async stream(
    params: LlmGatewayRequest & {
      sink: StreamSink;
      streamingConfig: LLMStreamingConfig;
    },
  ): Promise<{
    finalText: string;
    telemetry?: Record<string, unknown>;
    promptTrace: GatewayPromptTrace;
  }> {
    const prepared = prepareProviderRequest({
      params,
      streaming: true,
      env: this.cfg.env,
      modelId: this.cfg.modelId,
      defaultTemperature: this.cfg.defaultTemperature,
      router: this.router,
      builder: this.builder,
      answerModeRouter: this.answerModeRouter,
    });
    const execution = await executeStreamWithFallback({
      route: prepared.route,
      request: prepared.request,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
      buildAttemptOrder: (route) => this.buildAttemptOrder(route as LlmRoutePlan),
      resolveClient: (provider) => this.resolveClient(provider),
      toErrorCode: (err) => LlmGatewayService.toErrorCode(err),
    });
    const result = execution.response;
    const modelFamily =
      toCostFamilyModel(String(execution.executed.model)) ||
      String(execution.executed.model);
    const fallbackRank = LlmGatewayService.resolveFallbackRank(
      execution.attempts,
      execution.executed,
    );

    return {
      finalText: result.finalText,
      telemetry: {
        provider: execution.executed.provider,
        model: execution.executed.model,
        modelFamily,
        pinnedModel: execution.executed.model,
        routedProvider: execution.routed.provider,
        routedModel: execution.routed.model,
        executedProvider: execution.executed.provider,
        executedModel: execution.executed.model,
        fallbackUsed: execution.fallbackUsed,
        fallbackRank,
        fallbackPolicyRuleId: execution.fallbackUsed ? "provider_fallbacks" : null,
        routeLane: prepared.route.lane ?? null,
        qualityReason: prepared.route.qualityReason ?? null,
        policyRuleId: prepared.route.policyRuleId ?? null,
        attemptCount: execution.attempts.length,
        attempts: execution.attempts,
        finishReason: result.finishReason || "unknown",
        usage: result.usage,
        promptType: prepared.promptType,
        requestedMaxOutputTokens:
          prepared.request.sampling?.maxOutputTokens ?? null,
        ...prepared.promptTrace,
      },
      promptTrace: prepared.promptTrace,
    };
  }

  private resolveClient(provider: LLMProvider): LLMClient | null {
    const normalized = mapProviderForRequest(provider);
    if (normalized === this.llmClient.provider) return this.llmClient;
    return this.clientResolver?.resolve(normalized) ?? null;
  }

  private buildAttemptOrder(
    route: LlmRoutePlan,
  ): Array<{ provider: LLMProvider; model: string }> {
    const order: Array<{ provider: LLMProvider; model: string }> = [
      {
        provider: mapProviderForRequest(route.provider as LLMProvider),
        model: route.model,
      },
    ];

    const fallbackTargets =
      typeof (this.router as { listFallbackTargets?: unknown })
        .listFallbackTargets === "function"
        ? (
            this.router as {
              listFallbackTargets: (input: {
                primary: {
                  provider: string;
                  model: string;
                  stage: "draft" | "final";
                };
                requireStreaming?: boolean;
                allowTools?: boolean;
              }) => Array<{ provider: string; model: string }>;
            }
          ).listFallbackTargets({
            primary: {
              provider: route.provider,
              model: route.model,
              stage: route.stage === "draft" ? "draft" : "final",
            },
            requireStreaming: route.constraints?.requireStreaming,
            allowTools: route.constraints?.disallowTools !== true,
          })
        : [];

    for (const t of fallbackTargets) {
      order.push({
        provider: mapProviderForRequest(t.provider as LLMProvider),
        model: t.model,
      });
    }

    const deduped: Array<{ provider: LLMProvider; model: string }> = [];
    const seen = new Set<string>();
    for (const item of order) {
      const key = `${item.provider}:${item.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }

  private static toErrorCode(err: unknown): string {
    if (err && typeof err === "object") {
      const code = (err as Record<string, unknown>).code;
      if (typeof code === "string" && code.trim()) return code.trim();
      const message = (err as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) {
        return message.trim().slice(0, 120);
      }
    }
    return "LLM_GENERATION_FAILED";
  }

}

export default LlmGatewayService;
