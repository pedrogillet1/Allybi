/* eslint-disable @typescript-eslint/no-explicit-any */

import type { LLMClient, LLMMessage, LLMRequest } from "./llmClient.interface";
import type { LLMProvider } from "./llmErrors.types";
import type { LLMStreamingConfig, StreamSink } from "./llmStreaming.types";

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
  request: LLMRequest;
  promptType: string;
  promptTrace: GatewayPromptTrace;
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
  if (provider === "unknown") return "google";
  return provider;
}

function mapPurpose(promptType: string): LLMRequest["purpose"] {
  if (promptType === "retrieval") return "retrieval_planning";
  if (promptType === "disambiguation") return "intent_routing";
  if (promptType === "tool") return "validation_pass";
  return "answer_compose";
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

export class LlmGatewayService {
  constructor(
    private readonly llmClient: LLMClient,
    private readonly router: LlmRouterService,
    private readonly builder: LlmRequestBuilderService,
    private readonly cfg: LlmGatewayConfig,
  ) {}

  async generate(params: LlmGatewayRequest): Promise<{
    text: string;
    telemetry?: Record<string, unknown>;
    promptTrace: GatewayPromptTrace;
  }> {
    const prepared = this.prepareProviderRequest(params, false);
    const response = await this.llmClient.complete(prepared.request);

    return {
      text: response.content,
      telemetry: {
        provider: this.cfg.provider,
        model: this.cfg.modelId,
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
    const result = await this.llmClient.stream({
      req: prepared.request,
      sink: params.sink,
      config: params.streamingConfig,
    });

    return {
      finalText: result.finalText,
      telemetry: {
        provider: this.cfg.provider,
        model: this.cfg.modelId,
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

  private prepareProviderRequest(
    params: LlmGatewayRequest,
    streaming: boolean,
  ): PreparedGatewayRequest {
    const parsed = this.parseIncomingMessages(params);

    const route = this.router.route({
      env: this.cfg.env,
      stage: "final",
      answerMode: parsed.answerMode,
      intentFamily: parsed.intentFamily,
      operator: parsed.operator,
      operatorFamily: parsed.operatorFamily,
      requireStreaming: streaming,
      allowTools: false,
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
        intentFamily: parsed.intentFamily,
        operator: parsed.operator,
        operatorFamily: parsed.operatorFamily,
        disallowJsonOutput: promptTask ? false : true,
        maxQuestions: 1,
        navType: parsed.navType,
        fallback: parsed.fallback,
        disambiguation: parsed.disambiguation,
        productHelpTopic,
        productHelpSnippet,
      },
      evidencePack: params.evidencePack ?? parsed.evidencePack,
      memoryPack: parsed.memoryPack,
      toolContext: promptTask
        ? {
            toolName: promptTask,
            toolArgs: (params.meta?.promptTaskArgs as any) || {},
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
    const promptTraceRaw =
      (built.kodaMeta as any)?.promptTrace?.orderedPrompts ?? [];
    const promptTrace: GatewayPromptTrace = {
      promptIds: promptTraceRaw
        .map((p: any) => String(p?.bankId || ""))
        .filter(Boolean),
      promptVersions: promptTraceRaw
        .map((p: any) => String(p?.version || ""))
        .filter(Boolean),
      promptHashes: promptTraceRaw
        .map((p: any) => String(p?.hash || ""))
        .filter(Boolean),
      promptTemplateIds: promptTraceRaw
        .map((p: any) => String(p?.templateId || ""))
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
        provider: mapProviderForRequest(this.cfg.provider),
        model: this.cfg.modelId,
      },
      messages: providerMessages,
      sampling: {
        temperature: built.options?.temperature,
        topP: built.options?.topP,
        maxOutputTokens: built.options?.maxOutputTokens,
      },
      purpose: mapPurpose(
        String((built.kodaMeta as any)?.promptType || "compose_answer"),
      ),
      meta: {
        ...(params.meta || {}),
        userId: params.userId,
        conversationId: params.conversationId,
        promptType: (built.kodaMeta as any)?.promptType,
        promptTrace,
        route,
      },
    };

    return {
      request,
      promptType: String(
        (built.kodaMeta as any)?.promptType || "compose_answer",
      ),
      promptTrace,
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
    const systemBlocks = history
      .filter((m) => m.role === "system")
      .map((m) => clampText(m.content, this.resolveSystemBlockCharCap()));
    const dialogueHistory = history.filter((m) => m.role !== "system");
    const dialogue = this.buildDialogueContext(dialogueHistory).join("\n");

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
    const memoryPack = memoryParts.length
      ? {
          contextText: clampText(joinedMemory, this.resolveMemoryPackCharCap()),
          stats: { usedChars: joinedMemory.length },
        }
      : undefined;

    const rawMeta = params.meta || {};
    const rawContext = params.context || {};
    const evidencePack = params.evidencePack ?? undefined;

    const outputLanguage = this.detectOutputLanguage(
      rawMeta,
      rawContext,
      systemBlocks,
    );
    const answerMode = this.detectAnswerMode(
      rawMeta,
      systemBlocks,
      evidencePack,
      rawContext,
    );
    const disambiguation = this.detectDisambiguation(
      rawMeta,
      rawContext,
      answerMode,
    );
    const operatorFamily = answerMode === "nav_pills" ? "file_actions" : null;
    const navType =
      (rawMeta.navType as any) ??
      (answerMode === "nav_pills" ? "discover" : null);

    const reasonCode =
      typeof rawMeta.fallbackReasonCode === "string"
        ? rawMeta.fallbackReasonCode
        : null;
    const contextSignals = (rawContext?.signals as any) || {};
    const metaSignals = (rawMeta?.signals as any) || {};
    const productHelpTopic = firstNonEmptyString(
      rawMeta.productHelpTopic,
      (rawContext as any).productHelpTopic,
      contextSignals.productHelpTopic,
      metaSignals.productHelpTopic,
    );
    const productHelpSnippet = firstNonEmptyString(
      rawMeta.productHelpSnippet,
      (rawContext as any).productHelpSnippet,
      contextSignals.productHelpSnippet,
      metaSignals.productHelpSnippet,
    );

    return {
      userText,
      outputLanguage,
      answerMode,
      intentFamily: (rawMeta.intentFamily as string) || null,
      operator: promptTask || (rawMeta.operator as string) || null,
      operatorFamily: promptTask ? "file_actions" : operatorFamily,
      navType,
      fallback: reasonCode
        ? { triggered: true, reasonCode }
        : { triggered: false },
      disambiguation,
      evidencePack,
      memoryPack,
      productHelpTopic,
      productHelpSnippet,
    };
  }

  private buildDialogueContext(
    history: Array<{ role: GatewayChatRole; content: string }>,
  ): string[] {
    if (!history.length) return [];

    const maxTurns = this.resolveDialogueTurnLimit();
    const perMessageCap = this.resolveDialogueMessageCharCap();
    const charBudget = this.resolveDialogueCharBudget();

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
    const bank = getOptionalBank<any>("memory_policy");
    if (!bank) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_MISSING",
        "Required bank missing: memory_policy",
      );
    }
    return (bank.config?.runtimeTuning || {}) as MemoryPolicyRuntimeTuning;
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
  ): string {
    if (typeof meta.promptTask === "string" && meta.promptTask.trim()) {
      return "action_receipt";
    }
    if (typeof meta.answerMode === "string" && meta.answerMode.trim()) {
      return meta.answerMode;
    }
    const contextSignals = (context?.signals as any) || {};
    const metaSignals = (meta?.signals as any) || {};
    const needsClarification =
      meta.needsClarification === true ||
      (context as any)?.needsClarification === true ||
      contextSignals.needsClarification === true ||
      metaSignals.needsClarification === true;
    const disambiguationActive =
      (meta.disambiguation as any)?.active === true ||
      (context as any)?.disambiguation?.active === true ||
      contextSignals?.disambiguation?.active === true ||
      metaSignals?.disambiguation?.active === true;
    if (needsClarification || disambiguationActive) {
      return "rank_disambiguate";
    }

    const joined = systemBlocks.join("\n");
    if (/NAVIGATION MODE/i.test(joined)) return "nav_pills";
    if (evidencePack?.evidence?.length) {
      const unique = new Set(evidencePack.evidence.map((e) => e.docId)).size;
      return unique > 1 ? "doc_grounded_multi" : "doc_grounded_single";
    }

    return "general_answer";
  }

  private detectDisambiguation(
    meta: Record<string, unknown>,
    context: Record<string, unknown>,
    answerMode: string,
  ): GatewayDisambiguation | null {
    const contextSignals = (context?.signals as any) || {};
    const metaSignals = (meta?.signals as any) || {};
    const dm =
      (meta.disambiguation as any) ||
      (context.disambiguation as any) ||
      contextSignals.disambiguation ||
      metaSignals.disambiguation ||
      null;
    const needsClarification =
      meta.needsClarification === true ||
      (context as any)?.needsClarification === true ||
      contextSignals.needsClarification === true ||
      metaSignals.needsClarification === true;
    const active =
      answerMode === "rank_disambiguate" ||
      needsClarification ||
      dm?.active === true;

    if (!active) return null;

    const rawOptions = Array.isArray(dm?.options) ? dm.options : [];
    const options = rawOptions
      .map((o: any, idx: number) => ({
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
