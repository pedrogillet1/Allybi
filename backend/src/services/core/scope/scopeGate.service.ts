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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAnyPhrase(query: string, phrases: string[]): boolean {
  const normalized = lower(query);
  if (!normalized) return false;
  return phrases.some((phrase) => {
    const cleaned = lower(phrase);
    if (!cleaned) return false;
    return new RegExp(`(^|\\b)${escapeRegex(cleaned)}(\\b|$)`, "i").test(
      normalized,
    );
  });
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
      | "getLanguageBank"
      | "getDocAliasPhrases"
      | "getDocTaxonomy"
      | "getScopeResolutionRules"
      | "getFollowupPolicy"
      | "getDocLockPolicy"
      | "getFolderScopePatterns"
      | "getOneBestQuestionPolicy"
      | "getContextContainerProfiles"
      | "getConversationStateCarryover"
      | "getMultiDocCompareRules"
      | "getProjectMemoryPolicy"
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
    const scopeHintsBank = this.safeGetBank<Record<string, unknown>>("scope_hints");
    const scopeResolutionBank =
      ("getScopeResolutionRules" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getScopeResolutionRules?.()
        : null) ??
      this.safeGetBank<ScopeResolutionBank>("scope_resolution");
    const followupBank =
      ("getFollowupPolicy" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getFollowupPolicy?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("followup_indicators");
    const docLockPolicy =
      ("getDocLockPolicy" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getDocLockPolicy?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("doc_lock_policy");
    const folderScopePatterns =
      ("getFolderScopePatterns" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getFolderScopePatterns?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("folder_scope_patterns");
    const contextContainerProfiles =
      ("getContextContainerProfiles" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getContextContainerProfiles?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("context_container_profiles");
    const conversationStateCarryover =
      ("getConversationStateCarryover" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getConversationStateCarryover?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("conversation_state_carryover");
    const multiDocCompareRules =
      ("getMultiDocCompareRules" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getMultiDocCompareRules?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("multi_doc_compare_rules");
    const projectMemoryPolicy =
      ("getProjectMemoryPolicy" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getProjectMemoryPolicy?.()
        : null) ??
      this.safeGetBank<Record<string, unknown>>("project_memory_policy");
    const colloquialPhrasing =
      ("getLanguageBank" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getLanguageBank?.(
            "colloquial_phrasing",
          )
        : null) ??
      this.safeGetBank<Record<string, unknown>>("colloquial_phrasing");
    const oneBestQuestionPolicy =
      ("getOneBestQuestionPolicy" in this.documentIntelligenceBanks
        ? (this.documentIntelligenceBanks as Record<string, any>).getOneBestQuestionPolicy?.()
        : null) ?? null;
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
    const stopwordsDocnames = this.safeGetBank<Record<string, unknown>>("stopwords_docnames");
    const ambiguityPolicies = this.safeGetBank<Record<string, unknown>>("disambiguation_policies");
    const rankFeatures = this.safeGetBank<Record<string, unknown>>("ambiguity_rank_features");
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
    let corpusAllowed = Boolean(
      input.signals.corpusSearchAllowed ?? isDiscovery,
    );
    const forceSingleQuestion =
      oneBestQuestionPolicy?.config?.maxQuestions === 1;

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
    const compareConfig = asObject(multiDocCompareRules?.config);
    const compareIntent =
      String(input.signals.operator || "").trim().toLowerCase() === "compare" ||
      /\b(compare|versus|vs\.?|against|between|delta|difference|trend)\b/i.test(
        qNorm,
      );
    const compareAcrossCorpus =
      compareConfig.allowCorpusTrendMode === true &&
      compareIntent &&
      /\b(all|every|across|trend)\b/i.test(qLower);
    if (compareAcrossCorpus) {
      corpusAllowed = true;
      debug.appliedRules.push("scope_compare_allows_corpus_trend_mode");
    }

    // 4) Extract explicit filename token if present
    const filenameToken = detectFilenameToken(qNorm);

    // 5) Establish base active doc and lock signals from state
    const stateActiveDocId = state.persistent.scope.activeDocId;
    const stateHardDocLock = Boolean(state.persistent.scope.hardDocLock);
    const userLanguage = String(state.session.userLanguage || "en")
      .trim()
      .toLowerCase();
    const colloquialPhraseMap = asObject(colloquialPhrasing?.phrases);
    const colloquialPhrases = [
      ...(Array.isArray(colloquialPhraseMap[userLanguage])
        ? (colloquialPhraseMap[userLanguage] as unknown[])
        : []),
      ...(Array.isArray(colloquialPhraseMap.any)
        ? (colloquialPhraseMap.any as unknown[])
        : []),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const colloquialRefersToActiveDoc =
      Boolean(stateActiveDocId) &&
      !Boolean(input.signals.explicitDocRef) &&
      containsAnyPhrase(qNorm, colloquialPhrases);
    if (colloquialRefersToActiveDoc) {
      debug.appliedRules.push("scope_colloquial_reference_to_active_doc");
    }

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
    let hardDocLock =
      stateHardDocLock ||
      docLockPolicy?.policy?.retainHardLockAcrossFollowups === true;
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

    const contextProfiles = Array.isArray(contextContainerProfiles?.profiles)
      ? contextContainerProfiles.profiles
      : [];
    const activeContextProfile = contextProfiles.find(
      (profile: Record<string, unknown>) =>
        String(profile?.id || "")
          .trim()
          .toLowerCase() === (corpusAllowed ? "corpus" : "single_doc"),
    );
    if (
      activeContextProfile?.requiresActiveDoc === true &&
      !activeDocId &&
      !explicitResolved.docId
    ) {
      corpusAllowed = true;
      debug.appliedRules.push("scope_context_profile_fallback_to_corpus");
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
    const carryoverRules = asObject(conversationStateCarryover?.rules);
    let continuityAllowed =
      (isFollowup || colloquialRefersToActiveDoc) &&
      (carryoverRules.followupKeepsActiveDoc !== false ||
        colloquialRefersToActiveDoc);
    if (
      topicShift &&
      carryoverRules.topicShiftBreaksSoftCarryover !== false &&
      !stateHardDocLock
    ) {
      continuityAllowed = false;
    }

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
    if (
      folderScopePatterns &&
      !hardSheetLock &&
      /folder|pasta/i.test(qNorm)
    ) {
      debug.notes.push("folder_scope_patterns_detected");
    }

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

    if (
      compareIntent &&
      compareConfig.requireTwoDocs === true &&
      candidateDocIds.length === 1 &&
      docs.length > 1 &&
      !explicitDocResolvedHard &&
      !hardDocLock
    ) {
      candidateDocIds = docs.slice(0, 2).map((doc) => doc.docId);
      debug.appliedRules.push("scope_compare_requires_two_docs");
    }

    if (
      projectMemoryPolicy?.policy?.docLockBlocksBroadMemoryBleed === true &&
      hardDocLock &&
      activeDocId &&
      corpusAllowed &&
      !isDiscovery &&
      !compareAcrossCorpus
    ) {
      corpusAllowed = false;
      candidateDocIds = [activeDocId];
      debug.appliedRules.push("scope_project_memory_blocks_broad_memory_bleed");
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
      const topScore = disambiguationOptions[0]?.score ?? 0;
      const gap =
        disambiguationOptions.length >= 2
          ? topScore - (disambiguationOptions[1].score ?? 0)
          : 1;

      const autopickTop = Number(ambiguityThresholds.autopickTopScore ?? 0.85);
      const autopickGap = Number(ambiguityThresholds.autopickGap ?? 0.25);

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
          maxQuestions: forceSingleQuestion ? 1 : 1,
          reasonCode: "needs_doc_choice",
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

  private docnameTokens(s: string, stopwordsDocnames: Record<string, unknown> | null): string[] {
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
