// scopeGate.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Scope Gate (ChatGPT-parity)
 * --------------------------------
 * This service is the deterministic “scope correctness layer” that runs BEFORE retrieval.
 *
 * Responsibilities:
 *  1) Interpret scope hints (explicit filename/title/alias, sheet/tab, range, page/slide/section).
 *  2) Enforce lock semantics (explicit doc lock persists; explicit references override continuity).
 *  3) Apply follow-up continuity safely (carry over only when no topic-shift and no explicit new doc).
 *  4) Support discovery exceptions (doc discovery may ignore doc lock).
 *  5) Produce a scope decision: candidate doc IDs, hard/soft constraints, and reason codes for policies.
 *  6) Detect ambiguity in doc references and request disambiguation ONLY when truly blocked.
 *
 * It does NOT:
 *  - retrieve content
 *  - generate user-facing copy
 *
 * Outputs are consumed by:
 *  - retrievalEngine.service.ts (candidate doc restriction)
 *  - ambiguity/disambiguation pipeline (if needs_doc_choice)
 *  - policies (doc_access_policy, clarification_policy, fallback_policy)
 */

import crypto from "crypto";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../banks/documentIntelligenceBanks.service";

type EnvName = "production" | "staging" | "dev" | "local";

type AnswerMode =
  | "nav_pills"
  | "doc_grounded_single"
  | "doc_grounded_multi"
  | "doc_grounded_quote"
  | "doc_grounded_table"
  | "general_answer"
  | "help_steps"
  | "rank_disambiguate"
  | "rank_autopick";

type ScopeAction = "allow" | "transform" | "route" | "block";

type ScopeReasonCode =
  | "explicit_doc_required"
  | "needs_doc_choice"
  | "scope_hard_constraints_empty"
  | "no_docs_indexed"
  | "wrong_doc_detected"
  | "discovery_mode"
  | "followup_continuity"
  | "needs_time_range"
  | "needs_metric";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface DocMeta {
  docId: string;
  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  sizeBytes?: number | null;
  sheets?: string[] | null;
}

export interface DocStore {
  listDocs(): Promise<DocMeta[]>;
  getDocMeta(docId: string): Promise<DocMeta | null>;
}

export interface ConversationStateLike {
  session: { env: EnvName; userLanguage?: "any" | "en" | "pt" | "es" };
  persistent: {
    scope: {
      activeDocId: string | null;
      activeDocTitle?: string | null;
      activeFilename?: string | null;
      hardDocLock: boolean;
      hardSheetLock: boolean;
      activeSheetName?: string | null;
      activeRangeA1?: string | null;
      activePageHint?: number | null;
      activeSlideHint?: number | null;
    };
  };
  history: {
    recentReasonCodes: string[];
  };
  ephemeral: {
    turn: { turnId: number };
  };
}

export interface ScopeGateInput {
  query: string;
  env: EnvName;

  // Precomputed upstream signals are accepted, but ScopeGate can also derive many.
  signals: {
    intentFamily?: string | null; // documents, doc_discovery, file_actions, help, conversation...
    operator?: string | null;
    operatorFamily?: string | null;
    answerMode?: AnswerMode | null;

    // follow-up signals
    isFollowup?: boolean;
    followupStrength?: "weak" | "medium" | "strong" | null;

    // discourse markers (optional if discourse_markers overlay already ran)
    discourse?: {
      isTopicShift?: boolean;
      isCorrection?: boolean;
      isFormatShift?: boolean;
      isContinuation?: boolean;
    };

    // explicit references resolved upstream (optional)
    explicitDocRef?: boolean;
    resolvedDocId?: string | null;

    // doc lock request signals (optional)
    explicitDocLock?: boolean;

    // sheet/range signals (optional)
    sheetHintPresent?: boolean;
    resolvedSheetName?: string | null;
    rangeExplicit?: boolean;
    resolvedRangeA1?: string | null;

    // discovery override
    corpusSearchAllowed?: boolean;

    // safety (scope gate will not proceed if unsafe gate is set)
    unsafeGate?: boolean;
  };

  // Optional: if your pipeline already extracted doc reference candidates
  extractedDocRef?: {
    raw?: string;
    type?: "filename" | "title" | "alias" | "unknown";
  };

  // Optional overrides (tests/diagnostics)
  overrides?: Partial<{
    forceDiscovery: boolean;
    forceNoDocsIndexed: boolean;
    disableDocAliasMatching: boolean;
  }>;
}

export interface ScopeCandidate {
  docId: string;
  score: number; // 0..1
  reasons: string[];
  title?: string | null;
  filename?: string | null;
}

export interface ScopeDecision {
  action: ScopeAction;
  severity: "info" | "warning" | "error" | "fatal";
  reasonCodes: ScopeReasonCode[];

  // If routing is needed (e.g., disambiguation)
  routeTo?: string; // bankId e.g., "clarification_policy"

  // Updated signals/state recommendations
  signals: {
    hardScopeActive: boolean;
    explicitDocRef: boolean;
    explicitDocLock: boolean;
    activeDocId: string | null;
    corpusSearchAllowed: boolean;

    sheetHintPresent: boolean;
    activeSheetName: string | null;
    rangeExplicit: boolean;
    activeRangeA1: string | null;

    // disambiguation hint
    needsDocChoice?: boolean;
  };

  scope: {
    candidateDocIds: string[];
    scopeKey: string; // stable hash used for caching and retrieval keys
  };

  // Optional disambiguation payload (no user-facing text)
  disambiguation?: {
    candidateType: "document";
    options: Array<{
      docId: string;
      score: number;
      title?: string | null;
      filename?: string | null;
    }>;
    maxOptions: number;
    maxQuestions: number;
    reasonCode: ScopeReasonCode;
  };

  debug?: {
    appliedRules: string[];
    notes: string[];
  };
}

// -----------------------------
// Helpers
// -----------------------------

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function normSpace(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

function lower(s: string): string {
  return normSpace(s).toLowerCase();
}

function isProd(env: EnvName): boolean {
  return env === "production";
}

function detectFilenameToken(q: string): string | null {
  // conservative: filename with extension
  const m = q.match(
    /\b\w[\w\-_. ]{0,160}\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\b/i,
  );
  return m ? m[0].trim() : null;
}

function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  const a = new Set(aTokens.filter((t) => t.length >= 2));
  const b = new Set(bTokens.filter((t) => t.length >= 2));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}

function simpleTokens(s: string): string[] {
  return lower(s)
    .replace(/["“”]/g, " ")
    .split(/[\s,;:.!?()]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// -----------------------------
// Service
// -----------------------------

export class ScopeGateService {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly docStore: DocStore,
    private readonly documentIntelligenceBanks: Pick<
      DocumentIntelligenceBanksService,
      "getMergedDocAliasesBank" | "getDocAliasPhrases" | "getDocTaxonomy"
    > = getDocumentIntelligenceBanksInstance(),
  ) {}

  async evaluate(
    state: ConversationStateLike,
    input: ScopeGateInput,
  ): Promise<ScopeDecision> {
    const debug = { appliedRules: [] as string[], notes: [] as string[] };

    // 0) Safety gate
    if (input.signals.unsafeGate) {
      return this.finish(state, input, {
        action: "route",
        severity: "fatal",
        reasonCodes: ["wrong_doc_detected"], // treat as terminal for scope; upstream safety_policy will override to refusal
        routeTo: "refusal_policy",
        signals: {
          hardScopeActive: false,
          explicitDocRef: false,
          explicitDocLock: Boolean(state.persistent.scope.hardDocLock),
          activeDocId: state.persistent.scope.activeDocId,
          corpusSearchAllowed: false,
          sheetHintPresent: false,
          activeSheetName: null,
          rangeExplicit: false,
          activeRangeA1: null,
        },
        scope: { candidateDocIds: [], scopeKey: this.scopeKey([]) },
        debug,
      });
    }

    // 1) Load relevant banks (soft if missing)
    const scopeHintsBank = this.safeGetBank<any>("scope_hints");
    const followupBank = this.safeGetBank<any>("followup_indicators");
    const discourseBank = this.safeGetBank<any>("discourse_markers");
    const docAliasesBank =
      this.documentIntelligenceBanks.getMergedDocAliasesBank();
    const docAliasPhrases = this.documentIntelligenceBanks.getDocAliasPhrases();
    let docTaxonomyBank: any | null = null;
    try {
      docTaxonomyBank = this.documentIntelligenceBanks.getDocTaxonomy();
    } catch {
      docTaxonomyBank = null;
    }
    const stopwordsDocnames = this.safeGetBank<any>("stopwords_docnames");
    const ambiguityPolicies = this.safeGetBank<any>("disambiguation_policies");
    const rankFeatures = this.safeGetBank<any>("ambiguity_rank_features");

    // 2) Doc inventory
    const docs = input.overrides?.forceNoDocsIndexed
      ? []
      : await this.docStore.listDocs();
    if (!docs.length) {
      debug.appliedRules.push("no_docs_indexed");
      return this.finish(state, input, {
        action: "route",
        severity: "fatal",
        reasonCodes: ["no_docs_indexed"],
        routeTo: "fallback_processing",
        signals: {
          hardScopeActive: false,
          explicitDocRef: false,
          explicitDocLock: false,
          activeDocId: null,
          corpusSearchAllowed: false,
          sheetHintPresent: false,
          activeSheetName: null,
          rangeExplicit: false,
          activeRangeA1: null,
        },
        scope: { candidateDocIds: [], scopeKey: this.scopeKey([]) },
        debug,
      });
    }

    // 3) Normalize query + derive key indicators
    const qOriginal = input.query;
    const qNorm = normSpace(qOriginal);
    const qLower = lower(qNorm);

    // Derive intentFamily/discovery
    const isDiscovery =
      Boolean(input.overrides?.forceDiscovery) ||
      input.signals.intentFamily === "doc_discovery";
    const corpusAllowed = Boolean(
      input.signals.corpusSearchAllowed ?? isDiscovery,
    );

    // Discourse: topic shift breaks continuity; correction can still be follow-up but may change target
    const discourse = input.signals.discourse ?? {};
    const topicShift = Boolean(discourse.isTopicShift);
    const formatShift = Boolean(discourse.isFormatShift);

    // Follow-up: allow continuity unless topic shift or explicit new doc ref
    const isFollowup = Boolean(input.signals.isFollowup);
    const followupStrength = input.signals.followupStrength ?? null;

    // 4) Extract explicit filename token if present
    const filenameToken = detectFilenameToken(qNorm);

    // 5) Establish base active doc and lock signals from state
    const stateActiveDocId = state.persistent.scope.activeDocId;
    const stateHardDocLock = Boolean(state.persistent.scope.hardDocLock);

    // 6) Determine whether this turn provides explicit doc reference
    const explicitDocRefFromUpstream = Boolean(input.signals.explicitDocRef);
    const resolvedDocIdFromUpstream = input.signals.resolvedDocId ?? null;

    // If upstream resolved an explicit docId, treat as explicit doc ref
    const explicitDocRef =
      explicitDocRefFromUpstream ||
      Boolean(resolvedDocIdFromUpstream) ||
      Boolean(filenameToken) ||
      this.matchesAnyDocAliasPhrase(qLower, docAliasPhrases, docTaxonomyBank);

    // 7) Resolve explicit doc reference to a docId if needed
    const explicitResolved = await this.resolveExplicitDocRef({
      docs,
      qNorm,
      filenameToken,
      upstreamResolvedDocId: resolvedDocIdFromUpstream,
      disableDocAliasMatching: Boolean(
        input.overrides?.disableDocAliasMatching,
      ),
      docAliasesBank,
      stopwordsDocnames,
    });

    // 8) Compute lock intent for this turn
    // - If user explicitly references a doc: hard lock to it (doc_access_policy will enforce too)
    // - If explicitDocLock signal is present: set lock
    // - Otherwise retain existing lock unless topic shift (topic shift does NOT auto-unlock; it only reduces continuity)
    let hardDocLock = stateHardDocLock;
    let activeDocId = stateActiveDocId;

    if (explicitResolved.docId) {
      debug.appliedRules.push("explicit_doc_required_precedence");
      activeDocId = explicitResolved.docId;
      hardDocLock = true;
    } else if (input.signals.explicitDocLock === true) {
      debug.appliedRules.push("explicit_doc_lock_set");
      hardDocLock = true;
    }

    // If no active doc in state and no explicit doc, we stay unlocked.
    // If follow-up is strong and no topic shift and we have active doc, we keep it as soft continuity.
    if (!explicitResolved.docId && isFollowup && !topicShift && activeDocId) {
      debug.appliedRules.push("followup_continuity");
      // do nothing: keep activeDocId
    }

    // If topic shift and NOT explicitly locked, we should not force carryover.
    // We do NOT clear the state; we just avoid using active doc as a hard constraint.
    const continuityAllowed = isFollowup && !topicShift;

    // 9) Sheet/range scope hints
    const sheetName =
      input.signals.resolvedSheetName ??
      state.persistent.scope.activeSheetName ??
      null;
    const rangeA1 =
      input.signals.resolvedRangeA1 ??
      state.persistent.scope.activeRangeA1 ??
      null;

    const sheetHintPresent =
      Boolean(input.signals.sheetHintPresent) || Boolean(sheetName);
    const rangeExplicit =
      Boolean(input.signals.rangeExplicit) || Boolean(rangeA1);

    // If sheet/range explicit, treat as hard sheet lock within the doc (if doc is known)
    const hardSheetLock = Boolean(sheetHintPresent || rangeExplicit);

    // 10) Candidate doc IDs determination
    let candidateDocIds: string[] = docs.map((d) => d.docId);

    // Rule: explicit doc ref -> single doc scope
    if (explicitResolved.docId) {
      candidateDocIds = [explicitResolved.docId];
    } else if (hardDocLock && activeDocId && !corpusAllowed) {
      // Rule: hard lock applies except discovery
      candidateDocIds = [activeDocId];
    } else if (
      (input.signals as any).singleDocIntent &&
      activeDocId &&
      !corpusAllowed
    ) {
      // Rule: single doc intent prefers active doc if available
      candidateDocIds = [activeDocId];
    } else if (
      continuityAllowed &&
      activeDocId &&
      !corpusAllowed &&
      !hardDocLock
    ) {
      // Soft continuity: narrow to active doc ONLY if we have no explicit doc ref and not discovery
      // This is a ChatGPT-like bias, not a hard lock.
      debug.appliedRules.push("followup_soft_narrow_to_active_doc");
      candidateDocIds = [activeDocId];
    } else {
      // corpus-wide (default)
      candidateDocIds = docs.map((d) => d.docId);
    }

    // 11) Ambiguity handling: if user clearly referenced "a doc" but we cannot resolve it safely
    // We only disambiguate when blocked:
    // - user attempted to open/reference a file (explicitDocRef true) AND no resolved docId AND not discovery
    // - or user explicitly asked for a doc by ambiguous alias tokens
    let needsDocChoice = false;
    let disambiguationOptions: ScopeCandidate[] = [];

    if (explicitDocRef && !explicitResolved.docId && !isDiscovery) {
      debug.appliedRules.push("needs_doc_choice_unresolved_explicit_ref");
      needsDocChoice = true;

      // Score doc candidates using simple overlap as a fallback ranking (bank-driven thresholds are applied)
      disambiguationOptions = this.rankDocCandidatesByName(
        docs,
        qNorm,
        stopwordsDocnames,
        rankFeatures,
      );

      // Apply policy thresholds (autopick vs disambiguate)
      const policy =
        ambiguityPolicies?.config?.actionsContract?.thresholds ?? {};
      const topScore = disambiguationOptions[0]?.score ?? 0;
      const gap =
        disambiguationOptions.length >= 2
          ? topScore - (disambiguationOptions[1].score ?? 0)
          : 1;

      const autopickTop = Number(policy.autopickTopScore ?? 0.85);
      const autopickGap = Number(policy.autopickGap ?? 0.25);

      const topDoc = disambiguationOptions[0]?.docId ?? null;
      if (topDoc && topScore >= autopickTop && gap >= autopickGap) {
        debug.appliedRules.push("autopick_safe_doc_choice");
        activeDocId = topDoc;
        hardDocLock = true;
        candidateDocIds = [topDoc];
        needsDocChoice = false;
        disambiguationOptions = [];
      }
    }

    // 12) ScopeKey (cache key)
    const scopeKey = this.scopeKey(candidateDocIds, {
      activeDocId,
      hardDocLock,
      hardSheetLock,
      sheetName: hardSheetLock ? sheetName : null,
      rangeA1: hardSheetLock ? rangeA1 : null,
      corpusAllowed,
    });

    // 13) Build decision
    if (needsDocChoice) {
      const maxOptions = Number(
        ambiguityPolicies?.config?.actionsContract?.thresholds?.maxOptions ?? 4,
      );

      return this.finish(state, input, {
        action: "route",
        severity: "warning",
        reasonCodes: ["needs_doc_choice"],
        routeTo: "clarification_policy",
        signals: {
          hardScopeActive: true,
          explicitDocRef: true,
          explicitDocLock: Boolean(hardDocLock),
          activeDocId: activeDocId,
          corpusSearchAllowed: corpusAllowed,

          sheetHintPresent: Boolean(sheetHintPresent),
          activeSheetName: sheetName,
          rangeExplicit: Boolean(rangeExplicit),
          activeRangeA1: rangeA1,

          needsDocChoice: true,
        },
        scope: { candidateDocIds, scopeKey },
        disambiguation: {
          candidateType: "document",
          options: disambiguationOptions.slice(0, maxOptions).map((o) => ({
            docId: o.docId,
            score: o.score,
            title: o.title ?? null,
            filename: o.filename ?? null,
          })),
          maxOptions,
          maxQuestions: 1,
          reasonCode: "needs_doc_choice",
        },
        debug: isProd(input.env) ? undefined : debug,
      });
    }

    // 14) Normal allow path
    const hardScopeActive = Boolean(
      explicitResolved.docId ||
        (hardDocLock && activeDocId) ||
        hardSheetLock ||
        (input.signals as any).hardScopeActive,
    );

    return this.finish(state, input, {
      action: "allow",
      severity: "info",
      reasonCodes: [
        ...(explicitResolved.docId ? ["explicit_doc_required"] : []),
        ...(isDiscovery ? ["discovery_mode"] : []),
        ...(continuityAllowed && isFollowup ? ["followup_continuity"] : []),
      ] as ScopeReasonCode[],
      signals: {
        hardScopeActive,
        explicitDocRef: Boolean(explicitDocRef),
        explicitDocLock: Boolean(hardDocLock),
        activeDocId: activeDocId,
        corpusSearchAllowed: corpusAllowed,

        sheetHintPresent: Boolean(sheetHintPresent),
        activeSheetName: sheetName,
        rangeExplicit: Boolean(rangeExplicit),
        activeRangeA1: rangeA1,
      },
      scope: { candidateDocIds, scopeKey },
      debug: isProd(input.env) ? undefined : debug,
    });
  }

  // -----------------------------
  // Explicit doc reference resolution
  // -----------------------------

  private async resolveExplicitDocRef(args: {
    docs: DocMeta[];
    qNorm: string;
    filenameToken: string | null;
    upstreamResolvedDocId: string | null;
    disableDocAliasMatching: boolean;
    docAliasesBank: any | null;
    stopwordsDocnames: any | null;
  }): Promise<{
    docId: string | null;
    confidence: number;
    method: "upstream" | "filename" | "alias" | "none";
  }> {
    // Upstream resolved docId
    if (args.upstreamResolvedDocId)
      return {
        docId: args.upstreamResolvedDocId,
        confidence: 0.95,
        method: "upstream",
      };

    // Filename exact match (normalize minimal)
    if (args.filenameToken) {
      const ft = lower(args.filenameToken);
      for (const d of args.docs) {
        const fn = lower(d.filename ?? "");
        if (fn && fn === ft)
          return { docId: d.docId, confidence: 0.95, method: "filename" };
        // allow basename match (without path noise)
        if (fn && fn.endsWith(ft))
          return { docId: d.docId, confidence: 0.9, method: "filename" };
      }
    }

    // Alias / title match (guarded)
    if (args.disableDocAliasMatching)
      return { docId: null, confidence: 0, method: "none" };

    // Use token overlap on doc title + filename tokens as deterministic fallback
    const qTokens = this.docnameTokens(args.qNorm, args.stopwordsDocnames);
    if (!qTokens.length) return { docId: null, confidence: 0, method: "none" };

    let best: { docId: string; score: number } | null = null;
    for (const d of args.docs) {
      const tTokens = this.docnameTokens(d.title ?? "", args.stopwordsDocnames);
      const fTokens = this.docnameTokens(
        d.filename ?? "",
        args.stopwordsDocnames,
      );
      const score = Math.max(
        tokenOverlap(qTokens, tTokens),
        tokenOverlap(qTokens, fTokens),
      );
      if (!best || score > best.score) best = { docId: d.docId, score };
    }

    const min = Number(args.docAliasesBank?.config?.minAliasConfidence ?? 0.75);
    if (best && best.score >= min)
      return {
        docId: best.docId,
        confidence: clamp01(best.score),
        method: "alias",
      };

    return { docId: null, confidence: 0, method: "none" };
  }

  private docnameTokens(s: string, stopwordsDocnames: any | null): string[] {
    // If stopwords_docnames bank exists, we still keep it deterministic and conservative:
    // remove only generic doc terms and status adjectives (as in your bank).
    const toks = simpleTokens(s);

    const generic = new Set<string>([
      "file",
      "document",
      "doc",
      "report",
      "presentation",
      "deck",
      "spreadsheet",
      "sheet",
      "workbook",
      "table",
      "arquivo",
      "documento",
      "relatório",
      "relatorio",
      "apresentação",
      "apresentacao",
      "planilha",
      "tabela",
      "archivo",
      "documento",
      "informe",
      "presentación",
      "presentacion",
      "hoja",
      "tabla",
    ]);

    const status = new Set<string>([
      "final",
      "latest",
      "updated",
      "new",
      "old",
      "draft",
      "version",
      "mais",
      "recente",
      "atualizado",
      "novo",
      "antigo",
      "rascunho",
      "versao",
      "versão",
      "más",
      "reciente",
      "actualizado",
      "nuevo",
      "antiguo",
      "borrador",
      "version",
    ]);

    const filtered = toks.filter((t) => !generic.has(t) && !status.has(t));
    return filtered;
  }

  private matchesAnyDocAliasPhrase(
    query: string,
    phrases: string[],
    taxonomyBank: any | null,
  ): boolean {
    const normalizedQuery = lower(query);
    if (!normalizedQuery) return false;

    const taxonomyTokens = Array.isArray(taxonomyBank?.typeDefinitions)
      ? taxonomyBank.typeDefinitions
          .flatMap((entry: any) => [
            lower(entry?.id),
            ...(Array.isArray(entry?.aliases)
              ? entry.aliases.map((alias: unknown) =>
                  lower(String(alias ?? "")),
                )
              : []),
          ])
          .filter(Boolean)
      : [];

    const allPhrases = Array.from(
      new Set([...phrases, ...taxonomyTokens]),
    ).filter((token) => token.length >= 3);

    return allPhrases.some((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|\\b)${escaped}(\\b|$)`, "i").test(normalizedQuery);
    });
  }

  // -----------------------------
  // Ranking candidates for disambiguation
  // -----------------------------

  private rankDocCandidatesByName(
    docs: DocMeta[],
    query: string,
    stopwordsDocnames: any | null,
    rankFeatures: any | null,
  ): ScopeCandidate[] {
    const qTokens = this.docnameTokens(query, stopwordsDocnames);
    const out: ScopeCandidate[] = [];

    for (const d of docs) {
      const titleTokens = this.docnameTokens(d.title ?? "", stopwordsDocnames);
      const fileTokens = this.docnameTokens(
        d.filename ?? "",
        stopwordsDocnames,
      );

      const titleOverlap = tokenOverlap(qTokens, titleTokens);
      const fileOverlap = tokenOverlap(qTokens, fileTokens);

      // Name match is primary in ambiguity ranking; keep deterministic
      let score = Math.max(titleOverlap, fileOverlap);

      // Light boost if filename contains an exact token substring
      const qLower = lower(query);
      const fnLower = lower(d.filename ?? "");
      if (fnLower && qLower.length >= 4 && fnLower.includes(qLower))
        score = Math.max(score, 0.82);

      score = clamp01(score);

      out.push({
        docId: d.docId,
        score,
        reasons: [
          titleOverlap >= fileOverlap ? "title_overlap" : "filename_overlap",
          score >= 0.85 ? "high_confidence" : "needs_disambiguation",
        ],
        title: d.title ?? null,
        filename: d.filename ?? null,
      });
    }

    // Deterministic sort
    out.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const an = a.filename ?? a.title ?? a.docId;
      const bn = b.filename ?? b.title ?? b.docId;
      return an.localeCompare(bn);
    });

    return out;
  }

  // -----------------------------
  // Scope key
  // -----------------------------

  private scopeKey(docIds: string[], extra?: Record<string, any>): string {
    const stable = {
      docs: [...docIds].sort(),
      ...(extra ?? {}),
    };
    return sha256(JSON.stringify(stable)).slice(0, 20);
  }

  // -----------------------------
  // Finish helper
  // -----------------------------

  private finish(
    state: ConversationStateLike,
    input: ScopeGateInput,
    partial: Omit<ScopeDecision, "debug"> & { debug?: ScopeDecision["debug"] },
  ): ScopeDecision {
    // Ensure uniqueness & stable arrays
    const reasonCodes = Array.from(new Set(partial.reasonCodes));
    const candidateDocIds = Array.from(new Set(partial.scope.candidateDocIds));

    const decision: ScopeDecision = {
      ...partial,
      reasonCodes,
      scope: { ...partial.scope, candidateDocIds },
    };

    // Never emit debug in production
    if (isProd(input.env)) delete decision.debug;
    return decision;
  }

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
