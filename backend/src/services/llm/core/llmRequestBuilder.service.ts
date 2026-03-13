// src/services/llm/core/llmRequestBuilder.service.ts

/**
 * LlmRequestBuilderService (Allybi, ChatGPT-parity)
 * -----------------------------------------------
 * Builds a provider-agnostic LlmRequest using:
 *  - PromptRegistryService (system/retrieval/compose/disambiguation/fallback/tool prompts)
 *  - Resolved routing and policy signals from upstream services
 *  - Conversation memory context pack (summary/facts/recall/recent) if provided
 *  - Evidence pack (doc-grounded snippets + provenance) if provided
 *
 * This service does NOT:
 *  - call the LLM
 *  - perform retrieval
 *  - decide which model to use (LlmRouterService does)
 *
 * It DOES:
 *  - produce a deterministic prompt bundle from already-resolved constraints
 *  - assemble the correct request payload for the chosen prompt kind
 */

import type {
  LlmRequest,
  LlmMessage,
  LlmGenerationOptions,
  LlmRoutePlan,
  EnvName,
} from "../types/llm.types";
import type {
  PromptBundle as RegistryPromptBundle,
  PromptContext as RegistryPromptContext,
  PromptKind as RegistryPromptKind,
} from "../prompts/promptRegistry.service";
import { resolveOutputBudget } from "../../core/enforcement/tokenBudget.service";
import { ReasoningPolicyService } from "../../core/policy/reasoningPolicy.service";
import { buildEvidenceMapMetadata } from "./builderEvidenceRenderer";
import {
  buildPromptContext,
  resolveDomainForReasoning,
} from "./builderPromptContext";
import { resolveMaxInputTokensForRoute } from "./builderBudgetResolution";
import { getBuilderRuntimePolicy } from "./builderRuntimePolicy";
import { buildUserPayload } from "./builderUserPayload";

export type LangCode = "any" | "en" | "pt" | "es";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
}

/**
 * Prompt registry interface (your service already exists).
 */
export interface PromptRegistryService {
  buildPrompt(
    promptId: RegistryPromptKind,
    ctx: RegistryPromptContext,
  ): RegistryPromptBundle;
}

/**
 * Minimal evidence pack interface used by builder.
 * (Keep it small; we do not dump large evidence.)
 */
export interface EvidencePackLike {
  query?: { original?: string; normalized?: string };
  scope?: { activeDocId?: string | null; explicitDocLock?: boolean };
  stats?: {
    evidenceItems?: number;
    uniqueDocsInEvidence?: number;
    topScore?: number | null;
    scoreGap?: number | null;
  };
  evidence: Array<{
    docId: string;
    title?: string | null;
    filename?: string | null;
    location?: {
      page?: number | null;
      sheet?: string | null;
      slide?: number | null;
      sectionKey?: string | null;
    };
    locationKey?: string;
    snippet?: string;
    table?: {
      header?: string[];
      rows?: Array<Array<string | number | null>>;
      warnings?: string[];
      structureScore?: number;
      numericIntegrityScore?: number;
    } | null;
    score?: { finalScore?: number };
    evidenceType?: "text" | "table" | "image";
  }>;
  conflicts?: Array<{
    metric: string;
    docA: string;
    valueA: number;
    docB: string;
    valueB: number;
  }>;
}

/**
 * Conversation memory pack interface.
 */
export interface MemoryPackLike {
  contextText: string;
  stats?: { usedChars?: number };
}

/**
 * Disambiguation payload interface.
 */
export interface DisambiguationPayload {
  active: boolean;
  candidateType: "document" | "sheet" | "operator";
  options: Array<{ id: string; label: string; score?: number }>;
  maxOptions: number;
  maxQuestions: number;
}

/**
 * Builder input:
 * - route plan is chosen upstream by LlmRouterService
 */
export interface BuildRequestInput {
  env: EnvName;
  route: LlmRoutePlan;

  outputLanguage: LangCode;

  // User input
  userText: string;

  // Routing/scope signals for prompt shaping
  signals: {
    answerMode: string;
    promptMode?: "compose" | "retrieval_plan";
    intentFamily?: string | null;
    operator?: string | null;
    operatorFamily?: string | null;
    domain?: string | null;

    // constraints / policies
    disallowJsonOutput?: boolean;
    maxQuestions?: number;
    retrievalPlanning?: boolean;

    // doc grounding
    explicitDocLock?: boolean;
    activeDocId?: string | null;

    // fallback/disambiguation
    fallback?: { triggered: boolean; reasonCode?: string | null };
    disambiguation?: DisambiguationPayload | null;
    productHelpTopic?: string | null;
    productHelpSnippet?: string | null;
    styleProfile?: string | null;
    styleDecision?: Record<string, unknown> | null;
    turnStyleState?: Record<string, unknown> | null;
    styleMaxChars?: number | null;
    userRequestedShort?: boolean;
    boldingEnabled?: boolean;
    uiSurface?: string | null;
    usedBy?: string[] | null;
    semanticFlags?: string[] | null;

    // nav pills
    navType?: "open" | "where" | "discover" | null;

    // slot extraction
    isExtractionQuery?: boolean;
  };

  // Evidence pack produced by retrieval
  evidencePack?: EvidencePackLike | null;

  // Memory context pack produced by conversation memory
  memoryPack?: MemoryPackLike | null;

  // Optional: tool request context (file actions)
  toolContext?: { toolName: string; toolArgs?: Record<string, unknown> } | null;

  // Optional overrides
  options?: Partial<LlmGenerationOptions>;
}

function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

export class LlmRequestBuilderService {
  private readonly reasoningPolicy: ReasoningPolicyService;

  constructor(
    private readonly prompts: PromptRegistryService,
    opts?: { reasoningPolicy?: ReasoningPolicyService },
  ) {
    this.reasoningPolicy =
      opts?.reasoningPolicy || new ReasoningPolicyService();
  }

  build(input: BuildRequestInput): LlmRequest {
    const maxQuestions =
      typeof input.signals.maxQuestions === "number"
        ? input.signals.maxQuestions
        : 1;
    const disambiguationSignal = this.normalizeDisambiguationSignal(
      input,
      maxQuestions,
    );

    // Determine prompt type
    const promptType = this.choosePromptType(input, disambiguationSignal);

    // Build prompt context
    const reasoningGuidance = this.reasoningPolicy.buildGuidance({
      domain: resolveDomainForReasoning(input),
      answerMode: input.signals.answerMode,
      outputLanguage: input.outputLanguage,
    });
    const promptCtx = buildPromptContext(
      input,
      maxQuestions,
      disambiguationSignal,
      reasoningGuidance,
    );

    // Pull base prompt messages from prompt registry
    const prompt = this.prompts.buildPrompt(promptType, promptCtx);

    // Assemble final messages:
    // - system + developer from prompt registry
    // - user message includes:
    //    - memory context (if any)
    //    - evidence summary (if any)
    //    - user text
    const messages: LlmMessage[] = [];

    for (const m of prompt.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const builderPolicy = getBuilderRuntimePolicy();
    const userPayload = buildUserPayload(
      input,
      disambiguationSignal,
      builderPolicy,
    );
    messages.push({
      role: "user",
      content: userPayload.content,
    });

    const answerMode = input.signals.answerMode;
    const normalizedAnswerMode = String(answerMode || "")
      .trim()
      .toLowerCase();
    const userRequestedShort = input.signals.userRequestedShort === true;
    const outputBudget = resolveOutputBudget({
      answerMode,
      outputLanguage: input.outputLanguage,
      routeStage: input.route.stage,
      operator: input.signals.operator,
      userText: input.userText,
      evidenceItems: input.evidencePack?.evidence?.length ?? 0,
      hasTables:
        input.evidencePack?.evidence?.some(
          (item) => item.evidenceType === "table",
        ) ?? false,
      requestedOverride: input.options?.maxOutputTokens,
      userRequestedShort,
      styleMaxChars: input.signals.styleMaxChars,
    });
    const maxOutputTokens = outputBudget.maxOutputTokens;

    // Generation options (streaming by default, ChatGPT-like)
    const options: LlmGenerationOptions = {
      stream: true,
      deterministic: input.route.stage === "final",
      temperature: input.route.stage === "final" ? 0.2 : 0.4,
      topP: 0.9,
      ...input.options,
      maxOutputTokens,
    };

    if (answerMode === "nav_pills" || promptType === "disambiguation") {
      options.temperature = 0.2;
    }

    if (input.signals.operator === "quote") {
      options.temperature = 0.15;
    }

    const promptCharCount = messages.reduce(
      (sum, msg) => sum + String(msg.content || "").length,
      0,
    );
    const finalMaxOutputTokens = Number(options.maxOutputTokens ?? 0);
    const requestedMaxOutputTokens = Number(input.options?.maxOutputTokens);
    const docGroundedFloorApplied =
      !userRequestedShort &&
      normalizedAnswerMode.startsWith("doc_grounded") &&
      Number.isFinite(requestedMaxOutputTokens) &&
      outputBudget.maxOutputTokens > requestedMaxOutputTokens;
    const resolvedTokenPolicy = {
      answerMode: normalizedAnswerMode,
      source: "tokenBudget",
      baseBudgetMaxOutputTokens: outputBudget.maxOutputTokens,
      minOutputTokens: outputBudget.minOutputTokens,
      userRequestedShort,
      styleMaxChars:
        Number.isFinite(Number(input.signals.styleMaxChars)) &&
        Number(input.signals.styleMaxChars) > 0
          ? Number(input.signals.styleMaxChars)
          : null,
      docGroundedFloorApplied,
      docGroundedFloor: docGroundedFloorApplied
        ? outputBudget.maxOutputTokens
        : null,
      finalMaxOutputTokens,
    };

    // Input token budget guard: estimate total prompt tokens and truncate evidence
    // if we approach the provider's input token limit.
    const estimatedInputTokens = estimateTokensFromChars(promptCharCount);
    const maxInputTokens = this.resolveMaxInputTokens(input);
    if (maxInputTokens > 0 && estimatedInputTokens > maxInputTokens * 0.95) {
      const overageTokens = estimatedInputTokens - Math.floor(maxInputTokens * 0.90);
      const overageChars = overageTokens * 4;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content && lastMessage.content.length > overageChars) {
        lastMessage.content = lastMessage.content.slice(
          0,
          lastMessage.content.length - overageChars,
        );
      }
    }

    return {
      route: input.route,
      messages,
      options,
      cacheKeyHint: this.cacheKeyHint(input, promptType),
      kodaMeta: {
        promptType,
        promptTrace: prompt.trace ?? null,
        answerMode: input.signals.answerMode,
        operator: input.signals.operator,
        intentFamily: input.signals.intentFamily,
        reasonCodes: input.signals.fallback?.reasonCode
          ? [input.signals.fallback.reasonCode]
          : [],
        outputBudget,
        resolvedTokenPolicy,
        payloadStats: {
          ...userPayload.stats,
          promptCharCount,
          estimatedPromptTokens: estimateTokensFromChars(promptCharCount),
        },
        provenanceSchemaVersion: "v1",
        evidenceMap: buildEvidenceMapMetadata(input.evidencePack),
        evidenceRendering: userPayload.evidenceRendering,
      },
    };
  }

  // -------------------------
  // Prompt selection
  // -------------------------

  private choosePromptType(
    input: BuildRequestInput,
    disambiguationSignal: DisambiguationPayload | null,
  ):
    | "system"
    | "retrieval"
    | "compose_answer"
    | "disambiguation"
    | "fallback"
    | "tool" {
    // Disambiguation always wins
    if (
      disambiguationSignal?.active ||
      input.signals.answerMode === "rank_disambiguate"
    )
      return "disambiguation";

    // Retrieval planner prompt is internal-only and must be explicit.
    if (
      input.signals.promptMode === "retrieval_plan" ||
      input.signals.retrievalPlanning === true
    ) {
      return "retrieval";
    }

    // Fallback triggered
    if (input.signals.fallback?.triggered) return "fallback";

    // Tool prompt shape only for explicit task/tool contexts.
    if (input.toolContext) return "tool";

    // Default compose prompt for normal doc-grounded answers
    return "compose_answer";
  }

  // -------------------------
  // Cache key hints
  // -------------------------

  private cacheKeyHint(input: BuildRequestInput, promptType: string): string {
    // Deterministic hint (not required). Use a stable-ish key without including full evidence.
    const core = [
      `p:${promptType}`,
      `m:${input.signals.answerMode}`,
      `op:${input.signals.operator ?? ""}`,
      `st:${input.route.stage}`,
      `q:${input.userText.slice(0, 120)}`,
    ].join("|");

    // Keep short to avoid huge keys
    return core;
  }

  /**
   * Resolve max input tokens from provider capabilities bank.
   * Defaults: 1M for Gemini, 128K for OpenAI.
   */
  private resolveMaxInputTokens(input: BuildRequestInput): number {
    return resolveMaxInputTokensForRoute({
      provider: String(input.route.provider || ""),
      model: String(input.route.model || ""),
    });
  }

  private normalizeDisambiguationSignal(
    input: BuildRequestInput,
    maxQuestions: number,
  ): DisambiguationPayload | null {
    if (input.signals.disambiguation?.active)
      return input.signals.disambiguation;
    if (input.signals.answerMode !== "rank_disambiguate") return null;
    return {
      active: true,
      candidateType: "document",
      options: [],
      maxOptions: 4,
      maxQuestions: Math.max(1, Math.min(2, maxQuestions || 1)),
    };
  }
}

export default LlmRequestBuilderService;
