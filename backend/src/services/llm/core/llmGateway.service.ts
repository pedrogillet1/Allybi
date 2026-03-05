import { createHash } from "crypto";
import type {
  LLMClient,
  LLMCompletionResponse,
  LLMStreamResponse,
  LLMModelSpec,
  LLMMessage,
  LLMRequest,
} from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type { LLMStreamingConfig, StreamSink } from "./llmStreaming.types";
import type { LlmRoutePlan } from "../types/llm.types";

import type { LangCode } from "../prompts/promptRegistry.service";
import { LlmRouterService } from "./llmRouter.service";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { RuntimePolicyError } from "../../../modules/chat/runtime/runtimePolicyError";
import {
  LlmRequestBuilderService,
  type BuildRequestInput,
  type EvidencePackLike,
  type MemoryPackLike,
} from "./llmRequestBuilder.service";
import { getProductHelpService } from "../../chat/productHelp.service";
import { getAnswerModeRouterService } from "../../config/answerModeRouter.service";
import { BankRuntimeCache } from "../../core/cache/bankRuntimeCache.service";
import {
  checkBudget,
  recordUsage,
  TokenBudgetExceededError,
} from "./tokenBudgetLimiter.service";
import {
  computeCostUsd,
  estimateCostUsd,
  toCostFamilyModel,
  type CostTable,
} from "./llmCostCalculator";
import { canonicalizeToLlmProvider } from "./providerNormalization";

export type GatewayChatRole = "system" | "user" | "assistant";

export interface GatewayPromptTrace {
  promptIds: string[];
  promptVersions: string[];
  promptHashes: string[];
  promptTemplateIds: string[];
}

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

interface PreparedGatewayRequest {
  route: LlmRoutePlan;
  request: LLMRequest;
  promptType: string;
  promptTrace: GatewayPromptTrace;
  outputLanguage: LangCode;
  promptMode: "compose" | "retrieval_plan";
  userText: string;
}

interface GatewayClientResolver {
  resolve(provider: LLMProvider): LLMClient | null;
}

export interface GatewayExecutionAttempt {
  provider: LLMProvider;
  model: string;
  status: "ok" | "fail";
  durationMs: number;
  errorCode?: string | null;
}

export class FallbackExhaustedError extends Error {
  readonly code = "LLM_ALL_FALLBACKS_EXHAUSTED";
  constructor(
    public readonly attempts: GatewayExecutionAttempt[],
    public readonly cause: unknown,
  ) {
    super(
      `All LLM providers exhausted after ${attempts.length} attempt(s): ` +
      attempts.map(a => `${a.provider}:${a.model}=${a.status}`).join(", "),
    );
    this.name = "FallbackExhaustedError";
  }
}

type GatewayDisambiguation = {
  active: boolean;
  candidateType: "document" | "sheet" | "operator";
  options: Array<{ id: string; label: string; score?: number }>;
  maxOptions: number;
  maxQuestions: number;
};

type MemoryPolicyRuntimeTuning = {
  gateway?: {
    userTextCharCap?: number;
    systemBlockCharCap?: number;
    dialogueTurnLimit?: number;
    dialogueMessageCharCap?: number;
    dialogueCharBudget?: number;
    memoryPackCharCap?: number;
  };
};

function mapProviderForRequest(provider: LLMProvider): LLMProvider {
  return canonicalizeToLlmProvider(provider);
}

function mapPurpose(promptType: string): LLMRequest["purpose"] {
  if (promptType === "retrieval") return "retrieval_planning";
  if (promptType === "disambiguation") return "intent_routing";
  if (promptType === "tool") return "validation_pass";
  return "answer_compose";
}

type ComposedCacheEntry = {
  text: string;
  telemetry?: Record<string, unknown>;
  promptTrace: GatewayPromptTrace;
};

let _composedFragmentCache: BankRuntimeCache<ComposedCacheEntry> | null = null;

function getSharedComposedFragmentCache(): BankRuntimeCache<ComposedCacheEntry> {
  if (!_composedFragmentCache) {
    _composedFragmentCache = new BankRuntimeCache<ComposedCacheEntry>({
      maxEntries: Number(process.env.BANK_COMPOSE_CACHE_MAX || 600),
      ttlMs: Number(process.env.BANK_COMPOSE_CACHE_TTL_MS || 5 * 60 * 1000),
    });
  }
  return _composedFragmentCache;
}

/** Clear gateway caches (for test teardown). */
export function clearGatewayCaches(): void {
  _composedFragmentCache = null;
}

/**
 * Invalidate composed fragment cache entries.
 * Call this when document content changes to prevent stale LLM responses.
 * Currently clears entire cache (keys are hashed, no reverse index by docId).
 */
export function invalidateComposedCache(_docId?: string): void {
  getSharedComposedFragmentCache().clear();
}

function clampText(input: string, maxChars: number): string {
  const v = String(input || "").trim();
  if (!v) return "";
  return v.length > maxChars ? `${v.slice(0, maxChars - 1)}…` : v;
}

function firstNonEmptyString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function asNormalizedCode(value: unknown): string | null {
  const text = String(value || "").trim();
  return text ? text.toLowerCase() : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter((entry) => entry.length > 0);
  }
  const one = String(value || "").trim();
  return one ? [one] : [];
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

function normalizePromptMode(value: unknown): "compose" | "retrieval_plan" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "retrieval_plan" ||
    normalized === "retrieval" ||
    normalized === "retrieval_planning"
  ) {
    return "retrieval_plan";
  }
  return "compose";
}

let machineJsonPromptTaskCache: Set<string> | null | undefined;

function isMachineJsonTemplate(template: Record<string, unknown>): boolean {
  const outputMode = String(template?.outputMode || "")
    .trim()
    .toLowerCase();
  return outputMode === "machine_json";
}

function collectMachineJsonTaskIdsFromBank(bank: Record<string, unknown> | null): Set<string> {
  const out = new Set<string>();
  const templates = Array.isArray(bank?.templates) ? (bank.templates as Array<Record<string, unknown>>) : [];
  for (const template of templates) {
    if (!isMachineJsonTemplate(template)) continue;
    const whenObj = template?.when as Record<string, unknown> | undefined;
    const operators = Array.isArray(whenObj?.operators)
      ? (whenObj.operators as unknown[])
      : [];
    for (const raw of operators) {
      const operatorId = String(raw || "")
        .trim()
        .toLowerCase();
      if (operatorId) out.add(operatorId);
    }
  }
  return out;
}

function getMachineJsonPromptTaskSet(): Set<string> {
  if (machineJsonPromptTaskCache !== undefined) {
    return machineJsonPromptTaskCache ?? new Set<string>();
  }

  try {
    const resolved = new Set<string>();
    const bankIds = ["task_plan_generation", "editing_task_prompts"];
    for (const bankId of bankIds) {
      const bank = getOptionalBank<Record<string, unknown>>(bankId);
      const ids = collectMachineJsonTaskIdsFromBank(bank);
      for (const id of ids) resolved.add(id);
    }
    machineJsonPromptTaskCache = resolved;
    return resolved;
  } catch {
    machineJsonPromptTaskCache = new Set<string>();
    return machineJsonPromptTaskCache;
  }
}

function isMachineJsonPromptTask(value: unknown): boolean {
  const taskId = String(value || "").trim().toLowerCase();
  if (!taskId) return false;
  return getMachineJsonPromptTaskSet().has(taskId);
}

function hashString(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asStringOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function hashEvidencePack(evidencePack: EvidencePackLike | null | undefined): string {
  if (!evidencePack || !Array.isArray(evidencePack.evidence)) return "none";
  const normalizedEvidence = evidencePack.evidence.map((item) => ({
    docId: String(item?.docId || "").trim(),
    locationKey: String(item?.locationKey || "").trim(),
    evidenceType: String(item?.evidenceType || "text").trim(),
    snippet: String(item?.snippet || "").trim(),
  }));
  const payload = {
    queryNormalized: String(evidencePack.query?.normalized || "").trim(),
    activeDocId: String(evidencePack.scope?.activeDocId || "").trim(),
    explicitDocLock: Boolean(evidencePack.scope?.explicitDocLock),
    evidence: normalizedEvidence,
  };
  return hashString(JSON.stringify(payload));
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

  private static resolveExecutedTarget(
    fallback: { provider: LLMProvider; model: string },
    response:
      | Pick<LLMCompletionResponse, "executedModel" | "model">
      | Pick<LLMStreamResponse, "executedModel" | "model">,
  ): { provider: LLMProvider; model: string } {
    const modelSpec: LLMModelSpec | undefined = response.executedModel || response.model;
    const provider = mapProviderForRequest(
      (modelSpec?.provider as LLMProvider) || fallback.provider,
    );
    const model = String(modelSpec?.model || fallback.model).trim() || fallback.model;
    return { provider, model };
  }

  async generate(params: LlmGatewayRequest): Promise<{
    text: string;
    telemetry?: Record<string, unknown>;
    promptTrace: GatewayPromptTrace;
  }> {
    const prepared = this.prepareProviderRequest(params, false);
    const routedProvider = prepared.request.model.provider;
    const routedModel = prepared.request.model.model;
    const composeCacheEnabled =
      process.env.BANK_MULTI_LEVEL_CACHE_ENABLED === "true" &&
      process.env.BANK_COMPOSE_CACHE_ENABLED !== "false";
    const composeCacheKey =
      composeCacheEnabled && prepared.promptMode === "compose"
        ? this.buildComposeCacheKey(params, prepared)
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
    const charLen = prepared.request.messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    const estimatedInputTokens = Math.max(1, Math.ceil(charLen / 3));
    const budgetCheck = checkBudget(userId, estimatedInputTokens);
    if (!budgetCheck.allowed) {
      throw new TokenBudgetExceededError(userId, budgetCheck.window);
    }

    const costWarningThreshold = Number(process.env.LLM_COST_WARNING_THRESHOLD_USD || "0");
    if (costWarningThreshold > 0) {
      const estCost = estimateCostUsd(
        String(prepared.route.provider),
        String(prepared.route.model),
        estimatedInputTokens,
        prepared.request.sampling?.maxOutputTokens ?? 1024,
        getOptionalBank<CostTable>("llm_cost_table"),
      );
      if (estCost > costWarningThreshold) {
        const warningPayload = JSON.stringify({
          estimatedCostUsd: estCost,
          threshold: costWarningThreshold,
          provider: prepared.route.provider,
          model: prepared.route.model,
        });
        process.emitWarning(`[LLM_COST_WARNING] ${warningPayload}`, {
          code: "LLM_COST_WARNING",
        });
      }
    }

    const execution = await this.completeWithFallback(
      prepared.route,
      prepared.request,
    );
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
      tokenEstimationMethod: "char_div_3",
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
    const prepared = this.prepareProviderRequest(enriched, false);
    const execution = await this.completeWithFallback(
      prepared.route,
      prepared.request,
    );
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
    const prepared = this.prepareProviderRequest(params, true);
    const execution = await this.streamWithFallback(
      prepared.route,
      prepared.request,
      params.sink,
      params.streamingConfig,
    );
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

  private async completeWithFallback(
    route: LlmRoutePlan,
    request: LLMRequest,
  ): Promise<{
    response: LLMCompletionResponse;
    attempts: GatewayExecutionAttempt[];
    routed: { provider: LLMProvider; model: string };
    executed: { provider: LLMProvider; model: string };
    fallbackUsed: boolean;
  }> {
    const routed = {
      provider: mapProviderForRequest(route.provider as LLMProvider),
      model: route.model,
    };
    const attempts: GatewayExecutionAttempt[] = [];
    const order = this.buildAttemptOrder(route);
    let lastError: unknown = null;

    for (let idx = 0; idx < order.length; idx++) {
      const candidate = order[idx] as { provider: LLMProvider; model: string };
      const client = this.resolveClient(candidate.provider);
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

      const baseMeta = asRecord(request.meta);
      const routeMeta = asRecord(baseMeta.route);
      const attemptModelFamily =
        toCostFamilyModel(String(candidate.model)) || String(candidate.model);

      const attemptRequest: LLMRequest = {
        ...request,
        model: {
          provider: candidate.provider,
          model: candidate.model,
        },
        meta: {
          ...baseMeta,
          routeLane:
            asStringOrNull(baseMeta.routeLane) ??
            asStringOrNull(routeMeta.lane),
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

      const startedAtMs = Date.now();
      try {
        const response = await client.complete(attemptRequest);
        const executed = LlmGatewayService.resolveExecutedTarget(
          candidate,
          response,
        );
        attempts.push({
          provider: executed.provider,
          model: executed.model,
          status: "ok",
          durationMs: Date.now() - startedAtMs,
          errorCode: null,
        });
        return {
          response,
          attempts,
          routed,
          executed,
          fallbackUsed: idx > 0,
        };
      } catch (err) {
        lastError = err;
        attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          status: "fail",
          durationMs: Date.now() - startedAtMs,
          errorCode: LlmGatewayService.toErrorCode(err),
        });
      }
    }

    if (lastError) throw new FallbackExhaustedError(attempts, lastError);
    throw new FallbackExhaustedError(attempts, new Error("LLM_CLIENT_NOT_CONFIGURED"));
  }

  private async streamWithFallback(
    route: LlmRoutePlan,
    request: LLMRequest,
    sink: StreamSink,
    streamingConfig: LLMStreamingConfig,
  ): Promise<{
    response: LLMStreamResponse;
    attempts: GatewayExecutionAttempt[];
    routed: { provider: LLMProvider; model: string };
    executed: { provider: LLMProvider; model: string };
    fallbackUsed: boolean;
  }> {
    const routed = {
      provider: mapProviderForRequest(route.provider as LLMProvider),
      model: route.model,
    };
    const attempts: GatewayExecutionAttempt[] = [];
    const order = this.buildAttemptOrder(route);
    let lastError: unknown = null;

    for (let idx = 0; idx < order.length; idx++) {
      const candidate = order[idx] as { provider: LLMProvider; model: string };
      const client = this.resolveClient(candidate.provider);
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

      const baseMeta = asRecord(request.meta);
      const routeMeta = asRecord(baseMeta.route);
      const attemptModelFamily =
        toCostFamilyModel(String(candidate.model)) || String(candidate.model);

      const attemptRequest: LLMRequest = {
        ...request,
        model: {
          provider: candidate.provider,
          model: candidate.model,
        },
        meta: {
          ...baseMeta,
          routeLane:
            asStringOrNull(baseMeta.routeLane) ??
            asStringOrNull(routeMeta.lane),
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

      let wroteVisibleEvents = 0;
      let closeRequested = false;
      const retryableSink: StreamSink = {
        transport: sink.transport,
        write(event) {
          const eventName = String((event as { event?: unknown })?.event || "");
          if (
            eventName === "delta" ||
            eventName === "marker" ||
            eventName === "worklog" ||
            eventName === "final" ||
            eventName === "abort" ||
            eventName === "error"
          ) {
            wroteVisibleEvents += 1;
          }
          sink.write(event);
        },
        flush: sink.flush ? () => sink.flush!() : undefined,
        close() {
          closeRequested = true;
        },
        isOpen() {
          return sink.isOpen();
        },
      };

      const startedAtMs = Date.now();
      try {
        const response = await client.stream({
          req: attemptRequest,
          sink: retryableSink,
          config: streamingConfig,
        });
        const executed = LlmGatewayService.resolveExecutedTarget(
          candidate,
          response,
        );
        attempts.push({
          provider: executed.provider,
          model: executed.model,
          status: "ok",
          durationMs: Date.now() - startedAtMs,
          errorCode: null,
        });
        if (closeRequested && sink.isOpen()) sink.close();
        return {
          response,
          attempts,
          routed,
          executed,
          fallbackUsed: idx > 0,
        };
      } catch (err) {
        lastError = err;
        attempts.push({
          provider: candidate.provider,
          model: candidate.model,
          status: "fail",
          durationMs: Date.now() - startedAtMs,
          errorCode: LlmGatewayService.toErrorCode(err),
        });

        // Only avoid retry once visible content/state was emitted (or close was requested).
        // Non-visible preamble events (start/progress/ping) are safe to retry.
        if (wroteVisibleEvents > 0 || closeRequested) {
          try {
            sink.write({
              event: "error",
              data: {
                code: "fallback_failed",
                message: `Stream failed after ${wroteVisibleEvents} visible event(s); partial output is unreliable`,
                t: Date.now(),
              },
            });
          } catch {
            // sink may already be closed
          }
          throw err;
        }
      }
    }

    if (lastError) throw new FallbackExhaustedError(attempts, lastError);
    throw new FallbackExhaustedError(attempts, new Error("LLM_CLIENT_NOT_CONFIGURED"));
  }

  private buildComposeCacheKey(
    params: LlmGatewayRequest,
    prepared: PreparedGatewayRequest,
  ): string | null {
    const templateId = String(prepared.promptTrace.promptTemplateIds?.[0] || "")
      .trim()
      .toLowerCase();
    if (!templateId) return null;

    const locale = String(prepared.outputLanguage || "en")
      .trim()
      .toLowerCase();
    const evidenceHash = hashEvidencePack(params.evidencePack || null);
    const userTextHash = hashString(String(prepared.userText || "").trim());
    const promptHashes = Array.from(
      new Set(
        (prepared.promptTrace.promptHashes || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const payload = {
      evidenceHash,
      templateId,
      locale,
      userTextHash,
      promptMode: prepared.promptMode,
      modelVersion: prepared.request.model.model,
      provider: prepared.request.model.provider,
      promptHashes,
      composeCacheVersion: "v1",
    };
    return `compose:${hashString(JSON.stringify(payload))}`;
  }

  private prepareProviderRequest(
    params: LlmGatewayRequest,
    streaming: boolean,
  ): PreparedGatewayRequest {
    const parsed = this.parseIncomingMessages(params);
    const routeStage: "draft" | "final" =
      parsed.promptMode === "retrieval_plan" ||
      parsed.answerMode === "nav_pills" ||
      parsed.answerMode === "help_steps"
        ? "draft"
        : "final";
    const routeReasonCodes = [
      ...(parsed.fallback?.reasonCode ? [parsed.fallback.reasonCode] : []),
      ...(parsed.semanticFlags || []),
    ];

    const preRouteCharLen = params.messages.reduce(
      (sum, m) => sum + (m.content?.length ?? 0),
      0,
    );
    const preRouteEstTokens = Math.max(1, Math.ceil(preRouteCharLen / 3));

    const route = this.router.route({
      env: this.cfg.env,
      stage: routeStage,
      answerMode: parsed.answerMode,
      intentFamily: parsed.intentFamily,
      operator: parsed.operator,
      operatorFamily: parsed.operatorFamily,
      reasonCodes: routeReasonCodes,
      requireStreaming: streaming,
      allowTools: false,
      estimatedInputTokens: preRouteEstTokens,
    });

    const promptTask =
      typeof params.meta?.promptTask === "string"
        ? String(params.meta.promptTask)
        : null;
    const productHelpService = getProductHelpService();
    const resolvedProductHelp = productHelpService.resolve({
      language: parsed.outputLanguage,
      explicitTopic: parsed.productHelpTopic,
      queryText: parsed.userText,
      answerMode: parsed.answerMode,
      operator: parsed.operator,
      intentFamily: parsed.intentFamily,
      fallbackReasonCode: parsed.fallback?.reasonCode ?? null,
    });
    const productHelpTopic =
      parsed.productHelpTopic || resolvedProductHelp?.topic || null;
    const productHelpSnippet =
      parsed.productHelpSnippet || resolvedProductHelp?.snippet || null;

    const buildInput: BuildRequestInput = {
      env: this.cfg.env,
      route,
      outputLanguage: parsed.outputLanguage,
      userText: parsed.userText,
      signals: {
        answerMode: parsed.answerMode,
        promptMode: parsed.promptMode ?? "compose",
        intentFamily: parsed.intentFamily,
        operator: parsed.operator,
        operatorFamily: parsed.operatorFamily,
        disallowJsonOutput:
          parsed.promptMode === "retrieval_plan" ||
          isMachineJsonPromptTask(promptTask)
            ? false
            : true,
        maxQuestions:
          typeof parsed.styleMaxQuestions === "number"
            ? parsed.styleMaxQuestions
            : 1,
        navType: parsed.navType,
        fallback: parsed.fallback,
        disambiguation: parsed.disambiguation,
        productHelpTopic,
        productHelpSnippet,
        styleProfile: parsed.styleProfile,
        styleMaxChars: parsed.styleMaxChars,
        userRequestedShort: parsed.userRequestedShort,
        boldingEnabled:
          typeof parsed.boldingEnabled === "boolean"
            ? parsed.boldingEnabled
            : undefined,
        retrievalPlanning: parsed.promptMode === "retrieval_plan",
        uiSurface: parsed.uiSurface ?? null,
        usedBy: parsed.usedBy ?? [],
        semanticFlags: parsed.semanticFlags ?? [],
      },
      evidencePack: params.evidencePack ?? parsed.evidencePack,
      memoryPack: parsed.memoryPack,
      toolContext: promptTask
        ? {
            toolName: promptTask,
            toolArgs: (params.meta?.promptTaskArgs as Record<string, unknown>) || {},
          }
        : undefined,
      options: {
        stream: streaming,
        temperature: this.cfg.defaultTemperature,
        // maxOutputTokens intentionally omitted — let the token budget
        // service compute the limit based on answerMode + complexity.
        // Passing a value here would override the budget as requestedOverride.
      },
    };

    const built = this.builder.build(buildInput);
    const kodaMeta = built.kodaMeta as Record<string, unknown> | undefined;
    const promptTraceObj = kodaMeta?.promptTrace as Record<string, unknown> | undefined;
    const promptTraceRaw =
      (promptTraceObj?.orderedPrompts as Array<Record<string, unknown>>) ?? [];
    const promptTrace: GatewayPromptTrace = {
      promptIds: promptTraceRaw
        .map((p) => String(p?.bankId || ""))
        .filter(Boolean),
      promptVersions: promptTraceRaw
        .map((p) => String(p?.version || ""))
        .filter(Boolean),
      promptHashes: promptTraceRaw
        .map((p) => String(p?.hash || ""))
        .filter(Boolean),
      promptTemplateIds: promptTraceRaw
        .map((p) => String(p?.templateId || ""))
        .filter(Boolean),
    };

    // Guardrail: all runtime LLM requests must include prompt-trace metadata.
    if (!promptTrace.promptIds.length) {
      throw new Error(
        "LlmGateway: missing prompt trace metadata (prompt bank path not used)",
      );
    }

    const providerMessages: LLMMessage[] = built.messages.map((m) => ({
      role: m.role as LLMMessage["role"],
      content: m.content,
    }));

    const request: LLMRequest = {
      traceId: params.traceId,
      turnId: `turn_${Date.now().toString(36)}`,
      model: {
        provider: mapProviderForRequest(route.provider as LLMProvider),
        model: route.model || this.cfg.modelId,
      },
      messages: providerMessages,
      sampling: {
        temperature: built.options?.temperature,
        topP: built.options?.topP,
        maxOutputTokens: built.options?.maxOutputTokens,
      },
      purpose: mapPurpose(
        String(kodaMeta?.promptType || "compose_answer"),
      ),
      meta: {
        ...(params.meta || {}),
        userId: params.userId,
        conversationId: params.conversationId,
        promptType: kodaMeta?.promptType as string,
        promptTrace,
        route,
      },
    };

    return {
      route,
      request,
      promptType: String(
        kodaMeta?.promptType || "compose_answer",
      ),
      promptTrace,
      outputLanguage: parsed.outputLanguage,
      promptMode: parsed.promptMode ?? "compose",
      userText: parsed.userText,
    };
  }

  private parseIncomingMessages(params: LlmGatewayRequest): {
    userText: string;
    outputLanguage: LangCode;
    answerMode: string;
    intentFamily?: string | null;
    operator?: string | null;
    operatorFamily?: string | null;
    navType: "open" | "where" | "discover" | null;
    fallback?: { triggered: boolean; reasonCode?: string | null };
    disambiguation?: GatewayDisambiguation | null;
    evidencePack?: EvidencePackLike;
    memoryPack?: MemoryPackLike;
    productHelpTopic?: string | null;
    productHelpSnippet?: string | null;
    styleProfile?: string | null;
    styleMaxQuestions?: number | null;
    styleMaxChars?: number | null;
    userRequestedShort?: boolean;
    boldingEnabled?: boolean | null;
    promptMode?: "compose" | "retrieval_plan";
    uiSurface?: string | null;
    usedBy?: string[] | null;
    semanticFlags?: string[] | null;
  } {
    const messages = params.messages || [];

    const lastUserIdx = [...messages]
      .reverse()
      .findIndex((m) => m.role === "user");
    const resolvedIdx =
      lastUserIdx >= 0
        ? messages.length - 1 - lastUserIdx
        : messages.length - 1;
    const userText = clampText(
      messages[resolvedIdx]?.content || "",
      this.resolveUserTextCharCap(),
    );

    const history = messages.slice(0, Math.max(0, resolvedIdx));
    const promptTask =
      typeof params.meta?.promptTask === "string"
        ? String(params.meta.promptTask)
        : null;
    const rawMeta = params.meta || {};
    const rawContext = params.context || {};
    const evidencePack = params.evidencePack ?? undefined;
    const contextSignals = (rawContext?.signals as Record<string, unknown>) || {};
    const metaSignals = (rawMeta?.signals as Record<string, unknown>) || {};
    const systemBlocks = history
      .filter((m) => m.role === "system")
      .map((m) => clampText(m.content, this.resolveSystemBlockCharCap()));
    const dialogueHistory = history.filter((m) => m.role !== "system");

    const outputLanguage = this.detectOutputLanguage(
      rawMeta,
      rawContext,
      systemBlocks,
    );
    const promptTaskName = String(promptTask || "").trim();
    const resolvedOperator =
      promptTaskName ||
      firstNonEmptyString(
        rawMeta.operator,
        rawContext.operator,
        contextSignals.operator,
        metaSignals.operator,
      ) ||
      null;
    const familyResolution = this.resolveOperatorFamilyRouting(
      resolvedOperator,
      rawMeta,
      rawContext,
    );
    const answerMode = this.detectAnswerMode(
      rawMeta,
      systemBlocks,
      evidencePack,
      rawContext,
      {
        operator: resolvedOperator,
        operatorFamily: familyResolution.operatorFamily,
        operatorFamilyDefaultMode: familyResolution.defaultAnswerMode,
      },
      userText,
    );
    const disambiguation = this.detectDisambiguation(
      rawMeta,
      rawContext,
      answerMode,
    );
    const operatorFamily =
      familyResolution.operatorFamily ||
      (answerMode === "nav_pills" ? "file_actions" : null);
    const navType =
      (rawMeta.navType as "open" | "where" | "discover" | null) ??
      (answerMode === "nav_pills" ? "discover" : null);

    const reasonCode =
      typeof rawMeta.fallbackReasonCode === "string"
        ? rawMeta.fallbackReasonCode
        : null;
    const requestedPurpose = asNormalizedCode(
      firstNonEmptyString(
        rawMeta.purpose,
        rawContext.purpose,
        contextSignals.purpose,
        metaSignals.purpose,
      ),
    );
    const productHelpTopic = firstNonEmptyString(
      rawMeta.productHelpTopic,
      rawContext.productHelpTopic,
      contextSignals.productHelpTopic,
      metaSignals.productHelpTopic,
    );
    const productHelpSnippet = firstNonEmptyString(
      rawMeta.productHelpSnippet,
      rawContext.productHelpSnippet,
      contextSignals.productHelpSnippet,
      metaSignals.productHelpSnippet,
    );
    const styleProfile =
      firstNonEmptyString(
        rawMeta.styleProfile,
        rawContext.styleProfile,
        contextSignals.styleProfile,
        metaSignals.styleProfile,
      ) || null;
    const styleMaxQuestions =
      asNonNegativeInt(
        rawMeta.styleMaxQuestions ??
          rawMeta.maxQuestions ??
          rawContext.styleMaxQuestions ??
          contextSignals.styleMaxQuestions ??
          contextSignals.maxQuestions ??
          metaSignals.styleMaxQuestions ??
          metaSignals.maxQuestions,
      ) ?? null;
    const styleMaxChars =
      asNonNegativeInt(
        rawMeta.styleMaxChars ??
          rawContext.styleMaxChars ??
          contextSignals.styleMaxChars ??
          contextSignals.profileMaxChars ??
          metaSignals.styleMaxChars,
      ) ?? null;
    const userRequestedShort =
      asBool(
        rawMeta.userRequestedShort ??
          rawMeta.truncationRetry ??
          rawContext.userRequestedShort ??
          rawContext.truncationRetry ??
          contextSignals.userRequestedShort ??
          contextSignals.truncationRetry ??
          contextSignals.shortAnswer ??
          metaSignals.userRequestedShort ??
          metaSignals.truncationRetry ??
          metaSignals.shortAnswer,
      ) === true;
    const boldingEnabledRaw =
      rawMeta.boldingEnabled ??
      rawContext.boldingEnabled ??
      contextSignals.boldingEnabled ??
      metaSignals.boldingEnabled;
    const boldingEnabled =
      typeof boldingEnabledRaw === "boolean" ? boldingEnabledRaw : null;
    const retrievalPlanningSignal =
      asBool(
        rawMeta.retrievalPlanning ??
          rawContext.retrievalPlanning ??
          contextSignals.retrievalPlanning ??
          metaSignals.retrievalPlanning,
      ) === true;
    const promptMode = normalizePromptMode(
      firstNonEmptyString(
        rawMeta.promptMode,
        rawContext.promptMode,
        contextSignals.promptMode,
        metaSignals.promptMode,
        requestedPurpose === "retrieval_planning" ? "retrieval_plan" : null,
        retrievalPlanningSignal ? "retrieval_plan" : null,
      ),
    );
    const uiSurface =
      firstNonEmptyString(
        rawMeta.uiSurface,
        rawContext.uiSurface,
        contextSignals.uiSurface,
        metaSignals.uiSurface,
      ) || null;
    const usedBy = [
      ...asStringList(rawMeta.usedBy),
      ...asStringList(rawContext.usedBy),
      ...asStringList(contextSignals.usedBy),
      ...asStringList(metaSignals.usedBy),
    ];
    const semanticFlagsSet = new Set<string>();
    for (const value of [
      ...asStringList(rawMeta.semanticFlags),
      ...asStringList(rawContext.semanticFlags),
      ...asStringList(contextSignals.semanticFlags),
      ...asStringList(metaSignals.semanticFlags),
    ]) {
      semanticFlagsSet.add(value);
    }
    const signalObjects = [contextSignals, metaSignals];
    for (const obj of signalObjects) {
      if (!obj || typeof obj !== "object") continue;
      for (const [key, value] of Object.entries(obj)) {
        const enabled = asBool(value);
        if (enabled === true) semanticFlagsSet.add(String(key || "").trim());
      }
    }
    const semanticFlags = Array.from(semanticFlagsSet).filter(Boolean);
    const tightenedHistoryForDocGrounded =
      String(answerMode || "").startsWith("doc_grounded") &&
      dialogueHistory.length > 12;
    const dialogue = this.buildDialogueContext(dialogueHistory, {
      maxTurns: tightenedHistoryForDocGrounded
        ? Math.min(this.resolveDialogueTurnLimit(), 8)
        : undefined,
      perMessageCap: tightenedHistoryForDocGrounded
        ? Math.min(this.resolveDialogueMessageCharCap(), 700)
        : undefined,
      charBudget: tightenedHistoryForDocGrounded
        ? Math.min(this.resolveDialogueCharBudget(), 5000)
        : undefined,
    }).join("\n");
    const memoryParts: string[] = [];
    if (dialogue) {
      memoryParts.push(`### Conversation History\n${dialogue}`);
    }
    if (!promptTask && systemBlocks.length) {
      memoryParts.push(
        "### Runtime Context Data\n" +
          systemBlocks.map((s, i) => `[ctx_${i + 1}]\n${s}`).join("\n\n"),
      );
    }
    const joinedMemory = memoryParts.join("\n\n");
    const memoryPackCharCap = tightenedHistoryForDocGrounded
      ? Math.min(this.resolveMemoryPackCharCap(), 9000)
      : this.resolveMemoryPackCharCap();
    const memoryPack = memoryParts.length
      ? {
          contextText: clampText(joinedMemory, memoryPackCharCap),
          stats: { usedChars: joinedMemory.length },
        }
      : undefined;

    return {
      userText,
      outputLanguage,
      answerMode,
      intentFamily: (rawMeta.intentFamily as string) || null,
      operator: resolvedOperator,
      operatorFamily: promptTaskName ? "file_actions" : operatorFamily,
      navType,
      fallback: reasonCode
        ? { triggered: true, reasonCode }
        : { triggered: false },
      disambiguation,
      evidencePack,
      memoryPack,
      productHelpTopic,
      productHelpSnippet,
      styleProfile,
      styleMaxQuestions,
      styleMaxChars,
      userRequestedShort,
      boldingEnabled,
      promptMode,
      uiSurface,
      usedBy: usedBy.length ? Array.from(new Set(usedBy)) : [],
      semanticFlags,
    };
  }

  private buildDialogueContext(
    history: Array<{ role: GatewayChatRole; content: string }>,
    overrides?: {
      maxTurns?: number;
      perMessageCap?: number;
      charBudget?: number;
    },
  ): string[] {
    if (!history.length) return [];

    const maxTurns = Math.max(
      1,
      Number(overrides?.maxTurns) || this.resolveDialogueTurnLimit(),
    );
    const perMessageCap = Math.max(
      64,
      Number(overrides?.perMessageCap) || this.resolveDialogueMessageCharCap(),
    );
    const charBudget = Math.max(
      512,
      Number(overrides?.charBudget) || this.resolveDialogueCharBudget(),
    );

    const selected = history.slice(Math.max(0, history.length - maxTurns));
    const lines: string[] = [];
    let used = 0;

    // Keep newest messages first under budget, then restore chronological order.
    const reverseBuffer: string[] = [];
    for (let i = selected.length - 1; i >= 0; i--) {
      const m = selected[i];
      const line = `${m.role.toUpperCase()}: ${clampText(m.content, perMessageCap)}`;
      if (line.length + used > charBudget) {
        if (reverseBuffer.length > 0) break;
        // Always keep at least one line so continuity never goes empty.
      }
      reverseBuffer.push(line);
      used += line.length + 1;
      if (used >= charBudget) break;
    }

    for (let i = reverseBuffer.length - 1; i >= 0; i--) {
      lines.push(reverseBuffer[i]);
    }

    return lines;
  }

  private resolveDialogueTurnLimit(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.dialogueTurnLimit,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.dialogueTurnLimit is required",
      );
    }
    return Math.floor(raw);
  }

  private resolveUserTextCharCap(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.userTextCharCap,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.userTextCharCap is required",
      );
    }
    return Math.floor(raw);
  }

  private resolveSystemBlockCharCap(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.systemBlockCharCap,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.systemBlockCharCap is required",
      );
    }
    return Math.floor(raw);
  }

  private resolveDialogueMessageCharCap(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.dialogueMessageCharCap,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.dialogueMessageCharCap is required",
      );
    }
    return Math.floor(raw);
  }

  private resolveDialogueCharBudget(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.dialogueCharBudget,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.dialogueCharBudget is required",
      );
    }
    return Math.floor(raw);
  }

  private resolveMemoryPackCharCap(): number {
    const raw = Number(
      this.getMemoryPolicyRuntimeTuning().gateway?.memoryPackCharCap,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.gateway.memoryPackCharCap is required",
      );
    }
    return Math.floor(raw);
  }

  private getMemoryPolicyRuntimeTuning(): MemoryPolicyRuntimeTuning {
    const bank = getOptionalBank<Record<string, unknown>>("memory_policy");
    if (!bank) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_MISSING",
        "Required bank missing: memory_policy",
      );
    }
    return ((bank.config as Record<string, unknown> | undefined)?.runtimeTuning || {}) as MemoryPolicyRuntimeTuning;
  }

  private detectOutputLanguage(
    meta: Record<string, unknown>,
    context: Record<string, unknown>,
    systemBlocks: string[],
  ): LangCode {
    const explicit =
      (meta.preferredLanguage as string) ||
      (context.preferredLanguage as string);
    if (explicit === "en" || explicit === "pt" || explicit === "es")
      return explicit;

    const joined = systemBlocks.join("\n");
    if (/respond entirely in Portuguese/i.test(joined)) return "pt";
    if (/respond entirely in Spanish/i.test(joined)) return "es";
    return "en";
  }

  private detectAnswerMode(
    meta: Record<string, unknown>,
    systemBlocks: string[],
    evidencePack?: EvidencePackLike,
    context?: Record<string, unknown>,
    operatorRouting?: {
      operator?: string | null;
      operatorFamily?: string | null;
      operatorFamilyDefaultMode?: string | null;
    },
    queryText?: string | null,
  ): string {
    if (typeof meta.promptTask === "string" && meta.promptTask.trim()) {
      return this.answerModeRouter.decide({
        promptTask: String(meta.promptTask),
      }).answerMode;
    }
    const contextSignals = (context?.signals as Record<string, unknown>) || {};
    const metaSignals = (meta?.signals as Record<string, unknown>) || {};
    const needsClarification =
      meta.needsClarification === true ||
      context?.needsClarification === true ||
      contextSignals.needsClarification === true ||
      metaSignals.needsClarification === true;
    const disambiguationActive =
      (meta.disambiguation as Record<string, unknown> | undefined)?.active === true ||
      (context?.disambiguation as Record<string, unknown> | undefined)?.active === true ||
      (contextSignals?.disambiguation as Record<string, unknown> | undefined)?.active === true ||
      (metaSignals?.disambiguation as Record<string, unknown> | undefined)?.active === true;

    const evidenceDocCount = evidencePack?.evidence?.length
      ? new Set(evidencePack.evidence.map((e) => e.docId)).size
      : 0;
    return this.answerModeRouter.decide({
      promptTask:
        typeof meta.promptTask === "string" ? String(meta.promptTask) : null,
      explicitAnswerMode:
        typeof meta.answerMode === "string" ? String(meta.answerMode) : null,
      needsClarification,
      disambiguationActive,
      operator: operatorRouting?.operator,
      operatorFamily:
        operatorRouting?.operatorFamily || (context?.operatorFamily as string),
      intentFamily:
        (meta.intentFamily as string) ||
        (context?.intentFamily as string) ||
        null,
      evidenceDocCount,
      systemBlocks,
      queryText: queryText || null,
    }).answerMode;
  }

  private resolveOperatorFamilyRouting(
    operator: string | null,
    meta: Record<string, unknown>,
    context: Record<string, unknown>,
  ): { operatorFamily: string | null; defaultAnswerMode: string | null } {
    const explicitFamily = firstNonEmptyString(
      meta.operatorFamily,
      context.operatorFamily,
      (meta.signals as Record<string, unknown> | undefined)?.operatorFamily,
      (context.signals as Record<string, unknown> | undefined)?.operatorFamily,
    );
    const familyBank = getOptionalBank<Record<string, unknown>>("operator_families");
    const families = Array.isArray(familyBank?.families)
      ? (familyBank.families as Array<Record<string, unknown>>)
      : [];
    const findFamilyById = (familyId: string) =>
      families.find(
        (entry) =>
          asNormalizedCode(entry?.id) === asNormalizedCode(familyId),
      ) || null;

    let familyEntry = explicitFamily ? findFamilyById(explicitFamily) : null;
    if (!familyEntry && operator) {
      const normalizedOperator = asNormalizedCode(operator);
      familyEntry =
        families.find((entry) =>
          Array.isArray(entry?.operators)
            ? (entry.operators as unknown[]).some(
                (op: unknown) => asNormalizedCode(op) === normalizedOperator,
              )
            : false,
        ) || null;
    }

    if (!familyEntry) {
      return {
        operatorFamily: explicitFamily ? String(explicitFamily) : null,
        defaultAnswerMode: null,
      };
    }

    const operatorHints =
      familyEntry.operatorHints && typeof familyEntry.operatorHints === "object"
        ? familyEntry.operatorHints
        : null;
    const normalizedOperator = asNormalizedCode(operator);
    const hintedMode =
      normalizedOperator && operatorHints
        ? Object.entries(operatorHints).find(
            ([opId]) => asNormalizedCode(opId) === normalizedOperator,
          )?.[1]
        : null;
    const defaultAnswerMode = String(
      (hintedMode as Record<string, unknown> | undefined)?.defaultMode || familyEntry.defaultAnswerMode || "",
    ).trim();

    return {
      operatorFamily: String(familyEntry.id || "").trim() || null,
      defaultAnswerMode: defaultAnswerMode || null,
    };
  }

  private detectDisambiguation(
    meta: Record<string, unknown>,
    context: Record<string, unknown>,
    answerMode: string,
  ): GatewayDisambiguation | null {
    const contextSignals = (context?.signals as Record<string, unknown>) || {};
    const metaSignals = (meta?.signals as Record<string, unknown>) || {};
    const dm =
      (meta.disambiguation as Record<string, unknown>) ||
      (context.disambiguation as Record<string, unknown>) ||
      (contextSignals.disambiguation as Record<string, unknown>) ||
      (metaSignals.disambiguation as Record<string, unknown>) ||
      null;
    const needsClarification =
      meta.needsClarification === true ||
      context?.needsClarification === true ||
      contextSignals.needsClarification === true ||
      metaSignals.needsClarification === true;
    const active =
      answerMode === "rank_disambiguate" ||
      needsClarification ||
      dm?.active === true;

    if (!active) return null;

    const rawOptions = Array.isArray(dm?.options) ? (dm.options as Array<Record<string, unknown>>) : [];
    const options = rawOptions
      .map((o: Record<string, unknown>, idx: number) => ({
        id: String(o?.id || `opt_${idx + 1}`),
        label: String(o?.label || o?.title || "").trim(),
        score: typeof o?.score === "number" ? o.score : undefined,
      }))
      .filter((o: { label: string }) => o.label.length > 0);

    const candidateType = ["document", "sheet", "operator"].includes(
      String(dm?.candidateType),
    )
      ? (dm.candidateType as "document" | "sheet" | "operator")
      : "document";

    const maxOptions = Math.max(
      2,
      Math.min(6, Number(dm?.maxOptions ?? 4) || 4),
    );
    const maxQuestions = Math.max(
      1,
      Math.min(2, Number(dm?.maxQuestions ?? 1) || 1),
    );

    return {
      active: true,
      candidateType,
      options,
      maxOptions,
      maxQuestions,
    };
  }
}

export default LlmGatewayService;
