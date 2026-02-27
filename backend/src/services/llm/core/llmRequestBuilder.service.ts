// src/services/llm/core/llmRequestBuilder.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { BRAND_NAME } from "../../../config/brand";
import { resolveOutputTokenBudget } from "../../core/enforcement/tokenBudget.service";

export type LangCode = "any" | "en" | "pt" | "es";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

/**
 * Prompt registry interface (your service already exists).
 */
export interface PromptRegistryService {
  buildPrompt(
    promptId:
      | "system"
      | "retrieval"
      | "compose_answer"
      | "disambiguation"
      | "fallback"
      | "tool",
    ctx: any,
  ): {
    id?: string;
    messages: Array<{ role: "system" | "developer" | "user"; content: string }>;
    trace?: {
      orderedPrompts?: Array<{
        bankId: string;
        version: string;
        templateId: string;
        hash: string;
      }>;
      appliedGuards?: string[];
      slotsFilled?: string[];
    };
  };
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
    score?: { finalScore?: number };
    evidenceType?: "text" | "table" | "image";
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
    intentFamily?: string | null;
    operator?: string | null;
    operatorFamily?: string | null;

    // constraints / policies
    disallowJsonOutput?: boolean;
    maxQuestions?: number;

    // doc grounding
    explicitDocLock?: boolean;
    activeDocId?: string | null;

    // fallback/disambiguation
    fallback?: { triggered: boolean; reasonCode?: string | null };
    disambiguation?: DisambiguationPayload | null;

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
  toolContext?: { toolName: string; toolArgs?: any } | null;

  // Optional overrides
  options?: Partial<LlmGenerationOptions>;
}

export class LlmRequestBuilderService {
  constructor(private readonly prompts: PromptRegistryService) {}

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

    messages.push({
      role: "user",
      content: this.buildUserPayload(input, disambiguationSignal),
    });

    const answerMode = input.signals.answerMode;
    const outputBudget = resolveOutputTokenBudget({
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
    });
    const maxOutputTokens = outputBudget.maxOutputTokens;

    // Generation options (streaming by default, ChatGPT-like)
    const options: LlmGenerationOptions = {
      stream: true,
      deterministic: input.route.stage === "final",
      temperature: input.route.stage === "final" ? 0.2 : 0.4,
      topP: 0.9,
      maxOutputTokens,
      ...input.options,
    };

    // Special case: nav_pills should be short and fast
    if (answerMode === "nav_pills") {
      options.temperature = 0.2;
      options.maxOutputTokens = Math.min(options.maxOutputTokens ?? 300, 220);
    }

    // Special case: disambiguation must be short
    if (promptType === "disambiguation") {
      options.temperature = 0.2;
      options.maxOutputTokens = Math.min(options.maxOutputTokens ?? 300, 220);
    }

    // Special case: quote mode often needs strictness, but keep length bounded
    if (input.signals.operator === "quote") {
      options.temperature = 0.15;
      options.maxOutputTokens = Math.min(
        options.maxOutputTokens ?? outputBudget.maxOutputTokens,
        outputBudget.hardOutputTokens,
      );
    }

    return {
      route: input.route,
      messages,
      options,
      correlationId: input.route?.constraints?.maxLatencyMs
        ? undefined
        : undefined,
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
        provenanceSchemaVersion: "v1",
        evidenceMap: this.buildEvidenceMapMetadata(input.evidencePack),
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

    // Retrieval planning flows
    if (
      input.signals.operator === "locate_docs" ||
      input.signals.operator === "locate_content" ||
      input.signals.intentFamily === "retrieval"
    ) {
      return "retrieval";
    }

    // File actions can use tool prompt shape
    if (input.signals.operatorFamily === "file_actions" && input.toolContext)
      return "tool";

    // Fallback triggered
    if (input.signals.fallback?.triggered) return "fallback";

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

    return {
      env: input.env,
      outputLanguage: input.outputLanguage,

      answerMode: input.signals.answerMode,
      intentFamily: input.signals.intentFamily,
      operator: input.signals.operator,
      operatorFamily: input.signals.operatorFamily,

      explicitDocLock: Boolean(input.signals.explicitDocLock),
      activeDocId: input.signals.activeDocId ?? null,

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

      constraints: {
        maxQuestions,
        maxOptions: disambiguationSignal?.maxOptions ?? 4,
        disallowJsonOutput: input.signals.disallowJsonOutput !== false,
        navPillsStrict: input.signals.answerMode === "nav_pills",
        numericStrict: false,
        quoteStrict: input.signals.operator === "quote",
      },

      // Interpolated into bank-driven prompt templates (e.g. {{brandName}}).
      slots: {
        brandName: BRAND_NAME,
      },
    };
  }

  // -------------------------
  // User payload construction
  // -------------------------

  private buildUserPayload(
    input: BuildRequestInput,
    disambiguationSignal: DisambiguationPayload | null,
  ): string {
    const parts: string[] = [];

    // Memory context (bounded, already packed)
    if (input.memoryPack?.contextText) {
      parts.push(input.memoryPack.contextText.trim());
    }

    // Evidence context: compact “Evidence” section (do not dump everything)
    if (
      input.evidencePack &&
      Array.isArray(input.evidencePack.evidence) &&
      input.evidencePack.evidence.length
    ) {
      parts.push(
        this.renderEvidenceForPrompt(input.evidencePack, {
          isExtractionQuery: input.signals.isExtractionQuery,
          answerMode: input.signals.answerMode,
        }),
      );
    }

    // Disambiguation options (if active) — keep minimal; prompt handles rendering policy
    if (disambiguationSignal?.active) {
      const opts = disambiguationSignal.options.slice(
        0,
        disambiguationSignal.maxOptions,
      );
      parts.push(
        ["### Options", ...opts.map((o, i) => `- (${i + 1}) ${o.label}`)].join(
          "\n",
        ),
      );
    }

    // Tool context (file actions)
    if (input.toolContext) {
      parts.push(
        [
          "### Tool Context",
          `toolName: ${input.toolContext.toolName}`,
          input.toolContext.toolArgs
            ? `toolArgs: ${JSON.stringify(input.toolContext.toolArgs)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    // Finally the user message
    parts.push(`### User\n${input.userText.trim()}`);

    return parts.join("\n\n").trim();
  }

  private renderEvidenceForPrompt(
    pack: EvidencePackLike,
    opts?: { isExtractionQuery?: boolean; answerMode?: string },
  ): string {
    // Dynamic evidence budget: extraction + multi-doc queries get more items + longer snippets
    const isMultiDoc = opts?.answerMode === "doc_grounded_multi";
    const wideContext = isMultiDoc || opts?.isExtractionQuery;
    const maxItems = wideContext ? 16 : 8;
    const maxSnippetChars = wideContext ? 520 : 260;

    const top = pack.evidence.slice(0, maxItems);

    const lines: string[] = [];
    const header = isMultiDoc
      ? "### Evidence (use only this — synthesize information from all relevant documents below)"
      : "### Evidence (use only this — answer the specific question, not a generic overview)";
    lines.push(header);
    for (const e of top) {
      const title = e.title || e.filename || e.docId;
      const loc =
        e.location?.page != null
          ? `p.${e.location.page}`
          : e.location?.slide != null
            ? `s.${e.location.slide}`
            : e.location?.sheet
              ? `sheet:${e.location.sheet}`
              : e.location?.sectionKey
                ? `sec:${e.location.sectionKey}`
                : "";
      const locationKey = String(
        e.locationKey || loc || `${e.docId}:${e.evidenceType || "text"}`,
      ).trim();
      const evidenceId = `${e.docId}:${locationKey}`;

      const snippet = (e.snippet || "").trim().replace(/\s+/g, " ");
      const clipped =
        snippet.length > maxSnippetChars
          ? snippet.slice(0, maxSnippetChars - 1) + "…"
          : snippet;

      lines.push(
        `- evidenceId=${evidenceId} | documentId=${e.docId} | locationKey=${locationKey} | title=${title}${loc ? ` | location=${loc}` : ""} | snippet=${clipped}`,
      );
    }

    return lines.join("\n");
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
