// scopeGate.service.ts

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
  | "needs_section_choice"
  | "scope_hard_constraints_empty"
  | "no_docs_indexed"
  | "wrong_doc_detected"
  | "discovery_mode"
  | "followup_continuity"
  | "needs_time_range"
  | "needs_metric";

export interface BankLoader {
  getBank<T = unknown>(bankId: string): T;
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

    // disambiguation hints
    needsDocChoice?: boolean;
    activeSectionHint?: string | null;
    needsSectionChoice?: boolean;

    // period/unit slot extraction hints
    periodHint?: string | null;
    unitHint?: string | null;
    currencyHint?: string | null;
    comparisonModeHint?: string | null;
    timeConstraintsPresent?: boolean;
  };

  scope: {
    candidateDocIds: string[];
    scopeKey: string; // stable hash used for caching and retrieval keys
  };

  // Optional disambiguation payload (no user-facing text)
  disambiguation?: {
    candidateType: "document" | "section" | "table";
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

type ScopeResolutionBank = {
  config?: {
    enabled?: boolean;
    policy?: {
      preferActiveDocOnFollowup?: boolean;
      preferExplicitDocRefOverState?: boolean;
    };
    thresholds?: {
      minToApplyHardConstraint?: number;
      explicitFilenameHardMin?: number;
      explicitDocIdHardMin?: number;
      activeDocSoftMin?: number;
    };
    limits?: {
      maxDocAllowlist?: number;
    };
  };
  resolution?: {
    [stage: string]: {
      enabled?: boolean;
    };
  };
};

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

function foldDiacritics(s: string): string {
  return lower(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function isProd(env: EnvName): boolean {
  return env === "production";
}

function followupStrengthToScore(
  strength: "weak" | "medium" | "strong" | null | undefined,
): number {
  if (strength === "strong") return 0.9;
  if (strength === "medium") return 0.75;
  if (strength === "weak") return 0.55;
  return 0;
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
      | "getMergedDocAliasesBank"
      | "getDocAliasPhrases"
      | "getDocTaxonomy"
      | "getDiOntology"
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
          periodHint: null,
          unitHint: null,
          currencyHint: null,
          comparisonModeHint: null,
          timeConstraintsPresent: false,
        },
        scope: { candidateDocIds: [], scopeKey: this.scopeKey([]) },
        debug,
      });
    }

    // 1) Load relevant banks (soft if missing)
    const scopeHintsBank = this.safeGetBank<Record<string, unknown>>("scope_hints");
    const scopeResolutionBank =
      this.safeGetBank<ScopeResolutionBank>("scope_resolution");
    const followupBank = this.safeGetBank<Record<string, unknown>>("followup_indicators");
    const discourseBank = this.safeGetBank<Record<string, unknown>>("discourse_markers");
    const docAliasesBank =
      this.documentIntelligenceBanks.getMergedDocAliasesBank();
    const docAliasPhrases = this.documentIntelligenceBanks.getDocAliasPhrases();
    let docTaxonomyBank: Record<string, unknown> | null = null;
    try {
      docTaxonomyBank = this.documentIntelligenceBanks.getDocTaxonomy();
    } catch {
      docTaxonomyBank = null;
    }
    let diSectionOntologyBank: Record<string, unknown> | null = null;
    try {
      diSectionOntologyBank = this.documentIntelligenceBanks.getDiOntology("section");
    } catch {
      diSectionOntologyBank = null;
    }
    const headingsMapBank = this.safeGetBank<Record<string, unknown>>("headings_map");
    const stopwordsDocnames = this.safeGetBank<Record<string, unknown>>("stopwords_docnames");
    const ambiguityPolicies = this.safeGetBank<Record<string, unknown>>("disambiguation_policies");
    const rankFeatures = this.safeGetBank<Record<string, unknown>>("ambiguity_rank_features");
    const sectionDisambiguationPolicy = this.safeGetBank<Record<string, unknown>>(
      "section_disambiguation_policy",
    );
    const amendmentChainSchema = this.safeGetBank<Record<string, unknown>>(
      "amendment_chain_schema",
    );

    // Quality trigger banks (post-retrieval quality gates, loaded on-demand).
    const qualityTriggers = {
      ambiguity: this.safeGetBank<Record<string, unknown>>("quality_ambiguity_triggers"),
      weakEvidence: this.safeGetBank<Record<string, unknown>>("quality_weak_evidence_triggers"),
      wrongDocRisk: this.safeGetBank<Record<string, unknown>>("quality_wrong_doc_risk_triggers"),
      numericIntegrity: this.safeGetBank<Record<string, unknown>>("quality_numeric_integrity_triggers"),
      languageLock: this.safeGetBank<Record<string, unknown>>("quality_language_lock_triggers"),
      unsafeOperation: this.safeGetBank<Record<string, unknown>>("quality_unsafe_operation_triggers"),
    };

    const scopeResolutionEnabled = scopeResolutionBank?.config?.enabled !== false;
    const stageEnabled = (stage: string): boolean =>
      scopeResolutionEnabled &&
      scopeResolutionBank?.resolution?.[stage]?.enabled !== false;

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
          periodHint: null,
          unitHint: null,
          currencyHint: null,
          comparisonModeHint: null,
          timeConstraintsPresent: false,
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
    let topicShift = Boolean(discourse.isTopicShift);
    const formatShift = Boolean(discourse.isFormatShift);
    const discourseConfig = discourseBank?.config as Record<string, unknown> | undefined;
    const discourseActionsContract = discourseConfig?.actionsContract as Record<string, unknown> | undefined;
    const discourseConflictResolution = discourseActionsContract?.conflictResolution as Record<string, unknown> | undefined;
    const discourseConflictPolicy = String(
      discourseConflictResolution?.ifFormatShiftAndTopicShift || "",
    )
      .trim()
      .toLowerCase();
    if (topicShift && formatShift && discourseConflictPolicy === "format_shift_wins") {
      topicShift = false;
      debug.appliedRules.push("discourse_format_shift_wins_over_topic_shift");
    }

    // Follow-up: allow continuity unless topic shift or explicit new doc ref
    const followupBankConfig = followupBank?.config as Record<string, unknown> | undefined;
    const followupActionsContract = followupBankConfig?.actionsContract as Record<string, unknown> | undefined;
    const followupThresholds = followupActionsContract?.thresholds as Record<string, unknown> | undefined;
    const followupMinScore = Number(
      scopeResolutionBank?.config?.thresholds?.activeDocSoftMin ??
        followupThresholds?.followupScoreMin ??
        0.65,
    );
    const followupStrengthScore = followupStrengthToScore(
      input.signals.followupStrength,
    );
    const isFollowup =
      Boolean(input.signals.isFollowup) ||
      followupStrengthScore >= clamp01(followupMinScore);

    // 4) Extract explicit filename token if present
    const filenameToken = detectFilenameToken(qNorm);

    // 5) Establish base active doc and lock signals from state
    const stateActiveDocId = state.persistent.scope.activeDocId;
    const stateHardDocLock = Boolean(state.persistent.scope.hardDocLock);

    // 6) Determine whether this turn provides explicit doc reference
    const explicitDocRefFromUpstream = Boolean(input.signals.explicitDocRef);
    const scopeHintsConfig = scopeHintsBank?.config as Record<string, unknown> | undefined;
    const scopeHintsActionsContract = scopeHintsConfig?.actionsContract as Record<string, unknown> | undefined;
    const scopeHintsThresholds = scopeHintsActionsContract?.thresholds as Record<string, unknown> | undefined;
    const minScopeHintConfidence = clamp01(
      Number(
        scopeResolutionBank?.config?.thresholds?.minToApplyHardConstraint ??
          scopeHintsThresholds?.minHintConfidence ??
          0.75,
      ),
    );
    const scopeHintConfidence = clamp01(
      Number((input.signals as Record<string, unknown>).scopeHintConfidence ?? 1),
    );
    const explicitDocRefBySignal =
      stageEnabled("apply_explicit_doc_refs") &&
      explicitDocRefFromUpstream &&
      scopeHintConfidence >= minScopeHintConfidence;
    const resolvedDocIdFromUpstream = input.signals.resolvedDocId ?? null;

    // If upstream resolved an explicit docId, treat as explicit doc ref
    const explicitDocRef =
      stageEnabled("apply_explicit_doc_refs") &&
      (explicitDocRefBySignal ||
        Boolean(resolvedDocIdFromUpstream) ||
        Boolean(filenameToken) ||
        this.matchesAnyDocAliasPhrase(qLower, docAliasPhrases, docTaxonomyBank));

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
    const scopeResolutionConfig = asObject(scopeResolutionBank?.config);
    const scopeResolutionPolicy = asObject(scopeResolutionConfig.policy);
    const scopeResolutionThresholds = asObject(scopeResolutionConfig.thresholds);
    const preferExplicitDocRefOverState =
      scopeResolutionPolicy.preferExplicitDocRefOverState !== false;
    const explicitDocConfidenceFloor = clamp01(
      Number(
        explicitResolved.method === "filename"
          ? scopeResolutionThresholds.explicitFilenameHardMin ?? 0.8
          : explicitResolved.method === "upstream"
            ? scopeResolutionThresholds.explicitDocIdHardMin ?? 0.85
            : scopeResolutionThresholds.minToApplyHardConstraint ?? 0.74,
      ),
    );
    const explicitDocResolvedHard =
      stageEnabled("apply_explicit_doc_refs") &&
      Boolean(explicitResolved.docId) &&
      explicitResolved.confidence >= explicitDocConfidenceFloor;

    if (explicitDocResolvedHard && preferExplicitDocRefOverState) {
      debug.appliedRules.push("scope_resolution_apply_explicit_doc_refs");
      activeDocId = explicitResolved.docId;
      hardDocLock = true;
    } else if (
      stageEnabled("apply_user_choice") &&
      !explicitResolved.docId &&
      String(
        (
          state as unknown as Record<string, unknown> & {
            lastDisambiguation?: { chosenDocumentId?: string };
          }
        )?.lastDisambiguation?.chosenDocumentId || "",
      ).trim()
    ) {
      activeDocId = String(
        (
          state as unknown as Record<string, unknown> & {
            lastDisambiguation?: { chosenDocumentId?: string };
          }
        )?.lastDisambiguation?.chosenDocumentId || "",
      ).trim();
      hardDocLock = true;
      debug.appliedRules.push("scope_resolution_apply_user_choice");
    } else if (
      stageEnabled("apply_lock_request") &&
      input.signals.explicitDocLock === true
    ) {
      debug.appliedRules.push("scope_resolution_apply_lock_request");
      hardDocLock = true;
    }

    // If no active doc in state and no explicit doc, we stay unlocked.
    // If follow-up is strong and no topic shift and we have active doc, we keep it as soft continuity.
    const preferActiveDocOnFollowup =
      scopeResolutionBank?.config?.policy?.preferActiveDocOnFollowup !== false;
    if (
      stageEnabled("apply_followup_active_doc") &&
      preferActiveDocOnFollowup &&
      !explicitResolved.docId &&
      isFollowup &&
      !topicShift &&
      activeDocId
    ) {
      debug.appliedRules.push("scope_resolution_apply_followup_active_doc");
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
    const hardLockStageActive = stageEnabled("apply_hard_locked_doc");

    // Rule: explicit doc ref -> single doc scope
    if (explicitDocResolvedHard && explicitResolved.docId) {
      candidateDocIds = [explicitResolved.docId];
    } else if (hardLockStageActive && hardDocLock && activeDocId && !corpusAllowed) {
      // Rule: hard lock applies except discovery
      candidateDocIds = [activeDocId];
    } else if (
      (input.signals as Record<string, unknown>).singleDocIntent &&
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
      debug.appliedRules.push("scope_resolution_followup_soft_narrow_to_active_doc");
      candidateDocIds = [activeDocId];
    } else {
      // corpus-wide (default)
      candidateDocIds = docs.map((d) => d.docId);
    }

    const maxDocAllowlist = Math.max(
      1,
      Math.floor(
        Number(scopeResolutionBank?.config?.limits?.maxDocAllowlist ?? 8),
      ),
    );
    const shouldCapAllowlist = candidateDocIds.length > 1 && !corpusAllowed;
    if (shouldCapAllowlist && candidateDocIds.length > maxDocAllowlist) {
      candidateDocIds = candidateDocIds.slice(0, maxDocAllowlist);
      debug.appliedRules.push("scope_resolution_cap_doc_allowlist");
    }

    // 11) Ambiguity handling: if user clearly referenced "a doc" but we cannot resolve it safely
    // We only disambiguate when blocked:
    // - user attempted to open/reference a file (explicitDocRef true) AND no resolved docId AND not discovery
    // - or user explicitly asked for a doc by ambiguous alias tokens
    const ambiguityPolicyConfig = asObject(ambiguityPolicies?.config);
    const ambiguityActionsContract = asObject(
      ambiguityPolicyConfig.actionsContract,
    );
    const ambiguityThresholds = asObject(ambiguityActionsContract.thresholds);
    const sectionPolicyConfig = asObject(sectionDisambiguationPolicy?.config);
    const sectionPolicyThresholds = asObject(
      sectionPolicyConfig.sectionMatchThresholds,
    );
    const sectionRules = Array.isArray(sectionDisambiguationPolicy?.rules)
      ? (sectionDisambiguationPolicy?.rules as Array<Record<string, unknown>>)
      : [];
    const sectionAskRule =
      sectionRules.find((rule) => {
        const action = String(rule?.action || "").trim().toUpperCase();
        const candidateType = String(rule?.candidateType || "")
          .trim()
          .toLowerCase();
        return action === "ASK_WHICH_SECTION" && candidateType === "section";
      }) ?? null;
    const sectionPolicyEnabled = sectionPolicyConfig.enabled !== false;
    const sectionAutopickMinConfidence = clamp01(
      Number(sectionPolicyThresholds.autopickMinConfidence ?? 0.9),
    );
    const sectionAutopickMinGap = clamp01(
      Number(sectionPolicyThresholds.autopickMinGap ?? 0.3),
    );
    const sectionDisambiguateIfBelow = clamp01(
      Number(sectionPolicyThresholds.disambiguateIfBelow ?? 0.75),
    );
    const sectionDisambiguationMaxOptions = Math.max(
      1,
      Math.floor(
        Number(
          sectionAskRule?.maxOptions ??
            ambiguityThresholds.maxOptions ??
            4,
        ),
      ),
    );
    const sectionDisambiguationMaxQuestions = Math.max(
      1,
      Math.floor(
        Number(sectionPolicyConfig.maxQuestions ?? sectionAskRule?.maxQuestions ?? 1),
      ),
    );
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
      const versionResolution = this.resolveVersionAwareDocChoice({
        query: qNorm,
        docs,
        rankedCandidates: disambiguationOptions,
        amendmentChainSchema,
      });
      if (versionResolution.docId) {
        debug.appliedRules.push(
          `version_resolution_autopick:${versionResolution.reason}`,
        );
        activeDocId = versionResolution.docId;
        hardDocLock = true;
        candidateDocIds = [versionResolution.docId];
        needsDocChoice = false;
        disambiguationOptions = [];
      } else if (versionResolution.ambiguous) {
        debug.appliedRules.push("version_resolution_requires_clarification");
      }

      // Apply policy thresholds (autopick vs disambiguate)
      const topScore = disambiguationOptions[0]?.score ?? 0;
      const gap =
        disambiguationOptions.length >= 2
          ? topScore - (disambiguationOptions[1].score ?? 0)
          : 1;

      const autopickTop = Number(ambiguityThresholds.autopickTopScore ?? 0.85);
      const autopickGap = Number(ambiguityThresholds.autopickGap ?? 0.25);

      const topDoc = disambiguationOptions[0]?.docId ?? null;
      if (
        topDoc &&
        !versionResolution.ambiguous &&
        topScore >= autopickTop &&
        gap >= autopickGap
      ) {
        debug.appliedRules.push("autopick_safe_doc_choice");
        activeDocId = topDoc;
        hardDocLock = true;
        candidateDocIds = [topDoc];
        needsDocChoice = false;
        disambiguationOptions = [];
      }
    }

    // 11b) Section-level ambiguity: if doc is resolved but user referenced a section
    // that matches multiple sections within the doc (section_disambiguation_policy)
    let needsSectionChoice = false;
    let activeSectionHint: string | null = null;
    let sectionDisambiguationOptions: Array<{
      docId: string;
      score: number;
      title?: string | null;
      filename?: string | null;
    }> = [];

    if (activeDocId && !needsDocChoice) {
      const sectionResult = this.extractSectionHint(
        qLower,
        activeDocId,
        docs,
        docTaxonomyBank,
        diSectionOntologyBank,
        headingsMapBank,
      );
      if (sectionResult) {
        activeSectionHint = sectionResult.candidates[0]?.label ?? null;

        if (sectionResult.candidates.length >= 2) {
          const topSectionScore = sectionResult.candidates[0].score;
          const secondSectionScore = sectionResult.candidates[1].score;
          const sectionGap = topSectionScore - secondSectionScore;

          // Autopick if top section clearly wins
          const canAutopickSection = sectionPolicyEnabled
            ? topSectionScore >= sectionAutopickMinConfidence &&
              sectionGap >= sectionAutopickMinGap &&
              topSectionScore >= sectionDisambiguateIfBelow
            : topSectionScore >= 0.9 && sectionGap >= 0.3;
          if (canAutopickSection) {
            activeSectionHint = sectionResult.candidates[0].label;
            if (sectionPolicyEnabled) {
              debug.appliedRules.push("section_disambiguation_policy_autopick");
            }
            debug.appliedRules.push("autopick_safe_section_choice");
          } else {
            needsSectionChoice = true;
            sectionDisambiguationOptions = sectionResult.candidates.map((c) => ({
              docId: activeDocId!,
              score: c.score,
              title: c.label,
              filename: null,
            }));
            if (sectionPolicyEnabled) {
              debug.appliedRules.push("section_disambiguation_policy_disambiguate");
            }
            debug.appliedRules.push("needs_section_choice_ambiguous_ref");
          }
        } else if (sectionResult.candidates.length === 1) {
          activeSectionHint = sectionResult.candidates[0].label;
          debug.appliedRules.push("section_hint_single_match");
        }
      }
    }

    // 11b) Quality trigger gate awareness — record which quality banks are loaded.
    const qualityGatesLoaded = Object.entries(qualityTriggers)
      .filter(([, bank]) => {
        if (bank == null) return false;
        return (bank as { config?: { enabled?: boolean } }).config?.enabled !== false;
      })
      .map(([key]) => key);
    if (qualityGatesLoaded.length > 0) {
      debug.notes.push(`quality_gates_loaded: ${qualityGatesLoaded.join(",")}`);
    }

    // 11c) Period/unit slot extraction
    const periodUnitHints = this.extractPeriodUnitHints(qLower);
    if (periodUnitHints.timeConstraintsPresent) {
      debug.notes.push("time_constraints_present");
    }
    if (periodUnitHints.periodHint && !periodUnitHints.comparisonModeHint && !periodUnitHints.unitHint) {
      // Time detected but scope ambiguous — emit reason code downstream
      debug.notes.push("period_hint_without_comparison_or_unit");
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
      const maxOptions = Number(ambiguityThresholds.maxOptions ?? 4);

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
          activeSectionHint: null,
          needsSectionChoice: false,

          periodHint: periodUnitHints.periodHint,
          unitHint: periodUnitHints.unitHint,
          currencyHint: periodUnitHints.currencyHint,
          comparisonModeHint: periodUnitHints.comparisonModeHint,
          timeConstraintsPresent: periodUnitHints.timeConstraintsPresent,
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

    // 13b) Section disambiguation routing
    if (needsSectionChoice) {
      const maxOptions = sectionDisambiguationMaxOptions;

      return this.finish(state, input, {
        action: "route",
        severity: "warning",
        reasonCodes: ["needs_section_choice"],
        routeTo: "clarification_policy",
        signals: {
          hardScopeActive: true,
          explicitDocRef: Boolean(explicitDocRef),
          explicitDocLock: Boolean(hardDocLock),
          activeDocId: activeDocId,
          corpusSearchAllowed: corpusAllowed,

          sheetHintPresent: Boolean(sheetHintPresent),
          activeSheetName: sheetName,
          rangeExplicit: Boolean(rangeExplicit),
          activeRangeA1: rangeA1,

          needsDocChoice: false,
          activeSectionHint: activeSectionHint,
          needsSectionChoice: true,

          periodHint: periodUnitHints.periodHint,
          unitHint: periodUnitHints.unitHint,
          currencyHint: periodUnitHints.currencyHint,
          comparisonModeHint: periodUnitHints.comparisonModeHint,
          timeConstraintsPresent: periodUnitHints.timeConstraintsPresent,
        },
        scope: { candidateDocIds, scopeKey },
        disambiguation: {
          candidateType: "section",
          options: sectionDisambiguationOptions.slice(0, maxOptions),
          maxOptions,
          maxQuestions: sectionDisambiguationMaxQuestions,
          reasonCode: "needs_section_choice",
        },
        debug: isProd(input.env) ? undefined : debug,
      });
    }

    // 14) Normal allow path
    const hardScopeActive = Boolean(
      explicitDocResolvedHard ||
      (hardDocLock && activeDocId) ||
      hardSheetLock ||
      (input.signals as Record<string, unknown>).hardScopeActive,
    );

    return this.finish(state, input, {
      action: "allow",
      severity: "info",
      reasonCodes: [
        ...(explicitDocResolvedHard ? ["explicit_doc_required"] : []),
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

        activeSectionHint: activeSectionHint,
        needsSectionChoice: false,

        periodHint: periodUnitHints.periodHint,
        unitHint: periodUnitHints.unitHint,
        currencyHint: periodUnitHints.currencyHint,
        comparisonModeHint: periodUnitHints.comparisonModeHint,
        timeConstraintsPresent: periodUnitHints.timeConstraintsPresent,
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
    docAliasesBank: { config?: Record<string, unknown> } | null;
    stopwordsDocnames: Record<string, unknown> | null;
  }): Promise<{
    docId: string | null;
    confidence: number;
    method: "upstream" | "filename" | "alias" | "none";
  }> {
    const queryLower = lower(args.qNorm);

    // Query contains full filename mention(s) (common natural phrasing like "open X.pdf").
    // Only auto-resolve when exactly one filename is mentioned.
    const filenameMentions = args.docs.filter((d) => {
      const fn = lower(d.filename ?? "");
      return Boolean(fn) && queryLower.includes(fn);
    });
    if (filenameMentions.length === 1) {
      return {
        docId: filenameMentions[0].docId,
        confidence: 0.95,
        method: "filename",
      };
    }

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
    const preserveVersionTerms = this.hasVersionIntent(args.qNorm);
    const qTokens = this.docnameTokens(args.qNorm, args.stopwordsDocnames, {
      preserveVersionTerms,
    });
    if (!qTokens.length) return { docId: null, confidence: 0, method: "none" };

    let best: { docId: string; score: number } | null = null;
    for (const d of args.docs) {
      const tTokens = this.docnameTokens(d.title ?? "", args.stopwordsDocnames, {
        preserveVersionTerms,
      });
      const fTokens = this.docnameTokens(
        d.filename ?? "",
        args.stopwordsDocnames,
        { preserveVersionTerms },
      );
      const score = Math.max(
        tokenOverlap(qTokens, tTokens),
        tokenOverlap(qTokens, fTokens),
      );
      if (!best || score > best.score) best = { docId: d.docId, score };
    }

    const docAliasesConfig = asObject(args.docAliasesBank?.config);
    const min = Number(docAliasesConfig.minAliasConfidence ?? 0.75);
    if (best && best.score >= min)
      return {
        docId: best.docId,
        confidence: clamp01(best.score),
        method: "alias",
      };

    return { docId: null, confidence: 0, method: "none" };
  }

  private hasVersionIntent(query: string): boolean {
    const q = foldDiacritics(lower(query));
    if (!q) return false;
    return /\b(latest|newest|recent|current|signed|executed|effective|draft|final|version|revision|rev|amendment|amends|addendum|v\d+|versao|vigente|assinado|rascunho|aditivo|alteracao)\b/i.test(
      q,
    );
  }

  private resolveVersionAwareDocChoice(args: {
    query: string;
    docs: DocMeta[];
    rankedCandidates: ScopeCandidate[];
    amendmentChainSchema: Record<string, unknown> | null;
  }): {
    docId: string | null;
    confidence: number;
    reason: string | null;
    ambiguous: boolean;
  } {
    if (!this.hasVersionIntent(args.query)) {
      return { docId: null, confidence: 0, reason: null, ambiguous: false };
    }
    const query = foldDiacritics(lower(args.query));
    const explicitVersionMatch = query.match(/\bv(?:ersion)?\s*([0-9]{1,3})\b/i);
    const explicitVersion = explicitVersionMatch ? Number(explicitVersionMatch[1]) : null;
    const wantsLatest = /\b(latest|newest|recent|current|ultimo|último|vigente)\b/i.test(
      query,
    );
    const wantsSigned = /\b(signed|executed|effective|assinado|executado|vigente|final)\b/i.test(
      query,
    );
    const wantsDraft = /\b(draft|rascunho|minuta)\b/i.test(query);
    const wantsAmendment =
      /\b(amendment|amends|aditivo|alteracao|alteração|restated)\b/i.test(query);

    const rankedByDocId = new Map(
      args.rankedCandidates.map((candidate, index) => [
        candidate.docId,
        { score: candidate.score, index },
      ]),
    );
    const candidates = args.docs.map((doc, index) => {
      const raw = foldDiacritics(
        `${String(doc.title || "")} ${String(doc.filename || "")}`,
      );
      const versionMatch = raw.match(/\bv(?:ersion)?[_\-\s]?([0-9]{1,3})\b/i);
      const parsedVersion = versionMatch ? Number(versionMatch[1]) : null;
      const status = this.resolveDocVersionStatus(raw, args.amendmentChainSchema);
      const rank = rankedByDocId.get(doc.docId);
      return {
        docId: doc.docId,
        rankScore: rank?.score ?? 0,
        rankIndex: rank?.index ?? index,
        version: Number.isFinite(parsedVersion) ? parsedVersion : null,
        status,
      };
    });
    if (!candidates.length) {
      return { docId: null, confidence: 0, reason: null, ambiguous: true };
    }

    const sortByRank = (rows: Array<(typeof candidates)[number]>) =>
      [...rows].sort((a, b) => {
        if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
        return a.rankIndex - b.rankIndex;
      });
    const byVersionDesc = (rows: Array<(typeof candidates)[number]>) =>
      [...rows].sort((a, b) => {
        const aVersion = a.version ?? -1;
        const bVersion = b.version ?? -1;
        if (bVersion !== aVersion) return bVersion - aVersion;
        if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
        return a.rankIndex - b.rankIndex;
      });

    if (explicitVersion != null && Number.isFinite(explicitVersion)) {
      const versionMatches = sortByRank(
        candidates.filter((candidate) => candidate.version === explicitVersion),
      );
      if (versionMatches.length === 1) {
        return {
          docId: versionMatches[0].docId,
          confidence: 0.93,
          reason: "explicit_version",
          ambiguous: false,
        };
      }
      if (versionMatches.length > 1) {
        return { docId: null, confidence: 0, reason: "explicit_version", ambiguous: true };
      }
    }

    if (wantsDraft) {
      const drafts = byVersionDesc(
        candidates.filter((candidate) => candidate.status === "draft"),
      );
      if (drafts.length === 1) {
        return {
          docId: drafts[0].docId,
          confidence: 0.91,
          reason: "draft_status",
          ambiguous: false,
        };
      }
      if (drafts.length > 1 && drafts[0].rankScore > (drafts[1]?.rankScore ?? 0) + 0.2) {
        return {
          docId: drafts[0].docId,
          confidence: 0.86,
          reason: "draft_status_ranked",
          ambiguous: false,
        };
      }
      if (drafts.length > 0) {
        return { docId: null, confidence: 0, reason: "draft_status", ambiguous: true };
      }
    }

    if (wantsSigned) {
      const signedRows = byVersionDesc(
        candidates.filter(
          (candidate) =>
            candidate.status === "executed" || candidate.status === "effective",
        ),
      );
      if (signedRows.length === 1) {
        return {
          docId: signedRows[0].docId,
          confidence: 0.91,
          reason: "signed_status",
          ambiguous: false,
        };
      }
      if (
        signedRows.length > 1 &&
        (signedRows[0].version ?? -1) > (signedRows[1].version ?? -1)
      ) {
        return {
          docId: signedRows[0].docId,
          confidence: 0.86,
          reason: "signed_latest_version",
          ambiguous: false,
        };
      }
      if (signedRows.length > 0) {
        return { docId: null, confidence: 0, reason: "signed_status", ambiguous: true };
      }
    }

    if (wantsAmendment) {
      const amendments = byVersionDesc(
        candidates.filter((candidate) => candidate.status === "amended"),
      );
      if (amendments.length === 1) {
        return {
          docId: amendments[0].docId,
          confidence: 0.88,
          reason: "amendment_status",
          ambiguous: false,
        };
      }
      if (amendments.length > 1) {
        return { docId: null, confidence: 0, reason: "amendment_status", ambiguous: true };
      }
    }

    if (wantsLatest) {
      const sorted = byVersionDesc(candidates);
      const top = sorted[0];
      const runner = sorted[1] ?? null;
      if (!top) return { docId: null, confidence: 0, reason: "latest", ambiguous: true };
      if (
        runner &&
        (top.version ?? -1) === (runner.version ?? -1) &&
        top.rankScore <= runner.rankScore + 0.15
      ) {
        return { docId: null, confidence: 0, reason: "latest", ambiguous: true };
      }
      const hasSigned = candidates.some(
        (candidate) =>
          candidate.status === "executed" || candidate.status === "effective",
      );
      if (top.status === "draft" && hasSigned) {
        return { docId: null, confidence: 0, reason: "latest", ambiguous: true };
      }
      return {
        docId: top.docId,
        confidence: 0.84,
        reason: "latest_version",
        ambiguous: false,
      };
    }

    return { docId: null, confidence: 0, reason: null, ambiguous: false };
  }

  private resolveDocVersionStatus(
    normalizedDocLabel: string,
    amendmentChainSchema: Record<string, unknown> | null,
  ): "draft" | "executed" | "effective" | "superseded" | "amended" | "unknown" {
    const raw = foldDiacritics(lower(normalizedDocLabel));
    if (!raw) return "unknown";
    if (/\b(draft|rascunho|minuta)\b/i.test(raw)) return "draft";
    if (
      /\b(signed|executed|assinado|executado|final)\b/i.test(raw)
    )
      return "executed";
    if (/\b(effective|vigente)\b/i.test(raw)) return "effective";
    if (/\b(superseded|substituido|substituído)\b/i.test(raw)) return "superseded";

    const patterns = (amendmentChainSchema?.detectionPatterns || {}) as Record<
      string,
      unknown
    >;
    if (this.matchesAnyRegexPattern(raw, patterns.supersedes)) return "superseded";
    if (this.matchesAnyRegexPattern(raw, patterns.amends)) return "amended";
    return "unknown";
  }

  private matchesAnyRegexPattern(input: string, patterns: unknown): boolean {
    if (!Array.isArray(patterns)) return false;
    for (const pattern of patterns) {
      const source = String(pattern || "").trim();
      if (!source) continue;
      try {
        if (new RegExp(source, "i").test(input)) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private docnameTokens(
    s: string,
    stopwordsDocnames: Record<string, unknown> | null,
    options?: { preserveVersionTerms?: boolean },
  ): string[] {
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

    const preserveVersionTerms = options?.preserveVersionTerms === true;
    const filtered = toks.filter((t) => {
      if (generic.has(t)) return false;
      if (!preserveVersionTerms && status.has(t)) return false;
      return true;
    });
    return filtered;
  }

  private matchesAnyDocAliasPhrase(
    query: string,
    phrases: string[],
    taxonomyBank: Record<string, unknown> | null,
  ): boolean {
    const normalizedQuery = lower(query);
    if (!normalizedQuery) return false;

    const taxonomyTokens = Array.isArray(taxonomyBank?.typeDefinitions)
      ? (taxonomyBank.typeDefinitions as Array<Record<string, unknown>>)
          .flatMap((entry: Record<string, unknown>) => [
            lower(String(entry?.id ?? "")),
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
    stopwordsDocnames: Record<string, unknown> | null,
    rankFeatures: Record<string, unknown> | null,
  ): ScopeCandidate[] {
    const preserveVersionTerms = this.hasVersionIntent(query);
    const qTokens = this.docnameTokens(query, stopwordsDocnames, {
      preserveVersionTerms,
    });
    const out: ScopeCandidate[] = [];

    for (const d of docs) {
      const titleTokens = this.docnameTokens(d.title ?? "", stopwordsDocnames, {
        preserveVersionTerms,
      });
      const fileTokens = this.docnameTokens(
        d.filename ?? "",
        stopwordsDocnames,
        { preserveVersionTerms },
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
  // Section hint extraction
  // -----------------------------

  private extractSectionHint(
    normalizedQuery: string,
    activeDocId: string,
    docs: DocMeta[],
    docTaxonomyBank: Record<string, unknown> | null,
    diSectionOntologyBank: Record<string, unknown> | null,
    headingsMapBank: Record<string, unknown> | null,
  ): { candidates: Array<{ sectionId: string; label: string; score: number }> } | null {
    const queryFolded = foldDiacritics(normalizedQuery);
    const sectionKeywords =
      /\b(clause|section|part|article|clausula|secao|artigo)\b/i;
    const match = queryFolded.match(sectionKeywords);
    if (!match) return null;

    const activeDoc = docs.find((d) => d.docId === activeDocId);
    if (!activeDoc) return null;

    const keywordIndex = match.index ?? 0;
    const afterKeyword = queryFolded
      .slice(keywordIndex + match[0].length)
      .trim();
    const identifierMatch = afterKeyword.match(
      /^[\s:#-]*([a-z0-9]+(?:\.[a-z0-9]+)*)\b/i,
    );
    const sectionRef = String(identifierMatch?.[1] || "").toLowerCase();

    const isRomanRef = /^(?:[ivxlcdm]+)$/i.test(sectionRef);
    const isNumericRef = /^\d+(?:\.\d+)*$/.test(sectionRef);
    const isShortAlphaRef = /^[a-z]$/i.test(sectionRef);
    const isExplicitSectionRef =
      Boolean(sectionRef) && (isNumericRef || isRomanRef || isShortAlphaRef);

    if (isExplicitSectionRef) {
      const candidates: Array<{ sectionId: string; label: string; score: number }> = [];
      if (/^\d+$/.test(sectionRef) || isShortAlphaRef) {
        candidates.push({
          sectionId: `${activeDocId}#${sectionRef}`,
          label: `${match[0]} ${sectionRef}`,
          score: 0.7,
        });
        for (let i = 1; i <= 3; i++) {
          candidates.push({
            sectionId: `${activeDocId}#${sectionRef}.${i}`,
            label: `${match[0]} ${sectionRef}.${i}`,
            score: clamp01(0.65 - i * 0.05),
          });
        }
      } else {
        candidates.push({
          sectionId: `${activeDocId}#${sectionRef}`,
          label: `${match[0]} ${sectionRef}`,
          score: 0.95,
        });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates.length > 0 ? { candidates } : null;
    }

    const descriptor = afterKeyword
      .replace(/^[\s:,-]*/, "")
      .replace(
        /^(about|regarding|on|for|the|a|an|de|do|da|dos|das|sobre|acerca|del|de la|de los)\b[\s:,-]*/i,
        "",
      )
      .replace(/[?.!,;:]+$/g, "")
      .trim();
    if (!descriptor) return null;

    const sectionStopwords = new Set([
      "where",
      "what",
      "which",
    ]);
    const descriptorTokens = foldDiacritics(descriptor)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter(
        (token) => token.length >= 3 && !sectionStopwords.has(token),
      );
    if (!descriptorTokens.length) return null;

    const phraseMap = new Map<string, { label: string; weight: number }>();
    const appendPhrase = (
      value: unknown,
      weight = 1,
    ) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      const normalized = foldDiacritics(raw).replace(/\s+/g, " ").trim();
      if (!normalized || normalized.length < 3) return;
      const existing = phraseMap.get(normalized);
      if (!existing || weight > existing.weight) {
        phraseMap.set(normalized, { label: raw, weight });
      }
    };

    const typeDefinitions = Array.isArray(docTaxonomyBank?.typeDefinitions)
      ? (docTaxonomyBank.typeDefinitions as Array<Record<string, unknown>>)
      : [];
    for (const definition of typeDefinitions) {
      const requiredSections = Array.isArray(definition?.requiredSections)
        ? definition.requiredSections
        : [];
      const aliases = Array.isArray(definition?.aliases) ? definition.aliases : [];
      requiredSections.forEach((phrase) => appendPhrase(phrase, 1.1));
      aliases.forEach((phrase) => appendPhrase(phrase, 1));
    }

    const ontologySections = Array.isArray(diSectionOntologyBank?.sections)
      ? (diSectionOntologyBank.sections as Array<Record<string, unknown>>)
      : [];
    for (const section of ontologySections) {
      if (this.isSyntheticSectionOntologyEntry(section)) continue;
      appendPhrase(section?.label, 0.95);
      appendPhrase(section?.labelPt, 0.95);
      appendPhrase(section?.category, 0.85);
      const variants = asObject(section?.headerVariants);
      Object.values(variants).forEach((entries) => {
        if (!Array.isArray(entries)) return;
        entries.forEach((phrase) => appendPhrase(phrase, 0.9));
      });
    }
    const headings = Array.isArray(headingsMapBank?.headings)
      ? (headingsMapBank.headings as Array<Record<string, unknown>>)
      : [];
    for (const heading of headings) {
      const canonical = String(heading?.canonical || "")
        .trim()
        .replace(/_/g, " ");
      appendPhrase(canonical, 1.2);
      const synonyms = asObject(heading?.synonyms);
      const en = Array.isArray(synonyms.en) ? synonyms.en : [];
      const pt = Array.isArray(synonyms.pt) ? synonyms.pt : [];
      en.forEach((phrase) => appendPhrase(phrase, 1.2));
      pt.forEach((phrase) => appendPhrase(phrase, 1.2));
    }

    const descriptorText = descriptorTokens.join(" ");
    const descriptorSet = new Set(descriptorTokens);
    const descriptorMentionsClauseFamily = /\b(clause|section|article|clausula|cláusula|secao|seção|artigo)\b/i.test(
      foldDiacritics(descriptor),
    );
    const semanticCandidates: Array<{ sectionId: string; label: string; score: number }> = [];

    for (const [phraseNormalized, phrase] of phraseMap.entries()) {
      const phraseTokens = phraseNormalized
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .filter((token) => token.length >= 3);
      if (!phraseTokens.length) continue;
      const overlap = phraseTokens.filter((token) => descriptorSet.has(token)).length;
      const overlapRatio = overlap / Math.max(descriptorSet.size, phraseTokens.length);
      const exactInQuery = new RegExp(
        `(^|\\b)${escapeRegex(phraseNormalized)}(\\b|$)`,
        "i",
      ).test(queryFolded);

      let score = 0;
      if (exactInQuery) {
        score = 0.95;
      } else if (overlapRatio >= 0.66) {
        score = 0.84 + Math.min(0.1, overlapRatio * 0.12);
      } else if (descriptorSet.size === 1 && overlap >= 1) {
        score = 0.78;
      }
      const phraseMentionsClauseFamily = /\b(clause|section|article|clausula|clausula|secao|seção|artigo)\b/i.test(
        phraseNormalized,
      );
      if (descriptorMentionsClauseFamily && phraseMentionsClauseFamily) {
        score += 0.05;
      } else if (descriptorMentionsClauseFamily && !phraseMentionsClauseFamily) {
        score -= 0.07;
      }
      score *= phrase.weight;
      if (score < 0.75) continue;

      semanticCandidates.push({
        sectionId: `${activeDocId}#${phraseNormalized.replace(/\s+/g, "_").slice(0, 96)}`,
        label: phrase.label,
        score: clamp01(score),
      });
    }

    if (!semanticCandidates.length) {
      return {
        candidates: [
          {
            sectionId: `${activeDocId}#${descriptorText.replace(/\s+/g, "_").slice(0, 96)}`,
            label: descriptor,
            score: 0.78,
          },
        ],
      };
    }

    semanticCandidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });
    return { candidates: semanticCandidates.slice(0, 4) };
  }

  private isSyntheticSectionOntologyEntry(
    section: Record<string, unknown>,
  ): boolean {
    const id = String(section?.id || "")
      .trim()
      .toLowerCase();
    const label = String(section?.label || "")
      .trim()
      .toLowerCase();
    const labelPt = String(section?.labelPt || "")
      .trim()
      .toLowerCase();
    const families = Array.isArray(section?.families)
      ? section.families.map((value) => String(value || "").toLowerCase())
      : [];
    const isSyntheticId = /^sec_[0-9]{3,}$/.test(id);
    const syntheticLabel =
      /^(overview|financial|legal|clinical|operations|method|risk|compliance|appendix|table)\s+\d+$/i.test(
        label,
      ) ||
      /^(visao geral|financeiro|juridico|clinico|operacoes|metodologia|risco|conformidade|apendice|tabela)\s+\d+$/i.test(
        foldDiacritics(labelPt),
      );
    const genericFamilyBundle =
      families.includes("cross_domain") && families.includes("structural");
    return isSyntheticId && syntheticLabel && genericFamilyBundle;
  }

  // -----------------------------
  // Period/unit slot extraction
  // -----------------------------

  private extractPeriodUnitHints(normalizedQuery: string): {
    periodHint: string | null;
    unitHint: string | null;
    currencyHint: string | null;
    comparisonModeHint: string | null;
    timeConstraintsPresent: boolean;
  } {
    let periodHint: string | null = null;
    let unitHint: string | null = null;
    let currencyHint: string | null = null;
    let comparisonModeHint: string | null = null;
    let timeConstraintsPresent = false;

    // Period detection
    const fyMatch = normalizedQuery.match(
      /\b(fy|fiscal\s*year|ano\s*fiscal)\s*\d{2,4}/i,
    );
    if (fyMatch) {
      periodHint = fyMatch[0].trim();
      timeConstraintsPresent = true;
    }

    if (!periodHint) {
      const quarterMatch = normalizedQuery.match(
        /\b(q[1-4]|quarter|trimestre)\b/i,
      );
      if (quarterMatch) {
        periodHint = quarterMatch[0].trim();
        timeConstraintsPresent = true;
      }
    }

    if (!periodHint) {
      const relativeMatch = normalizedQuery.match(
        /\b(ytd|ttm|yoy|qoq|mom)\b/i,
      );
      if (relativeMatch) {
        periodHint = relativeMatch[0].trim();
        timeConstraintsPresent = true;
      }
    }

    // Units detection
    const unitMatch = normalizedQuery.match(
      /\b(thousands?|millions?|billions?|milhares?|milh[oõ]es?|bilh[oõ]es?)\b/i,
    );
    if (unitMatch) {
      unitHint = unitMatch[0].trim();
    }

    // Currency detection
    const currencyMatch = normalizedQuery.match(
      /\b(usd|eur|brl|gbp|jpy|cad|aud)\b/i,
    );
    if (currencyMatch) {
      currencyHint = currencyMatch[0].trim().toUpperCase();
    }

    // Comparison mode detection
    const comparisonMatch = normalizedQuery.match(
      /\b(yoy|year[\-\s]over[\-\s]year|qoq|vs\.?\s*budget)\b/i,
    );
    if (comparisonMatch) {
      comparisonModeHint = comparisonMatch[0].trim();
      timeConstraintsPresent = true;
    }

    // Fallback time detection (years, months)
    if (!timeConstraintsPresent) {
      const timePresent = /\b(20[0-2]\d|19\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
      if (timePresent.test(normalizedQuery)) {
        timeConstraintsPresent = true;
      }
    }

    return { periodHint, unitHint, currencyHint, comparisonModeHint, timeConstraintsPresent };
  }

  // -----------------------------
  // Scope key
  // -----------------------------

  private scopeKey(docIds: string[], extra?: Record<string, unknown>): string {
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

  private safeGetBank<T = unknown>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
