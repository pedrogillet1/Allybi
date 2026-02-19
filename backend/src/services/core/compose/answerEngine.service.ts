// src/services/core/kodaAnswerEngineV3.service.ts
//
// KODA ANSWER ENGINE V3 (CLEAN + MAX DETAIL, DATA-BANK DRIVEN)
//
import { clamp } from "../../../utils";
// Goal (ChatGPT-like):
// - Turn (operator + scope + evidence) into a high-quality, doc-grounded answer.
// - Keep answers natural + varied (regenCount + variationSeed) WITHOUT hardcoded templates.
// - Never output "No relevant information found" to the user.
//   Instead: return reasonCodes + structured fallback hints for the fallback engine / quality gates.
// - Always produce: { content, attachments, meta } for the chat UI.
//
// This engine does NOT decide intent/operator (IntentEngine does) and does NOT do final UX routing
// between "no_docs / scoped_not_found / disambiguation / nav_pills" (AnswerModeRouter + QualityGates do).
// It focuses on: evidence → prompt → LLM → draft → composition → return.
//
// Banks used (typical):
// - prompts/prompt_registry.any.json
// - prompts/compose_answer_prompt.any.json
// - retrieval/semantic_search_config.any.json (via RetrievalEngine)
// - formatting/answer_style_policy.any.json (via Composer/Planner)
// - formatting/render_policy.any.json (via FinalAnswerGate / renderer)
// - quality/quality_gates.any.json (via FinalAnswerGate / QualityGates)
// - semantics/domain_ontology.any.json (domain-specific tone/format preferences)
// - retrieval/evidence_packaging.any.json (how to attach sources/buttons)
//
// Services expected to exist in your codebase:
// - KodaRetrievalEngineV3Service  (evidence retrieval)
// - AnswerComposerService         (final formatting, bolding, short paragraphs)
// - FinalAnswerGateService        (quality gates + adaptive fallbacks + json blocking)
// - SourceButtonsService          (build pills/buttons from evidence)
// - BankLoader / getBank          (loads bank JSONs)
//
// Notes:
// - Everything "policy-like" (tone, structure, format) should be bank-driven.
// - This file avoids hardcoded messages except for internal reason codes.
//
// -------------------------------------------------------------------------------------------------

import * as crypto from "crypto";
import { getBank } from "../banks/bankLoader.service";

// If you already have these types in src/types/, import them instead.
export type LanguageCode = "en" | "pt" | "es";
export type OutputShape =
  | "paragraph"
  | "bullets"
  | "numbered_list"
  | "table"
  | "file_list"
  | "button_only"
  | "quote"
  | "breadcrumbs"
  | "steps";

export interface ConversationState {
  conversationId: string;
  turnId: string;
  activeDocRef?: {
    docId?: string;
    filename?: string;
    lockType?: "hard" | "soft";
  };
}

export interface ScopeConstraints {
  hard?: {
    docIdAllowlist?: string[];
    filenameMustContain?: string[];
    docTypeAllowlist?: string[];
    docIdDenylist?: string[];
  };
  soft?: {
    docIdAllowlist?: string[];
    timeHint?: any;
    metricHint?: string[] | string;
    entityHint?: string[] | string;
    docTypePreference?: string[];
  };
  exclusions?: { excludeTokens?: string[] };
  notes?: string[];
}

export interface EvidenceChunk {
  docId: string;
  docTitle?: string;
  fileName?: string;
  docType?: string;

  chunkId?: string;
  score?: number;
  tags?: string[];

  // locations
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  slideNumber?: number;
  cellRange?: string;

  text: string;
}

export interface RetrievalResult {
  reasonCode?: string; // e.g. "scope_hard_constraints_empty", "no_relevant_chunks_in_scoped_docs"
  evidence: EvidenceChunk[];
  searchedDocIds?: string[];
  // optional stats for debugging/quality gates
  stats?: {
    docsConsidered?: number;
    chunksScored?: number;
    chunksReturned?: number;
  };
}

export interface SourceButton {
  documentId: string;
  title: string;
  filename?: string;
  mimeType?: string;
  location?: {
    type: "page" | "sheet" | "slide" | "cell" | "section";
    value: string | number;
    label?: string;
  };
}

export interface SourceButtonsAttachment {
  type: "source_buttons";
  answerMode?: string; // e.g. "nav_pills"
  buttons: SourceButton[];
  seeAll?: { label: string; totalCount: number; remainingCount: number };
}

export interface Attachment {
  type: string;
  [k: string]: any;
}

export interface ComposedResponse {
  content: string;
  attachments: Attachment[];
  language: LanguageCode;
  meta?: Record<string, any>;
}

export interface AnswerConstraints {
  outputShape?: OutputShape;
  exactBulletCount?: number;
  maxSentences?: number;
  requireTable?: boolean;
  requireSourceButtons?: boolean;
  maxFollowups?: number;
  userRequestedShort?: boolean;
}

export interface AnswerSignals {
  // format asks
  userAskedForQuote?: boolean;
  userAskedForTable?: boolean;
  userAskedForBullets?: boolean;
  userAskedForJson?: boolean;

  // query class
  numericIntent?: boolean;
  spreadsheetQuery?: boolean;
  calculationIntent?: boolean;
  discoveryQuery?: boolean;
  navQuery?: boolean;

  // grounding / evidence
  lowEvidence?: boolean;
  ocrLowConfidence?: boolean;

  // short profile
  shortOverview?: boolean;
  userRequestedShort?: boolean;

  // explicit doc ref detected upstream
  hasExplicitDocRef?: boolean;

  // any other signal keys
  [k: string]: any;
}

export interface DomainContext {
  topDomain?: string; // e.g. "finance_markets"
  confidence?: number;
  relatedDomains?: string[];
  formattingProfile?: string;
  retrievalProfile?: string;
}

export interface AnswerRequest {
  query: string;
  language: LanguageCode;

  // produced upstream
  operator: string; // summarize/extract/compute/compare/qa/open/locate_docs/etc.
  intentFamily: string;
  answerMode: string; // doc_grounded_single / doc_grounded_table / nav_pills / scoped_not_found / etc.

  // scope + state
  scope: ScopeConstraints;
  state: ConversationState;

  // signals + constraints
  signals: AnswerSignals;
  constraints: AnswerConstraints;

  // optional domain (from domain_detection)
  domain?: DomainContext;

  // regen
  regenCount?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  // if you support it:
  seed?: string;
}

export interface LLMClient {
  complete(
    messages: LLMMessage[],
    opts: LLMCompletionOptions,
  ): Promise<{ text: string }>;
}

// -------------------------------------------------------------------------------------------------
// Banks (minimal shapes)
// -------------------------------------------------------------------------------------------------

interface PromptRegistryBank {
  _meta: any;
  prompts: Record<
    string,
    {
      id: string;
      path: string;
      enabled?: boolean;
      // runtime defaults
      defaultTemperature?: number;
      defaultMaxTokens?: number;
    }
  >;
}

interface ComposeAnswerPromptBank {
  _meta: any;
  config: {
    enabled: boolean;
    // global defaults
    defaultTemperature: number;
    defaultMaxTokens: number;
    // how much evidence to include in prompt
    evidence: {
      maxCharsPerChunk: number;
      maxChunks: number;
      includeLocations: boolean;
    };
    // style hooks
    styleHooks: {
      requireShortParagraphs: boolean;
      maxSentencesPerParagraph: number;
      maxCharsPerParagraph: number;
      requireIntroConclusion: boolean;
      bulletMaxSentences: number;
      forbidJson: boolean;
    };
  };
  templates: {
    system: Record<LanguageCode, string>;
    user: Record<LanguageCode, string>;
  };
}

interface DomainOntologyBank {
  _meta: any;
  config: { enabled: boolean; defaultDomain: string };
  domains: Array<{
    id: string;
    retrievalProfile?: string;
    formattingProfile?: string;
    tone?: {
      // not “templates”, just style knobs
      preference?:
        | "neutral"
        | "formal"
        | "careful"
        | "clinical"
        | "numbers_first";
      avoidHype?: boolean;
      avoidLegalAdviceTone?: boolean;
    };
  }>;
}

// -------------------------------------------------------------------------------------------------
// Helpers: deterministic variation (regen) without hardcoded outputs
// -------------------------------------------------------------------------------------------------

function makeVariationSeed(
  conversationId: string,
  turnId: string,
  regenCount: number,
): string {
  return crypto
    .createHash("sha256")
    .update(`${conversationId}:${turnId}:${regenCount}`)
    .digest("hex")
    .slice(0, 12);
}

function seededRand(seed: string): () => number {
  let x = parseInt(seed.slice(0, 8), 16) || 123456;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// “ChatGPT-like” variation: small temperature modulation + optional phrasing variants inside prompt,
// but ALWAYS same facts because facts come from evidence.
function computeTemperature(
  base: number,
  variationSeed: string,
  regenCount: number,
): number {
  const r = seededRand(variationSeed)();
  const regenBoost = Math.min(0.08, regenCount * 0.03);
  const jitter = (r - 0.5) * 0.06; // [-0.03..+0.03]
  return clamp(base + jitter + regenBoost, 0.2, 0.85);
}

// clamp imported from ../../../utils

// -------------------------------------------------------------------------------------------------
// Core Answer Engine
// -------------------------------------------------------------------------------------------------

export class KodaAnswerEngineV3Service {
  private readonly promptRegistry: PromptRegistryBank;
  private readonly composePrompt: ComposeAnswerPromptBank;
  private readonly domainOntology?: DomainOntologyBank;

  // Inject your LLM + other services (or use DI container)
  constructor(
    private readonly llm: LLMClient,
    private readonly retrievalEngine: {
      retrieve(req: AnswerRequest): Promise<RetrievalResult>;
    },
    private readonly composer: {
      composeWithContext: (
        raw: string,
        ctx: any,
        sourceButtons?: SourceButtonsAttachment,
      ) => Promise<ComposedResponse> | ComposedResponse;
    },
    private readonly finalAnswerGate?: {
      run: (
        resp: ComposedResponse,
        req: AnswerRequest,
        retrieval: RetrievalResult,
      ) => Promise<ComposedResponse>;
    },
    private readonly sourceButtonsService?: {
      buildFromEvidence: (
        evidence: EvidenceChunk[],
        language: LanguageCode,
        maxDocs: number,
      ) => SourceButtonsAttachment | undefined;
    },
  ) {
    this.promptRegistry = getBank<PromptRegistryBank>("prompt_registry")!;
    this.composePrompt = getBank<ComposeAnswerPromptBank>(
      "compose_answer_prompt",
    )!;
    this.domainOntology = getBank<DomainOntologyBank>("domain_ontology");
  }

  // Main entry
  async answer(req: AnswerRequest): Promise<ComposedResponse> {
    const regenCount = req.regenCount ?? 0;
    const variationSeed = makeVariationSeed(
      req.state.conversationId,
      req.state.turnId,
      regenCount,
    );

    // 1) Retrieve evidence (scoped!)
    const retrieval = await this.retrievalEngine.retrieve(req);

    // If retrieval returned empty with a reasonCode, DO NOT fabricate.
    // Return a structured empty response that QualityGates/FallbackEngine can transform.
    if (!retrieval.evidence || retrieval.evidence.length === 0) {
      return this.emitEmptyForFallback(req, retrieval, { variationSeed });
    }

    // 2) Build LLM prompt messages (bank-driven)
    const messages = this.buildComposeMessages(req, retrieval.evidence, {
      variationSeed,
    });

    // 3) Run LLM
    const { temperature, maxTokens } = this.pickLLMParams(req, {
      variationSeed,
      regenCount,
    });
    const llmOut = await this.llm.complete(messages, {
      temperature,
      maxTokens,
      seed: variationSeed,
    });

    const draft = (llmOut.text || "").trim();

    // 4) Build source buttons from evidence (pills in UI)
    const sourceButtons = this.buildSourceButtons(req, retrieval.evidence);

    // 5) Compose (format + bold + paragraphization) using composer context
    const composerCtx = this.buildComposerContext(req, {
      variationSeed,
      regenCount,
    });

    const composed = await this.ensurePromise(
      this.composer.composeWithContext(draft, composerCtx, sourceButtons),
    );

    // 6) Run Quality Gates / Final Answer Gate (optional but recommended)
    if (this.finalAnswerGate) {
      return await this.finalAnswerGate.run(composed, req, retrieval);
    }

    return composed;
  }

  // -------------------------------------------------------------------------------------------------
  // Fallback handoff (never show "no relevant info")
  // -------------------------------------------------------------------------------------------------
  private emitEmptyForFallback(
    req: AnswerRequest,
    retrieval: RetrievalResult,
    meta: { variationSeed: string },
  ): ComposedResponse {
    // IMPORTANT: Keep content minimal; quality_gates + fallback banks should generate the user-facing text.
    // We provide machine-usable reason codes so the router can pick the correct adaptive UX.
    return {
      content: "",
      attachments: [],
      language: req.language,
      meta: {
        composedBy: "KodaAnswerEngineV3",
        variationSeed: meta.variationSeed,
        // Critical for fallback selection
        retrievalReasonCode:
          retrieval.reasonCode ?? "no_relevant_chunks_in_scoped_docs",
        answerMode: req.answerMode,
        operator: req.operator,
        intentFamily: req.intentFamily,
        scope: req.scope,
      },
    };
  }

  // -------------------------------------------------------------------------------------------------
  // Prompt building
  // -------------------------------------------------------------------------------------------------
  private buildComposeMessages(
    req: AnswerRequest,
    evidence: EvidenceChunk[],
    meta: { variationSeed: string },
  ): LLMMessage[] {
    if (!this.composePrompt?.config?.enabled) {
      // If prompt banks are missing, still avoid hardcoding a “voice”.
      // Return a minimal system+user prompt.
      return [
        {
          role: "system",
          content:
            "You are a document-grounded assistant. Answer only using provided evidence.",
        },
        {
          role: "user",
          content: `Question: ${req.query}\n\nEvidence:\n${this.renderEvidenceForPrompt(evidence, req.language, 6, 800)}`,
        },
      ];
    }

    const sysT =
      this.composePrompt.templates.system[req.language] ??
      this.composePrompt.templates.system.en;
    const userT =
      this.composePrompt.templates.user[req.language] ??
      this.composePrompt.templates.user.en;

    const domainStyle = this.resolveDomainStyle(req);

    // Evidence formatting for prompt (truncated)
    const eCfg = this.composePrompt.config.evidence;
    const evidenceText = this.renderEvidenceForPrompt(
      evidence,
      req.language,
      eCfg.maxChunks,
      eCfg.maxCharsPerChunk,
      eCfg.includeLocations,
    );

    // Insert variables into templates (simple placeholders)
    const sys = fillTemplate(sysT, {
      language: req.language,
      operator: req.operator,
      answerMode: req.answerMode,
      domain: domainStyle.domainId,
      domainTone: domainStyle.tone,
      formattingProfile: domainStyle.formattingProfile,
      requireShortParagraphs: String(
        this.composePrompt.config.styleHooks.requireShortParagraphs,
      ),
      maxSentencesPerParagraph: String(
        this.composePrompt.config.styleHooks.maxSentencesPerParagraph,
      ),
      maxCharsPerParagraph: String(
        this.composePrompt.config.styleHooks.maxCharsPerParagraph,
      ),
      requireIntroConclusion: String(
        this.composePrompt.config.styleHooks.requireIntroConclusion,
      ),
      bulletMaxSentences: String(
        this.composePrompt.config.styleHooks.bulletMaxSentences,
      ),
      forbidJson: String(this.composePrompt.config.styleHooks.forbidJson),
    });

    const user = fillTemplate(userT, {
      query: req.query,
      operator: req.operator,
      answerMode: req.answerMode,
      constraints: JSON.stringify(this.safeConstraintSummary(req.constraints)),
      signals: JSON.stringify(this.safeSignalSummary(req.signals)),
      evidence: evidenceText,
    });

    return [
      { role: "system", content: sys },
      { role: "user", content: user },
    ];
  }

  private renderEvidenceForPrompt(
    evidence: EvidenceChunk[],
    lang: LanguageCode,
    maxChunks: number,
    maxCharsPerChunk: number,
    includeLocations: boolean = true,
  ): string {
    const chunks = evidence.slice(0, maxChunks);

    const lines: string[] = [];
    for (const c of chunks) {
      const title = c.fileName || c.docTitle || c.docId;
      const loc = includeLocations ? this.formatLocation(c, lang) : "";
      const header = loc ? `[${title} — ${loc}]` : `[${title}]`;
      const body = truncate(c.text || "", maxCharsPerChunk);

      lines.push(`${header}\n${body}`);
    }
    return lines.join("\n\n");
  }

  private formatLocation(c: EvidenceChunk, lang: LanguageCode): string {
    // Keep it compact; UI shows exact location via source buttons anyway.
    const parts: string[] = [];
    if (typeof c.pageStart === "number") {
      parts.push(lang === "pt" ? `p. ${c.pageStart}` : `p. ${c.pageStart}`);
    }
    if (c.sheetName)
      parts.push(
        lang === "pt" ? `aba: ${c.sheetName}` : `sheet: ${c.sheetName}`,
      );
    if (typeof c.slideNumber === "number")
      parts.push(
        lang === "pt" ? `slide ${c.slideNumber}` : `slide ${c.slideNumber}`,
      );
    if (c.cellRange)
      parts.push(
        lang === "pt" ? `célula ${c.cellRange}` : `cell ${c.cellRange}`,
      );
    return parts.join(", ");
  }

  private safeConstraintSummary(constraints: AnswerConstraints) {
    // Never pass huge nested objects to prompt; keep short and stable.
    return {
      outputShape: constraints.outputShape,
      exactBulletCount: constraints.exactBulletCount,
      maxSentences: constraints.maxSentences,
      requireTable: constraints.requireTable,
      userRequestedShort: constraints.userRequestedShort,
    };
  }

  private safeSignalSummary(signals: AnswerSignals) {
    // Keep short; the banks drive most behavior.
    return {
      userAskedForQuote: !!signals.userAskedForQuote,
      userAskedForTable: !!signals.userAskedForTable,
      userAskedForBullets: !!signals.userAskedForBullets,
      userAskedForJson: !!signals.userAskedForJson,
      numericIntent: !!signals.numericIntent,
      discoveryQuery: !!signals.discoveryQuery,
      navQuery: !!signals.navQuery,
      hasExplicitDocRef: !!signals.hasExplicitDocRef,
      shortOverview: !!signals.shortOverview || !!signals.userRequestedShort,
    };
  }

  // -------------------------------------------------------------------------------------------------
  // Domain style resolution (tone/format)
  // -------------------------------------------------------------------------------------------------
  private resolveDomainStyle(req: AnswerRequest): {
    domainId: string;
    formattingProfile: string;
    tone: string;
  } {
    const defaultDomain =
      this.domainOntology?.config?.defaultDomain ?? "general";
    const domainId = req.domain?.topDomain ?? defaultDomain;

    const found = this.domainOntology?.domains?.find((d) => d.id === domainId);

    // formattingProfile influences prompt instructions (NOT templates)
    const formattingProfile =
      req.domain?.formattingProfile ?? found?.formattingProfile ?? "default";

    // tone is a guidance label; composer/render_policy enforce the *structure*
    const tone =
      found?.tone?.preference ??
      (domainId.startsWith("medical")
        ? "clinical"
        : domainId.startsWith("finance")
          ? "numbers_first"
          : "neutral");

    return { domainId, formattingProfile, tone };
  }

  // -------------------------------------------------------------------------------------------------
  // LLM params
  // -------------------------------------------------------------------------------------------------
  private pickLLMParams(
    req: AnswerRequest,
    meta: { variationSeed: string; regenCount: number },
  ) {
    const baseTemp = this.composePrompt?.config?.defaultTemperature ?? 0.35;
    const baseMax = this.composePrompt?.config?.defaultMaxTokens ?? 900;

    // Short answers: lower tokens
    const short =
      !!req.constraints.userRequestedShort ||
      !!req.signals.shortOverview ||
      (req.constraints.maxSentences && req.constraints.maxSentences <= 3);
    const maxTokens = short ? Math.min(baseMax, 360) : baseMax;

    const temperature = computeTemperature(
      baseTemp,
      meta.variationSeed,
      meta.regenCount,
    );

    return { temperature, maxTokens };
  }

  // -------------------------------------------------------------------------------------------------
  // Source buttons / attachments
  // -------------------------------------------------------------------------------------------------
  private buildSourceButtons(
    req: AnswerRequest,
    evidence: EvidenceChunk[],
  ): SourceButtonsAttachment | undefined {
    // Nav pills are handled elsewhere; but doc-grounded answers still show up to N sources.
    const maxDocs = 3;

    if (this.sourceButtonsService) {
      return this.sourceButtonsService.buildFromEvidence(
        evidence,
        req.language,
        maxDocs,
      );
    }

    // Minimal fallback implementation if SourceButtonsService is missing
    const uniqueDocs = new Map<string, EvidenceChunk>();
    for (const e of evidence) {
      if (!uniqueDocs.has(e.docId)) uniqueDocs.set(e.docId, e);
      if (uniqueDocs.size >= maxDocs) break;
    }

    const buttons: SourceButton[] = [];
    for (const e of uniqueDocs.values()) {
      buttons.push({
        documentId: e.docId,
        title: e.fileName || e.docTitle || e.docId,
        filename: e.fileName,
        mimeType: e.docType,
        location: bestLocation(e, req.language),
      });
    }

    return buttons.length ? { type: "source_buttons", buttons } : undefined;
  }

  // -------------------------------------------------------------------------------------------------
  // Composer context (bank-driven formatting happens there)
  // -------------------------------------------------------------------------------------------------
  private buildComposerContext(
    req: AnswerRequest,
    meta: { variationSeed: string; regenCount: number },
  ) {
    return {
      operator: req.operator,
      intentFamily: req.intentFamily,
      language: req.language,
      originalQuery: req.query,

      regenCount: meta.regenCount,
      variationSeed: meta.variationSeed,

      docScope: {
        type: req.scope?.hard?.docIdAllowlist?.length ? "filtered" : "all",
        documentIds: req.scope?.hard?.docIdAllowlist,
        description: req.scope?.hard?.filenameMustContain?.join(", "),
      },

      domain: req.domain?.topDomain ?? null,

      constraints: {
        outputShape: req.constraints.outputShape,
        exactBulletCount: req.constraints.exactBulletCount,
        maxSentences: req.constraints.maxSentences,
        requireTable: req.constraints.requireTable,
        requireSourceButtons: req.constraints.requireSourceButtons ?? true,
        maxFollowups: req.constraints.maxFollowups ?? 1,
        userRequestedShort: req.constraints.userRequestedShort,
      },
    };
  }

  private async ensurePromise<T>(v: Promise<T> | T): Promise<T> {
    return v instanceof Promise ? await v : v;
  }
}

// -------------------------------------------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------------------------------------------

function truncate(s: string, max: number) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function fillTemplate(tpl: string, vars: Record<string, string>) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(
      new RegExp(`\\{\\{\\s*${escapeRegExp(k)}\\s*\\}\\}`, "g"),
      v,
    );
  }
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bestLocation(
  e: EvidenceChunk,
  lang: LanguageCode,
): SourceButton["location"] | undefined {
  if (typeof e.pageStart === "number") {
    return {
      type: "page",
      value: e.pageStart,
      label: lang === "pt" ? `Página ${e.pageStart}` : `Page ${e.pageStart}`,
    };
  }
  if (e.sheetName && e.cellRange) {
    return {
      type: "cell",
      value: `${e.sheetName}!${e.cellRange}`,
      label:
        lang === "pt"
          ? `${e.sheetName} ${e.cellRange}`
          : `${e.sheetName} ${e.cellRange}`,
    };
  }
  if (e.sheetName)
    return {
      type: "sheet",
      value: e.sheetName,
      label: lang === "pt" ? `Aba ${e.sheetName}` : `Sheet ${e.sheetName}`,
    };
  if (typeof e.slideNumber === "number")
    return {
      type: "slide",
      value: e.slideNumber,
      label: `Slide ${e.slideNumber}`,
    };
  return undefined;
}
