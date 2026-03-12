// src/services/llm/core/llmRequestBuilder.service.ts
import { createHash } from "crypto";

/**
 * LlmRequestBuilderService (Allybi, ChatGPT-parity)
 * -----------------------------------------------
 * Builds a provider-agnostic LlmRequest using:
 *  - PromptRegistryService (system/retrieval/compose/disambiguation/fallback/tool prompts)
 *  - Allybi routing signals + policies (nav_pills contract, max 1 question, no JSON to user)
 *  - Conversation memory context pack (summary/facts/recall/recent) if provided
 *  - Evidence pack (doc-grounded snippets + provenance) if provided
 *
 * This service does NOT:
 *  - call the LLM
 *  - perform retrieval
 *  - decide which model to use (LlmRouterService does)
 *
 * It DOES:
 *  - produce a deterministic prompt bundle that matches Allybi banks/policies
 *  - build the correct "mode" request:
 *      - doc-grounded compose
 *      - nav_pills minimal
 *      - clarification/disambiguation
 *      - fallback shaping
 *
 * Key invariants:
 *  - No user-visible JSON output (prompts instruct to avoid JSON)
 *  - nav_pills: 1 intro sentence, no sources label, no actions
 *  - Max 1 clarification question
 *  - Doc-grounded: use evidence only; never invent sources
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
import { toCostFamilyModel } from "./llmCostCalculator";

import { BRAND_NAME } from "../../../config/brand";
import { resolveOutputBudget } from "../../core/enforcement/tokenBudget.service";
import { ReasoningPolicyService } from "../../core/policy/reasoningPolicy.service";
import { getOptionalBank } from "../../core/banks/bankLoader.service";

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

type BuilderPayloadStats = {
  memoryCharsIncluded: number;
  evidenceCharsIncluded: number;
  evidenceItemsIncluded: number;
  disambiguationOptionsIncluded: number;
  toolContextCharsIncluded: number;
  answerDepthCharsIncluded: number;
  languageConstraintCharsIncluded: number;
  userSectionCharsIncluded: number;
  totalUserPayloadChars: number;
  estimatedUserPayloadTokens: number;
};

type EvidenceRenderResult = {
  text: string;
  charsIncluded: number;
  itemsIncluded: number;
  tableItemsRendered: number;
  tableQualityAnnotations: number;
};

type BuilderEvidenceCaps = {
  maxItems: number;
  maxSnippetChars: number;
  maxSectionChars: number;
};

type BuilderPayloadCaps = {
  memoryCharsDefault: number;
  memoryCharsDocGrounded: number;
  userSectionCharsMax: number;
  toolContextCharsMax: number;
  totalUserPayloadCharsMax: number;
};

type BuilderRuntimePolicy = {
  payloadCaps: BuilderPayloadCaps;
  evidenceCapsByMode: Record<string, BuilderEvidenceCaps>;
};

const DEFAULT_BUILDER_POLICY: BuilderRuntimePolicy = {
  payloadCaps: {
    memoryCharsDefault: 4800,
    memoryCharsDocGrounded: 6800,
    userSectionCharsMax: Math.trunc(42e2),
    toolContextCharsMax: 1400,
    totalUserPayloadCharsMax: 32000,
  },
  evidenceCapsByMode: {
    doc_grounded_single: {
      maxItems: 10,
      maxSnippetChars: 600,
      maxSectionChars: 9600,
    },
    doc_grounded_multi: {
      maxItems: 14,
      maxSnippetChars: 600,
      maxSectionChars: 11200,
    },
    doc_grounded_quote: {
      maxItems: 8,
      maxSnippetChars: 500,
      maxSectionChars: 7000,
    },
    doc_grounded_table: {
      maxItems: 14,
      maxSnippetChars: 800,
      maxSectionChars: 14000,
    },
  },
};

let builderPolicyCache: BuilderRuntimePolicy | null | undefined;

/** Clear builder policy cache (for test teardown). */
export function clearBuilderPolicyCache(): void {
  builderPolicyCache = undefined;
}

function asPositiveInt(
  value: unknown,
  fallback: number,
  min = 1,
  max = 100000,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toNormalizedModeKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePayloadCaps(raw: unknown): BuilderPayloadCaps {
  const defaults = DEFAULT_BUILDER_POLICY.payloadCaps;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaults };
  const src = raw as Record<string, unknown>;
  return {
    memoryCharsDefault: asPositiveInt(
      src.memoryCharsDefault,
      defaults.memoryCharsDefault,
      256,
      60000,
    ),
    memoryCharsDocGrounded: asPositiveInt(
      src.memoryCharsDocGrounded,
      defaults.memoryCharsDocGrounded,
      256,
      60000,
    ),
    userSectionCharsMax: asPositiveInt(
      src.userSectionCharsMax,
      defaults.userSectionCharsMax,
      128,
      20000,
    ),
    toolContextCharsMax: asPositiveInt(
      src.toolContextCharsMax,
      defaults.toolContextCharsMax,
      64,
      20000,
    ),
    totalUserPayloadCharsMax: asPositiveInt(
      src.totalUserPayloadCharsMax,
      defaults.totalUserPayloadCharsMax,
      512,
      100000,
    ),
  };
}

function normalizeEvidenceCapEntry(
  raw: unknown,
  fallback: BuilderEvidenceCaps,
): BuilderEvidenceCaps {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const src = raw as Record<string, unknown>;
  return {
    maxItems: asPositiveInt(src.maxItems, fallback.maxItems, 1, 50),
    maxSnippetChars: asPositiveInt(
      src.maxSnippetChars,
      fallback.maxSnippetChars,
      40,
      5000,
    ),
    maxSectionChars: asPositiveInt(
      src.maxSectionChars,
      fallback.maxSectionChars,
      200,
      100000,
    ),
  };
}

function normalizeEvidenceCapsByMode(
  raw: unknown,
): Record<string, BuilderEvidenceCaps> {
  const out: Record<string, BuilderEvidenceCaps> = Object.fromEntries(
    Object.entries(DEFAULT_BUILDER_POLICY.evidenceCapsByMode).map(([mode, caps]) => [
      mode,
      { ...caps },
    ]),
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [mode, entry] of Object.entries(raw as Record<string, unknown>)) {
    const key = toNormalizedModeKey(mode);
    if (!key) continue;
    const fallback = out[key] || {
      maxItems: 8,
      maxSnippetChars: 260,
      maxSectionChars: 3400,
    };
    out[key] = normalizeEvidenceCapEntry(entry, fallback);
  }
  return out;
}

function readBuilderPolicyFromBank(): BuilderRuntimePolicy {
  const bank = getOptionalBank<Record<string, unknown>>("llm_builder_policy");
  if (!bank || typeof bank !== "object") {
    return {
      ...DEFAULT_BUILDER_POLICY,
      payloadCaps: { ...DEFAULT_BUILDER_POLICY.payloadCaps },
      evidenceCapsByMode: normalizeEvidenceCapsByMode(null),
    };
  }

  const source =
    bank.config && typeof bank.config === "object"
      ? (bank.config as Record<string, unknown>)
      : (bank as Record<string, unknown>);
  return {
    payloadCaps: normalizePayloadCaps(source.payloadCaps),
    evidenceCapsByMode: normalizeEvidenceCapsByMode(source.evidenceCapsByMode),
  };
}

function getBuilderRuntimePolicy(): BuilderRuntimePolicy {
  if (builderPolicyCache !== undefined && builderPolicyCache !== null) {
    return builderPolicyCache;
  }
  const policy = readBuilderPolicyFromBank();
  builderPolicyCache = policy;
  return policy;
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
    const promptCtx = this.buildPromptContext(
      input,
      promptType,
      maxQuestions,
      disambiguationSignal,
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
    const userPayload = this.buildUserPayload(
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
        evidenceMap: this.buildEvidenceMapMetadata(input.evidencePack),
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

  private buildPromptContext(
    input: BuildRequestInput,
    promptType: string,
    maxQuestions: number,
    disambiguationSignal: DisambiguationPayload | null,
  ) {
    const evidenceStats = input.evidencePack?.stats ?? {};
    const reasoningGuidance = this.reasoningPolicy.buildGuidance({
      domain: this.resolveDomainForReasoning(input),
      answerMode: input.signals.answerMode,
      outputLanguage: input.outputLanguage,
    });
    const evidenceSummary = input.evidencePack
      ? {
          evidenceCount: Number(
            evidenceStats.evidenceItems ??
              input.evidencePack.evidence?.length ??
              0,
          ),
          uniqueDocs: Number(
            evidenceStats.uniqueDocsInEvidence ??
              new Set(input.evidencePack.evidence.map((e) => e.docId)).size,
          ),
          topScore: evidenceStats.topScore ?? null,
          hasTables: input.evidencePack.evidence.some(
            (e) => e.evidenceType === "table",
          ),
        }
      : undefined;
    const scopeSummary = input.signals.explicitDocLock
      ? {
          lock: "hard",
          activeDocId: input.signals.activeDocId ?? null,
        }
      : {
          lock: "soft",
          activeDocId: input.signals.activeDocId ?? null,
        };
    const docContext = {
      evidenceItems: evidenceSummary?.evidenceCount ?? 0,
      uniqueDocs: evidenceSummary?.uniqueDocs ?? 0,
      topScore: evidenceSummary?.topScore ?? null,
    };
    const disambiguationOptions = disambiguationSignal
      ? disambiguationSignal.options.map((o, i) => ({
          index: i + 1,
          id: o.id,
          label: o.label,
        }))
      : [];
    const runtimeSignals = {
      answerMode: input.signals.answerMode,
      promptMode: input.signals.promptMode ?? "compose",
      machineJsonOutput: input.signals.disallowJsonOutput === false,
      operator: input.signals.operator ?? "",
      intentFamily: input.signals.intentFamily ?? "",
      operatorFamily: input.signals.operatorFamily ?? "",
      navType: input.signals.navType ?? null,
      isExtractionQuery: Boolean(input.signals.isExtractionQuery),
      retrievalPlanning: Boolean(input.signals.retrievalPlanning),
      semanticFlags: Array.isArray(input.signals.semanticFlags)
        ? input.signals.semanticFlags
        : [],
      styleProfile: input.signals.styleProfile ?? null,
      styleMaxChars: input.signals.styleMaxChars ?? null,
      userRequestedShort: input.signals.userRequestedShort === true,
      boldingEnabled:
        typeof input.signals.boldingEnabled === "boolean"
          ? input.signals.boldingEnabled
          : null,
    };

    return {
      env: input.env,
      outputLanguage: input.outputLanguage,
      maxQuestions,
      maxOptions: disambiguationSignal?.maxOptions ?? 4,
      disallowJsonOutput: input.signals.disallowJsonOutput !== false,

      answerMode: input.signals.answerMode,
      intentFamily: input.signals.intentFamily,
      operator: input.signals.operator,
      operatorFamily: input.signals.operatorFamily,
      domainId: input.signals.domain ?? "",
      uiSurface: input.signals.uiSurface ?? null,
      usedBy: Array.isArray(input.signals.usedBy) ? input.signals.usedBy : [],
      semanticFlags: Array.isArray(input.signals.semanticFlags)
        ? input.signals.semanticFlags
        : [],

      explicitDocLock: Boolean(input.signals.explicitDocLock),
      activeDocId: input.signals.activeDocId ?? null,
      userQuery: input.userText,
      scope: scopeSummary,
      docContext,

      query: input.userText,
      normalizedQuery: input.evidencePack?.query?.normalized ?? "",

      evidenceSummary,

      disambiguation: disambiguationSignal
        ? {
            active: true,
            candidateType: disambiguationSignal.candidateType,
            options: disambiguationSignal.options.map((o) => ({
              id: o.id,
              label: o.label,
            })),
          }
        : { active: false },

      fallback: input.signals.fallback ?? { triggered: false },
      candidateCount: disambiguationOptions.length,
      candidates: disambiguationOptions,
      runtimeSignals,

      constraints: {
        maxQuestions,
        maxOptions: disambiguationSignal?.maxOptions ?? 4,
        disallowJsonOutput: input.signals.disallowJsonOutput !== false,
        navPillsStrict: input.signals.answerMode === "nav_pills",
        numericStrict: false,
        quoteStrict: input.signals.operator === "quote",
        styleProfile: input.signals.styleProfile ?? null,
        styleMaxChars: input.signals.styleMaxChars ?? null,
        boldingEnabled:
          typeof input.signals.boldingEnabled === "boolean"
            ? input.signals.boldingEnabled
            : null,
      },

      // Interpolated into bank-driven prompt templates (e.g. {{brandName}}).
      slots: {
        brandName: BRAND_NAME,
        userQuery: input.userText,
        domainId: input.signals.domain ?? "",
        scope: scopeSummary,
        docContext,
        candidates: disambiguationOptions,
        candidateCount: disambiguationOptions.length,
        runtimeSignals,
        uiSurface: input.signals.uiSurface ?? null,
        usedBy: Array.isArray(input.signals.usedBy) ? input.signals.usedBy : [],
        semanticFlags: Array.isArray(input.signals.semanticFlags)
          ? input.signals.semanticFlags
          : [],
        state: {
          fallback: input.signals.fallback ?? { triggered: false },
          disambiguationActive: Boolean(disambiguationSignal?.active),
        },
        productHelpTopic: String(input.signals.productHelpTopic || "").trim(),
        productHelpSnippet: String(
          input.signals.productHelpSnippet || "",
        ).trim(),
        reasoningPolicyGuidance: reasoningGuidance.text,
        reasoningAssumptionsLimit: reasoningGuidance.assumptionsLimit,
      },
    };
  }

  private resolveDomainForReasoning(input: BuildRequestInput): string | null {
    const explicit = String(input.signals.domain || "")
      .trim()
      .toLowerCase();
    if (explicit) return explicit;
    const family = String(input.signals.intentFamily || "")
      .trim()
      .toLowerCase();
    if (
      family === "finance" ||
      family === "legal" ||
      family === "medical" ||
      family === "ops" ||
      family === "accounting"
    ) {
      return family;
    }
    return null;
  }

  // -------------------------
  // User payload construction
  // -------------------------

  private buildUserPayload(
    input: BuildRequestInput,
    disambiguationSignal: DisambiguationPayload | null,
    policy: BuilderRuntimePolicy,
  ): { content: string; stats: BuilderPayloadStats; evidenceRendering?: Record<string, number> } {
    const parts: string[] = [];
    const evidenceRenderingTelemetry: Record<string, number> = {
      tableItemsRendered: 0,
      tableQualityAnnotations: 0,
      conflictsInjected: 0,
      totalEvidenceItems: 0,
    };
    const stats: BuilderPayloadStats = {
      memoryCharsIncluded: 0,
      evidenceCharsIncluded: 0,
      evidenceItemsIncluded: 0,
      disambiguationOptionsIncluded: 0,
      toolContextCharsIncluded: 0,
      answerDepthCharsIncluded: 0,
      languageConstraintCharsIncluded: 0,
      userSectionCharsIncluded: 0,
      totalUserPayloadChars: 0,
      estimatedUserPayloadTokens: 0,
    };

    const answerMode = String(input.signals.answerMode || "")
      .trim()
      .toLowerCase();
    const memoryCharCap = answerMode.startsWith("doc_grounded")
      ? policy.payloadCaps.memoryCharsDocGrounded
      : policy.payloadCaps.memoryCharsDefault;

    // Memory context (bounded, already packed)
    if (input.memoryPack?.contextText) {
      const memoryBlock = String(input.memoryPack.contextText || "")
        .trim()
        .slice(0, memoryCharCap);
      if (memoryBlock) {
        parts.push(memoryBlock);
        stats.memoryCharsIncluded = memoryBlock.length;
      }
    }

    // Evidence context: compact “Evidence” section (do not dump everything)
    if (
      input.evidencePack &&
      Array.isArray(input.evidencePack.evidence) &&
      input.evidencePack.evidence.length
    ) {
      const evidenceBlock = this.renderEvidenceForPrompt(input.evidencePack, {
        isExtractionQuery: input.signals.isExtractionQuery,
        answerMode: input.signals.answerMode,
      }, policy);
      if (evidenceBlock.text) {
        parts.push(evidenceBlock.text);
        stats.evidenceCharsIncluded = evidenceBlock.charsIncluded;
        stats.evidenceItemsIncluded = evidenceBlock.itemsIncluded;
      }
      evidenceRenderingTelemetry.tableItemsRendered = evidenceBlock.tableItemsRendered;
      evidenceRenderingTelemetry.tableQualityAnnotations = evidenceBlock.tableQualityAnnotations;
      evidenceRenderingTelemetry.totalEvidenceItems = input.evidencePack.evidence.length;
    }

    // Cross-doc conflict warnings (from retrieval engine detection)
    if (
      input.evidencePack?.conflicts?.length
    ) {
      const conflicts = input.evidencePack.conflicts.slice(0, 5);
      evidenceRenderingTelemetry.conflictsInjected = conflicts.length;
      const conflictBlock = [
        "Note: some values differ across sources.",
        "Use the most authoritative or most recent value. Do NOT mention this note, data conflicts, or document identifiers to the user:",
        ...conflicts.map(
          (c) => `- "${c.metric}": ${c.docA}=${c.valueA} vs ${c.docB}=${c.valueB}`,
        ),
      ].join("\n");
      parts.push(conflictBlock);
    }

    // Disambiguation options (if active) — keep minimal; prompt handles rendering policy
    if (disambiguationSignal?.active) {
      const opts = disambiguationSignal.options.slice(
        0,
        disambiguationSignal.maxOptions,
      );
      const optionsBlock = [
        "### Options",
        ...opts.map((o, i) => `- (${i + 1}) ${o.label}`),
      ].join("\n");
      parts.push(optionsBlock);
      stats.disambiguationOptionsIncluded = opts.length;
    }

    // Tool context (file actions)
    if (input.toolContext) {
      const toolContextText = [
        "### Tool Context",
        `toolName: ${input.toolContext.toolName}`,
        input.toolContext.toolArgs
          ? `toolArgs: ${JSON.stringify(input.toolContext.toolArgs)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, policy.payloadCaps.toolContextCharsMax);
      parts.push(toolContextText);
      stats.toolContextCharsIncluded = toolContextText.length;
    }

    // Answer depth guidance for doc-grounded modes — override the system-level
    // style hints with mode-specific guidance while staying compatible with
    // global table/body constraints from prompt banks.
    const am = input.signals.answerMode ?? "";
    if (am.startsWith("doc_grounded")) {
      const isTable = am === "doc_grounded_table";
      const answerDepthBlock =
        isTable
          ? `### Answer Depth\nProvide a compact, evidence-grounded table that answers the user's exact request. Prefer key rows first; if the full result is long, summarize the remainder clearly. After the table, add a brief interpretation (1-2 sentences).`
          : `### Answer Depth\nProvide a confident, complete answer to the specific question by extracting relevant facts from the evidence. Include key facts, numbers, and short structured bullets when helpful. If evidence addresses the topic, present findings directly without hedging or asking for additional documents.`;
      parts.push(answerDepthBlock);
      stats.answerDepthCharsIncluded = answerDepthBlock.length;
    }

    // Language constraint: ensure the LLM responds in the correct language
    const lang = input.outputLanguage;
    if (lang && lang !== "any") {
      const langLabel =
        lang === "en" ? "English" : lang === "pt" ? "Portuguese" : lang === "es" ? "Spanish" : lang;
      const languageConstraintBlock = `### Language Constraint\nYou MUST respond entirely in ${langLabel}. This is a binding requirement, not a suggestion.`;
      parts.push(languageConstraintBlock);
      stats.languageConstraintCharsIncluded = languageConstraintBlock.length;
    }

    // Finally the user message
    const userSection = `### User\n${input.userText.trim()}`.slice(
      0,
      policy.payloadCaps.userSectionCharsMax,
    );
    parts.push(userSection);
    stats.userSectionCharsIncluded = userSection.length;

    const content = parts
      .join("\n\n")
      .trim()
      .slice(0, policy.payloadCaps.totalUserPayloadCharsMax);
    stats.totalUserPayloadChars = content.length;
    stats.estimatedUserPayloadTokens = estimateTokensFromChars(content.length);
    return { content, stats, evidenceRendering: evidenceRenderingTelemetry };
  }

  private renderEvidenceForPrompt(
    pack: EvidencePackLike,
    opts?: { isExtractionQuery?: boolean; answerMode?: string },
    policy?: BuilderRuntimePolicy,
  ): EvidenceRenderResult {
    const activePolicy = policy || getBuilderRuntimePolicy();
    const answerMode = String(opts?.answerMode || "")
      .trim()
      .toLowerCase();
    const modeLimits = activePolicy.evidenceCapsByMode[answerMode] || {
      maxItems: 8,
      maxSnippetChars: 260,
      maxSectionChars: 3400,
    };
    const extractionBoost = opts?.isExtractionQuery
      ? { maxItems: 16, maxSnippetChars: 800, maxSectionChars: 16000 }
      : null;
    const maxItems = extractionBoost
      ? Math.max(modeLimits.maxItems, extractionBoost.maxItems)
      : modeLimits.maxItems;
    const maxSnippetChars = extractionBoost
      ? Math.max(modeLimits.maxSnippetChars, extractionBoost.maxSnippetChars)
      : modeLimits.maxSnippetChars;
    const maxSectionChars = extractionBoost
      ? Math.max(modeLimits.maxSectionChars, extractionBoost.maxSectionChars)
      : modeLimits.maxSectionChars;

    const top = pack.evidence.slice(0, maxItems);

    const lines: string[] = [];
    const header =
      answerMode === "doc_grounded_multi"
      ? "### Evidence (synthesize a confident answer from all relevant documents below)"
      : "### Evidence (answer the specific question directly using this evidence)";
    lines.push(header);
    let sectionChars = header.length;
    let itemsIncluded = 0;
    let tableItemsRendered = 0;
    let tableQualityAnnotations = 0;
    for (const e of top) {
      const title = e.title || e.filename || e.docId;
      const locParts: string[] = [];
      if (e.location?.page != null && Number(e.location.page) >= 0) locParts.push(`p.${e.location.page}`);
      if (e.location?.slide != null) locParts.push(`s.${e.location.slide}`);
      if (e.location?.sheet) locParts.push(`sheet:${e.location.sheet}`);
      if (e.location?.sectionKey && !e.location.sectionKey.startsWith("chunk_")) {
        locParts.push(`sec:${e.location.sectionKey}`);
      }
      const loc = locParts.join(",");

      // Display-safe keys for LLM (strip internal routing metadata like p:-1, c:NN)
      const displayLocationKey = loc || title || "text";
      const displayEvidenceId = `${e.docId}:${displayLocationKey}`;

      const locationKey = String(
        e.locationKey || loc || `${e.docId}:${e.evidenceType || "text"}`,
      ).trim();
      const evidenceId = `${e.docId}:${locationKey}`;

      let clipped: string;
      if (
        e.evidenceType === "table" &&
        e.table &&
        Array.isArray(e.table.header) &&
        e.table.header.length > 0
      ) {
        const hdr = e.table.header.map((h) => String(h ?? "")).join(" | ");
        const rows = (e.table.rows || [])
          .slice(0, 20)
          .map((r) => (r || []).map((c) => String(c ?? "")).join(" | "));
        const sep = e.table.header.map(() => "---").join(" | ");
        const tableText = [hdr, sep, ...rows].join("\n");
        clipped =
          tableText.length > maxSnippetChars
            ? tableText.slice(0, maxSnippetChars - 1) + "…"
            : tableText;
        tableItemsRendered++;
        if (e.table.warnings?.length) {
          clipped += ` [warnings: ${e.table.warnings.join(", ")}]`;
        }
        if (e.table.structureScore != null && e.table.structureScore < 0.8) {
          clipped += ` [structureQuality: ${(e.table.structureScore * 100).toFixed(0)}%]`;
          tableQualityAnnotations++;
        }
        if (e.table.numericIntegrityScore != null && e.table.numericIntegrityScore < 0.9) {
          clipped += ` [numericIntegrity: ${(e.table.numericIntegrityScore * 100).toFixed(0)}%]`;
          tableQualityAnnotations++;
        }
      } else {
        const snippet = (e.snippet || "").trim().replace(/\s+/g, " ");
        if (snippet.length <= maxSnippetChars) {
          clipped = snippet;
        } else {
          let truncAt = maxSnippetChars - 1;
          // Match numeric+unit patterns that may straddle the cut point.
          // Two flavours: prefix currencies (R$ 1,500,000, $200) and suffix units (12.5%, 1500 kg)
          const unitPatterns =
            /(?:R\$|\$|EUR)\s*[\d.,]+|\d[\d.,]*\s*(?:%|kg|months?|years?|days?|hours?|mil|milhões?|bilhões?)/gi;
          let um: RegExpExecArray | null;
          while ((um = unitPatterns.exec(snippet)) !== null) {
            if (um.index < truncAt && um.index + um[0].length > truncAt) {
              truncAt = um.index + um[0].length;
              break;
            }
          }
          clipped = snippet.slice(0, truncAt) + "…";
        }
      }

      const line = `- evidenceId=${displayEvidenceId} | documentId=${e.docId} | locationKey=${displayLocationKey} | title=${title}${loc ? ` | location=${loc}` : ""} | snippet=${clipped}`;
      if (sectionChars + line.length + 1 > maxSectionChars) {
        break;
      }
      lines.push(line);
      sectionChars += line.length + 1;
      itemsIncluded += 1;
    }

    const text = lines.join("\n");
    return {
      text,
      charsIncluded: text.length,
      itemsIncluded,
      tableItemsRendered,
      tableQualityAnnotations,
    };
  }

  private buildEvidenceMapMetadata(
    evidencePack: EvidencePackLike | null | undefined,
  ): Array<{
    evidenceId: string;
    documentId: string;
    locationKey: string;
    snippetHash: string;
  }> {
    if (!evidencePack || !Array.isArray(evidencePack.evidence)) return [];
    const out: Array<{
      evidenceId: string;
      documentId: string;
      locationKey: string;
      snippetHash: string;
    }> = [];
    for (const item of evidencePack.evidence) {
      const documentId = String(item.docId || "").trim();
      const locationKey = String(item.locationKey || "").trim();
      const snippet = String(item.snippet || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!documentId || !locationKey || !snippet) continue;
      const evidenceId = `${documentId}:${locationKey}`;
      out.push({
        evidenceId,
        documentId,
        locationKey,
        snippetHash: this.hashSnippet(snippet),
      });
    }
    return out;
  }

  private hashSnippet(input: string): string {
    // Keep deterministic and short for metadata transport.
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
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
    try {
      const bank =
        getOptionalBank<Record<string, unknown>>("provider_capabilities") ??
        getOptionalBank<Record<string, unknown>>("providerCapabilities");
      if (!bank) return 0;
      const providers = bank.providers as Record<string, Record<string, unknown>> | undefined;
      if (!providers) return 0;
      const providerKey =
        input.route.provider === "openai"
          ? "openai"
          : input.route.provider === "local"
            ? "local"
            : "gemini";
      const models = providers[providerKey]?.models as Record<string, Record<string, unknown>> | undefined;
      if (!models) return 0;
      const routeModel = String(input.route.model || "").trim();
      if (!routeModel) return 0;

      const exactEntry = models[routeModel];
      if (exactEntry && typeof exactEntry.maxInputTokens === "number") {
        return exactEntry.maxInputTokens;
      }

      const familyModel = toCostFamilyModel(routeModel);
      if (familyModel && familyModel !== routeModel) {
        const familyEntry = models[familyModel];
        if (familyEntry && typeof familyEntry.maxInputTokens === "number") {
          return familyEntry.maxInputTokens;
        }
      }

      for (const [pattern, entry] of Object.entries(models)) {
        if (!pattern.includes("*")) continue;
        const regex = new RegExp(
          `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
        );
        if (regex.test(routeModel) && typeof entry.maxInputTokens === "number") {
          return entry.maxInputTokens;
        }
      }
    } catch {
      // fail-open
    }
    return 0;
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
