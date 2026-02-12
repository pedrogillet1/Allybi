// src/services/core/kodaOrchestratorV3.service.ts
// CLEAN ORCHESTRATOR (v3) — centralized, modular, ChatGPT-like behavior.
// Goal: Orchestrator is an "air traffic controller" only. No business logic here.
// All logic lives in engines/services + data_banks.
// - intent → query rewrite → scope → candidates → retrieval → rank/ambiguity → mode → compose → render → quality gates → state update
// - Never emit "No relevant information found" as the final UX.
// - Always return adaptive next-step guidance (fallback engine) when scoped retrieval is empty.
// - Regeneration always produces a *different* output phrasing/structure (same facts), by passing regenCount + variationSeed.

import crypto from "crypto";
import prisma from '../../../config/database';
import {
  extractUsedDocuments,
  filterSourceButtonsByUsage,
  type EvidenceChunkForFiltering,
  type SourceButtonsAttachment as SourceButtonsAttachmentType,
} from '../retrieval/sourceButtons.service';

// ---------- Types (keep minimal & stable) ----------
export type LanguageCode = "en" | "pt" | "es";
export type AnswerMode =
  | "no_docs"
  | "scoped_not_found"
  | "refusal"
  | "nav_pills"
  | "rank_disambiguate"
  | "rank_autopick"
  | "doc_grounded_single"
  | "doc_grounded_table"
  | "doc_grounded_quote"
  | "doc_grounded_multi"
  | "doc_discovery_list"
  | "help_steps"
  | "general_answer";

export type OutputShape = "paragraph" | "bullets" | "numbered_list" | "table" | "file_list" | "button_only";

export interface SourceButton {
  documentId: string;
  title: string;
  filename?: string;
  mimeType?: string;
  location?: { type: "page" | "slide" | "sheet" | "cell" | "section"; value: string | number; label?: string };
}

export interface SourceButtonsAttachment {
  type: "source_buttons";
  answerMode?: string; // frontend uses this to hide Sources label for nav_pills
  buttons: SourceButton[];
  seeAll?: { label: string; totalCount: number; remainingCount: number };
}

export interface FileListAttachment {
  type: "file_list";
  items: Array<{ documentId: string; filename: string; mimeType?: string; folderPath?: string; size?: number }>;
  totalCount: number;
  seeAll?: { label: string; totalCount: number; remainingCount: number };
}

export type Attachment = SourceButtonsAttachment | FileListAttachment | Record<string, any>;

export interface ConversationState {
  activeDocRef?: { docId?: string; filename?: string; lockType?: "hard" | "soft"; ttlTurns?: number };
  lastDisambiguation?: { chosenDocId?: string; chosenDocName?: string };
  // keep state minimal; other fields live elsewhere
}

export interface ChatTurnRequest {
  conversationId: string;
  turnId: string;
  userId: string;

  text: string;

  // regen
  regenCount?: number;

  // client/user prefs
  userPrefs?: {
    language?: LanguageCode;
    noQuotes?: boolean;
    noFollowups?: boolean;
  };

  // current state (loaded by API layer)
  state?: ConversationState;

  // optional: current doc inventory snapshot (to avoid reloading)
  docIndex?: DocIndexSnapshot;

  // debug
  debug?: boolean;
  env?: "production" | "staging" | "dev" | "local";
}

export interface ChatTurnResponse {
  content: string;
  attachments?: Attachment[];
  answerMode: AnswerMode;
  language: LanguageCode;

  // new state to persist
  newState?: ConversationState;

  meta?: {
    operator?: string;
    intentFamily?: string;
    domain?: string | null;
    trace?: any;
    regenCount?: number;
    variationSeed?: string;
  };
}

// ---------- Core pipeline contracts (services you already have or should have) ----------
export interface IntentResult {
  intentFamily: "documents" | "file_actions" | "doc_stats" | "help" | "conversation" | "editing" | "connectors" | "email" | "error";
  operator: string; // e.g. summarize/extract/open/list/locate_docs/quote/compare/compute/capabilities/greeting
  confidence: number;
  signals: Record<string, any>; // discoveryQuery, userAskedForTable, userAskedForQuote, shortOverview, etc.
  constraints: {
    outputShape?: OutputShape;
    exactBulletCount?: number;
    maxSentences?: number;
    requireTable?: boolean;
    requireSourceButtons?: boolean;
    userRequestedShort?: boolean;
  };
}

export interface QueryRewriteResult {
  rewrittenText: string;
  hints: {
    docRefs: { docIds: string[]; filenames: string[] };
    time?: { confidence: number; normalized?: any };
    numeric?: any;
    formatHints?: any;
    domain?: { confidence: number; topDomain?: string };
  };
  tokens: {
    tokensNonStopword: string[];
  };
  signals: Record<string, any>;
}

export interface ScopeResolutionResult {
  hard: {
    docIdAllowlist?: string[];
    filenameMustContain?: string[];
    docTypeAllowlist?: string[];
    docIdDenylist?: string[];
  };
  soft: {
    docIdAllowlist?: string[];
    timeHint?: any;
    metricHint?: string[];
    entityHint?: string[];
    docTypePreference?: string[];
  };
  exclusions?: { excludeTokens?: string[] };
  notes?: string[];
}

export interface Candidate {
  docId: string;
  fileName: string;
  docTitle?: string;
  docType?: string;
  uploadedAt?: string;
  // add more if needed
}

export interface CandidateFilterResult {
  candidates: Candidate[];
  hardConstraintApplied: boolean;
  hardConstraintEmpty: boolean;
  hardConstraintReason?: string;
  filterNotes: string[];
}

export interface RetrievalEvidence {
  docId: string;
  fileName: string;
  docType?: string;
  chunkId?: string;
  text: string;
  score: number;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  slideNumber?: number;
  cellRange?: string;
  tags?: string[];
}

export interface RetrievalResult {
  candidatesSearched: Candidate[];
  evidence: RetrievalEvidence[];
  topDocs: Array<{ docId: string; fileName: string; score: number; margin?: number }>;
  stats: {
    docCountTotal: number; // total docs in index
    candidateCount: number;
    topScore: number;
    margin: number;
    ocrDominant?: boolean;
    reasonCodeIfEmpty?: "scope_hard_constraints_empty" | "no_relevant_chunks_in_scoped_docs" | "indexing" | "extraction_failed";
  };
}

export interface RankingDecision {
  candidateCount: number;
  topScore: number;
  margin: number;
  autopick: boolean;
  ambiguous: boolean;
  chosenDocId?: string;
  chosenFileName?: string;
  candidatesTopN?: Array<{ docId: string; fileName: string; score: number }>;
}

export interface AnswerModeDecision {
  mode: AnswerMode;
  reason: string;
  navType?: "open" | "where" | "discover" | "disambiguate" | "not_found";
}

export interface GroundingVerdict {
  verdict: "pass" | "pass_with_warning" | "fail_soft" | "fail_hard";
  reasons: string[];
  recommendedAction: string; // proceed | ask_one_clarification | emit_adaptive_failure_message | retry_retrieval_then_regen ...
}

export interface QualityGateResult {
  ok: boolean;
  actions: Array<{ id: string; type: "transform" | "route"; notes?: string; priority?: "high" | "medium" | "low" }>;
  transformedText?: string;
  routedResponse?: { answerMode: AnswerMode; content: string; attachments?: Attachment[] };
  requiresRetry?: boolean;
  retryHint?: { retrievalMode?: string; regenHint?: string };
  trace?: any;
}

export interface DocIndexSnapshot {
  docCount: number;
  candidates: Candidate[];
  indexingInProgress?: boolean;
  lastUpdatedAt?: string;
}

// ---------- Dependencies (inject via container) ----------
export interface OrchestratorDeps {
  // data/inventory
  docIndexService: { getSnapshot(userId: string): Promise<DocIndexSnapshot> };

  // normalization, intent, routing
  queryNormalizer: { normalize(text: string): string };
  intentEngine: { resolve(input: { text: string; languageHint?: LanguageCode; state?: ConversationState }): Promise<IntentResult> };
  queryRewriter: { rewrite(input: { text: string; intent: IntentResult; state?: ConversationState }): Promise<QueryRewriteResult> };

  // scope + candidates + retrieval
  scopeResolver: { resolve(input: { rewrite: QueryRewriteResult; intent: IntentResult; state?: ConversationState }): Promise<ScopeResolutionResult> };
  candidateFilters: { apply(input: { scope: ScopeResolutionResult; candidates: Candidate[] }): Promise<CandidateFilterResult> };
  retrievalEngine: {
    retrieve(input: {
      query: QueryRewriteResult;
      scope: ScopeResolutionResult;
      candidates: Candidate[];
      intent: IntentResult;
      state?: ConversationState;
    }): Promise<RetrievalResult>;
  };

  // ranking + answer mode
  ranker: { decide(input: { retrieval: RetrievalResult; intent: IntentResult; scope: ScopeResolutionResult; state?: ConversationState }): Promise<RankingDecision> };
  answerModeRouter: {
    route(input: {
      intent: IntentResult;
      scope: ScopeResolutionResult;
      retrieval: RetrievalResult;
      ranking: RankingDecision;
      state?: ConversationState;
      docIndex: DocIndexSnapshot;
    }): Promise<AnswerModeDecision>;
  };

  // answer generation + formatting
  answerEngine: {
    generate(input: {
      mode: AnswerModeDecision;
      intent: IntentResult;
      query: QueryRewriteResult;
      scope: ScopeResolutionResult;
      retrieval: RetrievalResult;
      ranking: RankingDecision;
      language: LanguageCode;
      variationSeed: string;
      regenCount: number;
    }): Promise<{ draft: string; attachments?: Attachment[]; usedDocs?: string[] }>;
  };

  renderPolicy: {
    apply(input: { text: string; answerMode: AnswerMode; navType?: string; plannedBlocks?: string[]; language: LanguageCode }): Promise<{ text: string }>;
  };

  docGroundingChecks: {
    check(input: {
      answerMode: AnswerMode;
      intent: IntentResult;
      scope: ScopeResolutionResult;
      retrieval: RetrievalResult;
      draftText: string;
      chosenDocId?: string;
    }): Promise<GroundingVerdict>;
  };

  qualityGates: {
    run(input: {
      env: "production" | "staging" | "dev" | "local";
      answerMode: AnswerMode;
      intent: IntentResult;
      scope: ScopeResolutionResult;
      retrieval: RetrievalResult;
      ranking: RankingDecision;
      state?: ConversationState;
      answerText: string;
      attachments?: Attachment[];
      language: LanguageCode;
    }): Promise<QualityGateResult>;
  };

  fallbackEngine: {
    emit(input: {
      reasonCode:
        | "no_docs_indexed"
        | "scope_hard_constraints_empty"
        | "no_relevant_chunks_in_scoped_docs"
        | "indexing_in_progress"
        | "extraction_failed"
        | "permissions"
        | "unknown";
      language: LanguageCode;
      context?: Record<string, any>;
    }): Promise<{ content: string; answerMode: AnswerMode; attachments?: Attachment[] }>;
  };

  // state update
  stateUpdater: {
    apply(input: {
      state?: ConversationState;
      intent: IntentResult;
      scope: ScopeResolutionResult;
      ranking: RankingDecision;
      mode: AnswerModeDecision;
      finalResponse: { content: string; answerMode: AnswerMode; attachments?: Attachment[] };
    }): Promise<ConversationState>;
  };

  // composer finalization (markdown normalize + bolding + final trim)
  answerComposer: {
    finalizeOutput(
      draft: string,
      context: {
        operator: string;
        intentFamily: string;
        originalQuery: string;
        constraints: IntentResult["constraints"];
      },
      meta: { answerMode: AnswerMode }
    ): { content: string; meta?: any };
  };

  // conversation microcopy (must be VARIED, not one hardcoded line)
  conversationMessages: {
    reply(input: { operator: string; language: LanguageCode; variationSeed: string; regenCount: number }): Promise<string>;
  };

  // logging/tracing
  tracer?: { startSpan(name: string, data?: any): any; endSpan(span: any, data?: any): void };
}

// ---------- Helper: stable variation seed ----------
function makeVariationSeed(conversationId: string, turnId: string, regenCount: number): string {
  return crypto
    .createHash("sha256")
    .update(`${conversationId}:${turnId}:${regenCount}`)
    .digest("hex")
    .slice(0, 12);
}

// ---------- Helper: emit query telemetry (fire-and-forget) ----------
interface TelemetryData {
  queryId: string;
  userId: string;
  conversationId?: string;
  messageId?: string;
  intent: string;
  intentConfidence: number;
  domain?: string;
  operator?: string;
  keywords?: string[];
  chunksReturned?: number;
  topScore?: number;
  docScopeApplied?: boolean;
  hadFallback?: boolean;
  answerMode?: string;
  totalMs?: number;
}

function emitQueryTelemetry(data: TelemetryData): void {
  // Fire-and-forget - don't await, don't block response
  prisma.queryTelemetry.create({
    data: {
      queryId: data.queryId,
      userId: data.userId,
      conversationId: data.conversationId,
      messageId: data.messageId,
      timestamp: new Date(),
      intent: data.intent,
      intentConfidence: data.intentConfidence,
      domain: data.domain ?? 'general',
      family: data.operator,
      matchedKeywords: data.keywords ?? [],
      chunksReturned: data.chunksReturned ?? 0,
      topRelevanceScore: data.topScore,
      retrievalAdequate: (data.topScore ?? 0) >= 0.5,
      hadFallback: data.hadFallback ?? false,
      totalMs: data.totalMs,
    },
  }).catch(err => {
    // Tests may run without a clean DB; avoid noisy "Cannot log after tests are done".
    if (process.env.NODE_ENV === 'test') return;
    console.error('[Telemetry] Failed to emit query telemetry:', err.message);
  });
}

// ---------- Orchestrator ----------
export class KodaOrchestratorV3Service {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handleTurn(req: ChatTurnRequest): Promise<ChatTurnResponse> {
    const startTime = Date.now();
    const env = req.env ?? "local";
    const regenCount = req.regenCount ?? 0;
    const variationSeed = makeVariationSeed(req.conversationId, req.turnId, regenCount);

    const trace: any = { steps: [], regenCount, variationSeed, startTime };

    // 0) Load doc index snapshot (unless provided)
    const docIndex = req.docIndex ?? (await this.deps.docIndexService.getSnapshot(req.userId));
    trace.steps.push({ step: "doc_index_loaded", docCount: docIndex.docCount });

    // 1) Normalize query text
    const normalizedText = this.deps.queryNormalizer.normalize(req.text);
    trace.steps.push({ step: "query_normalized", normalizedText });

    // 2) Intent resolution
    const intent = await this.deps.intentEngine.resolve({
      text: normalizedText,
      languageHint: req.userPrefs?.language,
      state: req.state,
    });
    trace.steps.push({ step: "intent_resolved", operator: intent.operator, intentFamily: intent.intentFamily, conf: intent.confidence });

    const language: LanguageCode = (req.userPrefs?.language ?? intent.signals?.language ?? "en") as LanguageCode;

    // 3) Conversation-only fast path (still unique)
    if (intent.intentFamily === "conversation") {
      const msg = await this.deps.conversationMessages.reply({
        operator: intent.operator,
        language,
        variationSeed,
        regenCount,
      });

      const finalized = this.deps.answerComposer.finalizeOutput(
        msg,
        { operator: intent.operator, intentFamily: intent.intentFamily, originalQuery: req.text, constraints: intent.constraints },
        { answerMode: "general_answer" }
      );

      const newState = await this.deps.stateUpdater.apply({
        state: req.state,
        intent,
        scope: { hard: {}, soft: {} },
        ranking: { candidateCount: 0, topScore: 0, margin: 0, autopick: false, ambiguous: false },
        mode: { mode: "general_answer", reason: "conversation" },
        finalResponse: { content: finalized.content, answerMode: "general_answer", attachments: [] },
      });

      return { content: finalized.content, answerMode: "general_answer", language, attachments: [], newState, meta: { ...trace, intentFamily: intent.intentFamily, operator: intent.operator } };
    }

    // 3b) Connectors are executed by chat connector handlers, not the doc-grounded orchestrator.
    if (intent.intentFamily === "connectors") {
      const msg =
        language === "pt"
          ? "Acoes de conectores (Gmail/Outlook/Slack) sao tratadas fora do fluxo de documentos. Use o seletor de conector acima do campo de mensagem e diga o que voce quer fazer (conectar, sincronizar, status, desconectar)."
          : language === "es"
            ? "Las acciones de conectores (Gmail/Outlook/Slack) se manejan fuera del flujo de documentos. Usa el selector de conector encima del campo de mensaje y dime lo que quieres hacer (conectar, sincronizar, estado, desconectar)."
            : "Connector actions (Gmail/Outlook/Slack) are handled outside the document pipeline. Use the connector selector above the input and tell me what you want to do (connect, sync, status, disconnect).";

      return {
        content: msg,
        answerMode: "general_answer",
        language,
        attachments: [],
        newState: req.state,
        meta: { ...trace, intentFamily: intent.intentFamily, operator: intent.operator },
      };
    }

    // 3c) Email actions are executed by chat connector handlers, not the doc-grounded orchestrator.
    if (intent.intentFamily === "email") {
      const msg =
        language === "pt"
          ? "Acoes de email (ler/explicar/redigir/enviar) sao tratadas fora do fluxo de documentos. Use o seletor de email acima do campo de mensagem e diga o que voce quer fazer."
          : language === "es"
            ? "Las acciones de correo (leer/explicar/redactar/enviar) se manejan fuera del flujo de documentos. Usa el selector de correo encima del campo de mensaje y dime lo que quieres hacer."
            : "Email actions (read/explain/draft/send) are handled outside the document pipeline. Use the email connector selector above the input and tell me what you want to do.";

      return {
        content: msg,
        answerMode: "general_answer",
        language,
        attachments: [],
        newState: req.state,
        meta: { ...trace, intentFamily: intent.intentFamily, operator: intent.operator },
      };
    }

    // 4) If no docs indexed, never proceed to doc grounded
    if (docIndex.docCount <= 0) {
      const fallback = await this.deps.fallbackEngine.emit({
        reasonCode: docIndex.indexingInProgress ? "indexing_in_progress" : "no_docs_indexed",
        language,
        context: { expectedDocTypes: "PDF/DOCX/TXT/images", uploadLimit: "15MB" },
      });
      const newState = await this.deps.stateUpdater.apply({
        state: req.state,
        intent,
        scope: { hard: {}, soft: {} },
        ranking: { candidateCount: 0, topScore: 0, margin: 0, autopick: false, ambiguous: false },
        mode: { mode: fallback.answerMode, reason: "no_docs" },
        finalResponse: fallback,
      });
      return { content: fallback.content, attachments: fallback.attachments, answerMode: fallback.answerMode, language, newState, meta: { ...trace, operator: intent.operator, intentFamily: intent.intentFamily } };
    }

    // 5) Query rewrite (extract doc refs, time, numeric, domain hints)
    const rewrite = await this.deps.queryRewriter.rewrite({ text: normalizedText, intent, state: req.state });
    trace.steps.push({ step: "query_rewritten", rewrittenText: rewrite.rewrittenText, docRefs: rewrite.hints.docRefs });

    // 6) Scope resolution (hard/soft constraints)
    const scope = await this.deps.scopeResolver.resolve({ rewrite, intent, state: req.state });
    trace.steps.push({ step: "scope_resolved", hard: scope.hard, soft: scope.soft, notes: scope.notes });

    // 7) Candidate filtering (hard constraints first)
    const filtered = await this.deps.candidateFilters.apply({ scope, candidates: docIndex.candidates });
    trace.steps.push({
      step: "candidates_filtered",
      kept: filtered.candidates.length,
      hardApplied: filtered.hardConstraintApplied,
      hardEmpty: filtered.hardConstraintEmpty,
      hardReason: filtered.hardConstraintReason,
    });

    // If hard scope emptied candidates, do NOT drift — emit scope-empty fallback
    if (filtered.hardConstraintEmpty) {
      const fallback = await this.deps.fallbackEngine.emit({
        reasonCode: "scope_hard_constraints_empty",
        language,
        context: {
          reasonShort: filtered.hardConstraintReason ?? "Your current scope didn’t match any files.",
          nextStep: "Try a slightly different filename or remove the lock.",
        },
      });

      const newState = await this.deps.stateUpdater.apply({
        state: req.state,
        intent,
        scope,
        ranking: { candidateCount: 0, topScore: 0, margin: 0, autopick: false, ambiguous: false },
        mode: { mode: fallback.answerMode, reason: "scope_empty" },
        finalResponse: fallback,
      });

      return { content: fallback.content, attachments: fallback.attachments, answerMode: fallback.answerMode, language, newState, meta: { ...trace, operator: intent.operator, intentFamily: intent.intentFamily } };
    }

    // 8) Retrieval
    let retrieval = await this.deps.retrievalEngine.retrieve({ query: rewrite, scope, candidates: filtered.candidates, intent, state: req.state });
    trace.steps.push({ step: "retrieved", evidenceCount: retrieval.evidence.length, stats: retrieval.stats });

    // 9) Ranking / ambiguity decision
    const ranking = await this.deps.ranker.decide({ retrieval, intent, scope, state: req.state });
    trace.steps.push({ step: "ranking_decided", ...ranking });

    // 10) Answer mode routing
    const modeDecision = await this.deps.answerModeRouter.route({ intent, scope, retrieval, ranking, state: req.state, docIndex });
    trace.steps.push({ step: "mode_routed", mode: modeDecision.mode, reason: modeDecision.reason, navType: modeDecision.navType });

    // 11) If retrieval empty for doc queries → scoped_not_found (not “no relevant info”)
    if (retrieval.evidence.length === 0 && intent.intentFamily === "documents") {
      const reason = retrieval.stats.reasonCodeIfEmpty ?? "no_relevant_chunks_in_scoped_docs";
      const fallback = await this.deps.fallbackEngine.emit({
        reasonCode: reason as any,
        language,
        context: {
          nextStep: "Tell me the section/sheet/slide name, or ask me to search other files.",
        },
      });

      const newState = await this.deps.stateUpdater.apply({
        state: req.state,
        intent,
        scope,
        ranking,
        mode: { mode: fallback.answerMode, reason: "retrieval_empty" },
        finalResponse: fallback,
      });

      return { content: fallback.content, attachments: fallback.attachments, answerMode: fallback.answerMode, language, newState, meta: { ...trace, operator: intent.operator, intentFamily: intent.intentFamily } };
    }

    // 12) Generate answer draft
    // NOTE: All uniqueness comes from the model + variationSeed + regenCount + prompt routing,
    // NOT from hardcoded templates.
    let gen = await this.deps.answerEngine.generate({
      mode: modeDecision,
      intent,
      query: rewrite,
      scope,
      retrieval,
      ranking,
      language,
      variationSeed,
      regenCount,
    });
    trace.steps.push({ step: "answer_generated", draftChars: gen.draft.length, usedDocs: gen.usedDocs });

    // 13) Render policy normalization (markdown + block rules)
    const rendered = await this.deps.renderPolicy.apply({ text: gen.draft, answerMode: modeDecision.mode, navType: modeDecision.navType, plannedBlocks: undefined, language });
    let answerText = rendered.text;
    trace.steps.push({ step: "render_policy_applied", chars: answerText.length });

    // 14) Doc grounding checks (verdict can force clarification or fallback)
    const grounding = await this.deps.docGroundingChecks.check({
      answerMode: modeDecision.mode,
      intent,
      scope,
      retrieval,
      draftText: answerText,
      chosenDocId: ranking.chosenDocId,
    });
    trace.steps.push({ step: "grounding_checked", verdict: grounding.verdict, action: grounding.recommendedAction });

    // 14a) Filter source buttons to only include documents actually used in the answer
    // This ensures sources shown match the content (ChatGPT-like accuracy)
    let attachments: Attachment[] = gen.attachments ?? [];
    if (attachments.length > 0 && retrieval.evidence?.length > 0) {
      // Convert retrieval evidence to the format needed for filtering
      const evidenceForFiltering: EvidenceChunkForFiltering[] = retrieval.evidence.map((e: any) => ({
        docId: e.docId || e.documentId,
        fileName: e.fileName || e.filename,
        docTitle: e.docTitle || e.title,
        text: e.text || e.content || '',
        pageStart: e.pageStart || e.pageNumber,
        sheetName: e.sheetName,
        slideNumber: e.slideNumber,
      }));

      // Extract which documents were actually used in the rendered answer
      const usedDocIds = extractUsedDocuments(answerText, evidenceForFiltering);
      trace.steps.push({ step: "source_filtering", evidenceCount: evidenceForFiltering.length, usedCount: usedDocIds.size, usedDocIds: Array.from(usedDocIds) });

      // Filter attachments to only include used documents
      attachments = attachments.map(att => {
        if (att.type === 'source_buttons') {
          const filtered = filterSourceButtonsByUsage(att as SourceButtonsAttachmentType, usedDocIds);
          return filtered || att; // Keep original if filtering returns null
        }
        return att;
      }).filter(Boolean) as Attachment[];
    }

    // 15) Quality gates (replace bad fallbacks, enforce nav_pills rules, numeric integrity, etc.)
    // This gate is allowed to request retry retrieval then regen.
    let gate = await this.deps.qualityGates.run({
      env,
      answerMode: modeDecision.mode,
      intent,
      scope,
      retrieval,
      ranking,
      state: req.state,
      answerText,
      attachments,
      language,
    });
    trace.steps.push({ step: "quality_gates", ok: gate.ok, actions: gate.actions, requiresRetry: gate.requiresRetry });

    // 15a) If gate says "route", return that directly (adaptive fallback, disambiguation prompt, nav not found, etc.)
    if (gate.routedResponse) {
      const finalized = this.deps.answerComposer.finalizeOutput(
        gate.routedResponse.content,
        { operator: intent.operator, intentFamily: intent.intentFamily, originalQuery: req.text, constraints: intent.constraints },
        { answerMode: gate.routedResponse.answerMode }
      );

      const newState = await this.deps.stateUpdater.apply({
        state: req.state,
        intent,
        scope,
        ranking,
        mode: { mode: gate.routedResponse.answerMode, reason: "quality_gate_route" },
        finalResponse: { ...gate.routedResponse, content: finalized.content },
      });

      return {
        content: finalized.content,
        attachments: gate.routedResponse.attachments,
        answerMode: gate.routedResponse.answerMode,
        language,
        newState,
        meta: { ...trace, operator: intent.operator, intentFamily: intent.intentFamily },
      };
    }

    // 15b) If gate says retry retrieval + regenerate, do a bounded retry
    // Keep it short: 1 retry max (ChatGPT-like: it silently improves).
    if (gate.requiresRetry) {
      trace.steps.push({ step: "retry_requested", hint: gate.retryHint });

      // Optional: tweak retrieval behavior via retryHint (exact number matching, etc.)
      retrieval = await this.deps.retrievalEngine.retrieve({ query: rewrite, scope, candidates: filtered.candidates, intent, state: req.state });
      const ranking2 = await this.deps.ranker.decide({ retrieval, intent, scope, state: req.state });

      gen = await this.deps.answerEngine.generate({
        mode: modeDecision,
        intent,
        query: rewrite,
        scope,
        retrieval,
        ranking: ranking2,
        language,
        variationSeed,
        regenCount: regenCount + 1, // force variation on retry
      });

      const rendered2 = await this.deps.renderPolicy.apply({ text: gen.draft, answerMode: modeDecision.mode, navType: modeDecision.navType, plannedBlocks: undefined, language });
      answerText = rendered2.text;
      attachments = gen.attachments ?? [];

      // Apply same source filtering to retry path
      if (attachments.length > 0 && retrieval.evidence?.length > 0) {
        const evidenceForFiltering: EvidenceChunkForFiltering[] = retrieval.evidence.map((e: any) => ({
          docId: e.docId || e.documentId,
          fileName: e.fileName || e.filename,
          docTitle: e.docTitle || e.title,
          text: e.text || e.content || '',
          pageStart: e.pageStart || e.pageNumber,
          sheetName: e.sheetName,
          slideNumber: e.slideNumber,
        }));

        const usedDocIds = extractUsedDocuments(answerText, evidenceForFiltering);
        trace.steps.push({ step: "retry_source_filtering", usedCount: usedDocIds.size });

        attachments = attachments.map(att => {
          if (att.type === 'source_buttons') {
            const filtered = filterSourceButtonsByUsage(att as SourceButtonsAttachmentType, usedDocIds);
            return filtered || att;
          }
          return att;
        }).filter(Boolean) as Attachment[];
      }

      gate = await this.deps.qualityGates.run({
        env,
        answerMode: modeDecision.mode,
        intent,
        scope,
        retrieval,
        ranking: ranking2,
        state: req.state,
        answerText,
        attachments,
        language,
      });

      trace.steps.push({ step: "retry_complete", gateOk: gate.ok });
      // If still not ok and gate routes now, it will be handled below by transform/fallback.
    }

    // 15c) Apply gate transforms if provided
    if (gate.transformedText) {
      answerText = gate.transformedText;
      trace.steps.push({ step: "gate_transform_applied", chars: answerText.length });
    }

    // 16) Finalize output (markdown normalize + smart bolding + trim)
    const finalized = this.deps.answerComposer.finalizeOutput(
      answerText,
      { operator: intent.operator, intentFamily: intent.intentFamily, originalQuery: req.text, constraints: intent.constraints },
      { answerMode: modeDecision.mode }
    );
    trace.steps.push({ step: "finalized", chars: finalized.content.length });

    // 17) Update conversation state
    const newState = await this.deps.stateUpdater.apply({
      state: req.state,
      intent,
      scope,
      ranking,
      mode: modeDecision,
      finalResponse: { content: finalized.content, answerMode: modeDecision.mode, attachments },
    });

    // 18) Emit query telemetry (fire-and-forget)
    const endTime = Date.now();
    emitQueryTelemetry({
      queryId: req.turnId,
      userId: req.userId,
      conversationId: req.conversationId,
      messageId: req.turnId,
      intent: intent.intentFamily,
      intentConfidence: intent.confidence,
      domain: rewrite.hints.domain?.topDomain ?? 'general',
      operator: intent.operator,
      keywords: rewrite.hints.docRefs?.filenames ?? [],
      chunksReturned: retrieval.evidence.length,
      topScore: retrieval.stats.topScore ?? ranking.topScore ?? 0,
      docScopeApplied: (scope.hard?.docIdAllowlist?.length ?? 0) > 0 || (scope.hard?.filenameMustContain?.length ?? 0) > 0,
      hadFallback: modeDecision.mode === 'scoped_not_found' || modeDecision.mode === 'no_docs',
      answerMode: modeDecision.mode,
      totalMs: endTime - (trace.startTime ?? endTime),
    });

    // 19) Done
    return {
      content: finalized.content,
      attachments,
      answerMode: modeDecision.mode,
      language,
      newState,
      meta: req.debug ? { operator: intent.operator, intentFamily: intent.intentFamily, domain: rewrite.hints.domain?.topDomain ?? null, trace, regenCount, variationSeed } : { operator: intent.operator, intentFamily: intent.intentFamily, domain: rewrite.hints.domain?.topDomain ?? null, regenCount, variationSeed },
    };
  }
}
