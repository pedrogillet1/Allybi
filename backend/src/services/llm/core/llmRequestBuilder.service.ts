// src/services/llm/core/llmRequestBuilder.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  LangCode,
} from "../types/llm.types";

import { BRAND_NAME } from "../../../config/brand";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

/**
 * Prompt registry interface (your service already exists).
 */
export interface PromptRegistryService {
  buildPrompt(
    promptId: "system" | "retrieval" | "compose_answer" | "disambiguation" | "fallback" | "tool",
    ctx: any
  ): { id: string; messages: Array<{ role: "system" | "developer" | "user"; content: string }> };
}

/**
 * Minimal evidence pack interface used by builder.
 * (Keep it small; we do not dump large evidence.)
 */
export interface EvidencePackLike {
  query?: { original?: string; normalized?: string };
  scope?: { activeDocId?: string | null; explicitDocLock?: boolean };
  stats?: { evidenceItems?: number; uniqueDocsInEvidence?: number; topScore?: number | null; scoreGap?: number | null };
  evidence: Array<{
    docId: string;
    title?: string | null;
    filename?: string | null;
    location?: { page?: number | null; sheet?: string | null; slide?: number | null; sectionKey?: string | null };
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
    const maxQuestions = typeof input.signals.maxQuestions === "number" ? input.signals.maxQuestions : 1;

    // Determine prompt type
    const promptType = this.choosePromptType(input);

    // Build prompt context
    const promptCtx = this.buildPromptContext(input, promptType, maxQuestions);

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
      content: this.buildUserPayload(input),
    });

    // Generation options (streaming by default, ChatGPT-like)
    const options: LlmGenerationOptions = {
      stream: true,
      deterministic: input.route.stage === "final",
      temperature: input.route.stage === "final" ? 0.2 : 0.4,
      topP: 0.9,
      maxOutputTokens: input.route.stage === "final" ? 900 : 700,
      ...input.options,
    };

    // Special case: nav_pills should be short and fast
    if (input.signals.answerMode === "nav_pills") {
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
      options.maxOutputTokens = Math.min(options.maxOutputTokens ?? 600, 500);
    }

    return {
      route: input.route,
      messages,
      options,
      correlationId: input.route?.constraints?.maxLatencyMs ? undefined : undefined,
      cacheKeyHint: this.cacheKeyHint(input, promptType),
      kodaMeta: {
        promptType,
        answerMode: input.signals.answerMode,
        operator: input.signals.operator,
        intentFamily: input.signals.intentFamily,
        reasonCodes: input.signals.fallback?.reasonCode ? [input.signals.fallback.reasonCode] : [],
      },
    };
  }

  // -------------------------
  // Prompt selection
  // -------------------------

  private choosePromptType(input: BuildRequestInput): "system" | "retrieval" | "compose_answer" | "disambiguation" | "fallback" | "tool" {
    // Disambiguation always wins
    if (input.signals.disambiguation?.active) return "disambiguation";

    // File actions can use tool prompt shape
    if (input.signals.operatorFamily === "file_actions" && input.toolContext) return "tool";

    // Fallback triggered
    if (input.signals.fallback?.triggered) return "fallback";

    // Default compose prompt for normal doc-grounded answers
    return "compose_answer";
  }

  private buildPromptContext(input: BuildRequestInput, promptType: string, maxQuestions: number) {
    const evidenceStats = input.evidencePack?.stats ?? {};
    const evidenceSummary = input.evidencePack
      ? {
          evidenceCount: Number(evidenceStats.evidenceItems ?? input.evidencePack.evidence?.length ?? 0),
          uniqueDocs: Number(evidenceStats.uniqueDocsInEvidence ?? new Set(input.evidencePack.evidence.map((e) => e.docId)).size),
          topScore: evidenceStats.topScore ?? null,
          hasTables: input.evidencePack.evidence.some((e) => e.evidenceType === "table"),
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

      disambiguation: input.signals.disambiguation
        ? {
            active: true,
            candidateType: input.signals.disambiguation.candidateType,
            options: input.signals.disambiguation.options.map((o) => ({ id: o.id, label: o.label })),
          }
        : { active: false },

      fallback: input.signals.fallback ?? { triggered: false },

      constraints: {
        maxQuestions,
        maxOptions: input.signals.disambiguation?.maxOptions ?? 4,
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

  private buildUserPayload(input: BuildRequestInput): string {
    const parts: string[] = [];

    // Memory context (bounded, already packed)
    if (input.memoryPack?.contextText) {
      parts.push(input.memoryPack.contextText.trim());
    }

    // Evidence context: compact “Evidence” section (do not dump everything)
    if (input.evidencePack && Array.isArray(input.evidencePack.evidence) && input.evidencePack.evidence.length) {
      parts.push(this.renderEvidenceForPrompt(input.evidencePack));
    }

    // Disambiguation options (if active) — keep minimal; prompt handles rendering policy
    if (input.signals.disambiguation?.active) {
      const opts = input.signals.disambiguation.options.slice(0, input.signals.disambiguation.maxOptions);
      parts.push(
        [
          "### Options",
          ...opts.map((o, i) => `- (${i + 1}) ${o.label}`),
        ].join("\n")
      );
    }

    // Tool context (file actions)
    if (input.toolContext) {
      parts.push(
        [
          "### Tool Context",
          `toolName: ${input.toolContext.toolName}`,
          input.toolContext.toolArgs ? `toolArgs: ${JSON.stringify(input.toolContext.toolArgs)}` : "",
        ].filter(Boolean).join("\n")
      );
    }

    // Finally the user message
    parts.push(`### User\n${input.userText.trim()}`);

    return parts.join("\n\n").trim();
  }

  private renderEvidenceForPrompt(pack: EvidencePackLike): string {
    // Keep compact: top 8 evidence items max (enough for grounding, not a dump)
    const top = pack.evidence.slice(0, 8);

    const lines: string[] = [];
    lines.push("### Evidence (use only this)");
    for (const e of top) {
      const title = e.title || e.filename || e.docId;
      const loc = e.location?.page != null
        ? `p.${e.location.page}`
        : e.location?.slide != null
        ? `s.${e.location.slide}`
        : e.location?.sheet
        ? `sheet:${e.location.sheet}`
        : e.location?.sectionKey
        ? `sec:${e.location.sectionKey}`
        : "";

      const snippet = (e.snippet || "").trim().replace(/\s+/g, " ");
      // Keep snippet short
      const clipped = snippet.length > 260 ? snippet.slice(0, 259) + "…" : snippet;

      lines.push(`- [${title}]${loc ? ` (${loc})` : ""}: ${clipped}`);
    }

    return lines.join("\n");
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
}

export default LlmRequestBuilderService;
