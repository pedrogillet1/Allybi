// retrievalEngine.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Koda Retrieval Engine (ChatGPT-parity)
 * -------------------------------------
 * This service is deliberately "policy-driven": it reads your data banks and executes a deterministic
 * retrieval pipeline with guardrails:
 *  - scope/lock correctness (never wrong-doc when explicit lock/ref exists)
 *  - expansion gating (no expansion for literals: quotes/filenames; only when allowed)
 *  - hybrid retrieval phases (semantic + lexical rescue + structural anchors)
 *  - negative constraints (hard blocks + soft penalties)
 *  - boosts (keyword/title/type/recency) with caps
 *  - diversification (doc + section spread + near-dup control)
 *  - evidence packaging (strict provenance; no raw dumps)
 *
 * It does NOT generate answers. It only returns an EvidencePack for the composer.
 *
 * NOTE: This file is designed to be drop-in and "engine-ready". You will still need to wire actual
 * indexes (embedding + lexical) to match your storage.
 */

import crypto from "crypto";

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

type CandidateType = "text" | "table" | "image";
type CandidateSource = "semantic" | "lexical" | "structural";

export interface RetrievalRequest {
  query: string;
  env: EnvName;

  // Conversation/scope signals (usually from state + overlays)
  signals: {
    intentFamily?: string | null; // e.g. "documents", "doc_discovery", "file_actions"
    operator?: string | null; // e.g. "summarize", "extract", "locate_docs"
    answerMode?: AnswerMode | null;

    // Scope controls
    explicitDocLock?: boolean; // hard lock active
    activeDocId?: string | null; // locked/active doc id
    explicitDocRef?: boolean; // explicit filename/title reference in this turn
    resolvedDocId?: string | null; // if explicit doc ref resolved

    hardScopeActive?: boolean; // any hard constraints applied
    singleDocIntent?: boolean; // user intent is clearly single doc
    allowExpansion?: boolean; // explicitly allowed by upstream logic
    hasQuotedText?: boolean;
    hasFilename?: boolean;

    // Format cues (downstream composer uses these too; retrieval may use them lightly)
    userAskedForTable?: boolean;
    userAskedForQuote?: boolean;

    // Spreadsheet/PDF hints
    sheetHintPresent?: boolean;
    resolvedSheetName?: string | null;
    rangeExplicit?: boolean;
    resolvedRangeA1?: string | null;

    // Time constraints (recency scaling)
    timeConstraintsPresent?: boolean;
    explicitYearOrQuarterComparison?: boolean;

    // Table expectations
    tableExpected?: boolean;

    // Discovery mode can ignore doc lock for corpus search
    corpusSearchAllowed?: boolean;

    // Safety gate (retrieval should not proceed if unsafe gate is set upstream)
    unsafeGate?: boolean;
  };

  // Optional: if you store recent fallback history/anti-repetition
  history?: {
    recentFallbacks?: Array<{
      reasonCode: string;
      fallbackType: string;
      strategy: string;
      turnId: number;
    }>;
  };

  // Optional: override retrieval preferences (rare; tests/diagnostics)
  overrides?: Partial<RetrievalOverrides>;
}

export interface RetrievalOverrides {
  maxCandidateDocsSoft: number;
  maxCandidateDocsHard: number;
  maxChunksSoft: number;
  maxChunksHard: number;
  disableExpansion: boolean;
  disableDiversification: boolean;
  numericStrict: boolean;
  quoteStrict: boolean;
}

export interface DocMeta {
  docId: string;
  title?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sizeBytes?: number | null;

  // Optional container fields for spreadsheets/slides
  sheets?: string[] | null;
  slideCount?: number | null;
  pageCount?: number | null;
}

export interface ChunkLocation {
  page?: number | null;
  sheet?: string | null;
  slide?: number | null;
  sectionKey?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
}

export interface CandidateChunk {
  candidateId: string;
  type: CandidateType;
  source: CandidateSource;

  docId: string;
  title?: string | null;
  filename?: string | null;

  location: ChunkLocation;
  locationKey: string;

  // Content
  snippet: string; // short extracted snippet (for composer)
  rawText?: string | null; // optional (avoid in user-visible; safe in engine)
  table?: {
    header?: string[];
    rows?: Array<Array<string | number | null>>;
    structureScore?: number;
    numericIntegrityScore?: number;
    warnings?: string[];
  } | null;

  // Scoring components (0..1)
  scores: {
    semantic?: number;
    lexical?: number;
    structural?: number;
    titleBoost?: number;
    keywordBoost?: number;
    typeBoost?: number;
    recencyBoost?: number;
    penalties?: number;
    final?: number;
  };

  // Signals computed during pipeline
  signals: {
    isScopedMatch?: boolean;
    isAnchorMatch?: boolean;
    headerFooterCandidate?: boolean;
    scopeViolation?: boolean;
    lowRelevanceChunk?: boolean;
    tableValidated?: boolean;
  };

  // Provenance constraints
  provenanceOk: boolean;
}

export interface EvidenceItem {
  evidenceType: CandidateType;
  docId: string;
  title?: string | null;
  filename?: string | null;
  location: ChunkLocation;
  locationKey: string;

  snippet?: string; // text evidence
  table?: CandidateChunk["table"];
  imageRef?: string | null; // if you store images separately

  score: {
    finalScore: number;
    semanticScore?: number;
    lexicalScore?: number;
    structuralScore?: number;
    boosts?: Record<string, number>;
    penalties?: Record<string, number>;
  };

  warnings?: string[];
}

export interface EvidencePack {
  query: {
    original: string;
    normalized: string;
    expanded?: string[]; // optional; expansion terms actually used
  };

  scope: {
    activeDocId?: string | null;
    explicitDocLock?: boolean;
    candidateDocIds: string[];
    hardScopeActive?: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  };

  stats: {
    candidatesConsidered: number;
    candidatesAfterNegatives: number;
    candidatesAfterBoosts: number;
    candidatesAfterDiversification: number;
    evidenceItems: number;
    uniqueDocsInEvidence: number;
    topScore: number | null;
    scoreGap: number | null;
  };

  evidence: EvidenceItem[];

  // Debug is *engine-side only*. Never print to user.
  debug?: {
    phases: Array<{ phaseId: string; candidates: number; note?: string }>;
    reasonCodes: string[];
  };
}

interface RetrievalPhaseCounts {
  considered: number;
  afterNegatives: number;
  afterBoosts: number;
  afterDiversification: number;
}

/**
 * Bank loader interface:
 * You can wire your existing bankLoader.service.ts here.
 */
export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

/**
 * Index interfaces (wire to your actual storage).
 * - SemanticIndex: embedding vector search
 * - LexicalIndex: keyword/BM25-like search
 * - StructuralIndex: headings/table headers/TOC anchor signals
 */
export interface SemanticIndex {
  search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface LexicalIndex {
  search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface StructuralIndex {
  search(opts: {
    query: string;
    docIds?: string[];
    k: number;
    anchors: string[];
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  >;
}

export interface DocStore {
  listDocs(): Promise<DocMeta[]>;
  getDocMeta(docId: string): Promise<DocMeta | null>;
}

/**
 * Optional: a normalizer that applies your tokenization/stopwords/etc.
 * If you don't have one, the engine will still run with basic normalization.
 */
export interface QueryNormalizer {
  normalize(
    query: string,
    langHint?: string,
  ): Promise<{
    normalized: string;
    hasQuotedText: boolean;
    hasFilename: boolean;
  }>;
}

/**
 * Utility: stable hash for dedupe keys.
 */
function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeNumber(x: any, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function stableLocationKey(
  docId: string,
  loc: ChunkLocation,
  fallbackId: string,
): string {
  const parts = [
    `d:${docId}`,
    loc.page != null ? `p:${loc.page}` : "",
    loc.sheet ? `s:${loc.sheet}` : "",
    loc.slide != null ? `sl:${loc.slide}` : "",
    loc.sectionKey ? `sec:${loc.sectionKey}` : "",
  ].filter(Boolean);
  const base = parts.join("|");
  return base.length ? base : `d:${docId}|c:${fallbackId}`;
}

function isProduction(env: EnvName): boolean {
  return env === "production";
}

/**
 * Main Service
 */
export class RetrievalEngineService {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly docStore: DocStore,
    private readonly semanticIndex: SemanticIndex,
    private readonly lexicalIndex: LexicalIndex,
    private readonly structuralIndex: StructuralIndex,
    private readonly queryNormalizer?: QueryNormalizer,
  ) {}

  /**
   * Primary entrypoint: run full retrieval pipeline and return EvidencePack.
   */
  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    // 0) Safety gate: retrieval should not proceed if upstream flagged unsafeGate.
    if (req.signals.unsafeGate) {
      return this.emptyPack(req, {
        reasonCodes: ["unsafe_gate"],
        note: "Retrieval bypassed due to unsafeGate signal.",
      });
    }

    // 1) Load banks (single source of truth)
    const semanticCfg = this.getRequiredBank<any>("semantic_search_config");
    const rankerCfg = this.getRequiredBank<any>("retrieval_ranker_config");
    const boostsKeyword = this.safeGetBank<any>("keyword_boost_rules");
    const boostsTitle = this.safeGetBank<any>("doc_title_boost_rules");
    const boostsType = this.safeGetBank<any>("doc_type_boost_rules");
    const boostsRecency = this.safeGetBank<any>("recency_boost_rules");
    const diversification = this.getRequiredBank<any>("diversification_rules");
    const negatives = this.getRequiredBank<any>("retrieval_negatives");
    const packaging = this.getRequiredBank<any>("evidence_packaging");

    // 2) Normalize query (bank-driven normalization should happen upstream, but we support it here too)
    const norm = await this.normalizeQuery(req);
    const queryOriginal = req.query;
    const queryNormalized = norm.normalized;

    // Merge detected literals into signals if upstream didn’t set them
    const signals = {
      ...req.signals,
      hasQuotedText: req.signals.hasQuotedText ?? norm.hasQuotedText,
      hasFilename: req.signals.hasFilename ?? norm.hasFilename,
    };

    // 3) Determine scope docIds (strict on explicit doc locks/refs)
    const scope = await this.resolveScope(req, signals, semanticCfg);
    if (scope.hardScopeActive && scope.candidateDocIds.length === 0) {
      const reasonCode = signals.explicitDocRef
        ? "explicit_doc_not_found"
        : "scope_hard_constraints_empty";
      return this.emptyPack(req, {
        reasonCodes: [reasonCode],
        note: "Hard scope active but no candidate documents resolved.",
      });
    }

    // 4) Expansion gating (never expand literals; only when allowed)
    const expansion = this.computeExpansionPolicy(req, signals, semanticCfg);
    const expansionDisabledByOverride = Boolean(
      req.overrides?.disableExpansion,
    );
    const expandedQueries = expansion.enabled
      ? expansionDisabledByOverride
        ? []
        : this.expandQuery(queryNormalized, signals)
      : [];
    const queryForSearch = expandedQueries.length
      ? expandedQueries.join(" ")
      : queryNormalized;

    // 5) Execute hybrid retrieval phases (semantic + lexical rescue + structural anchors)
    const phaseResults = await this.runPhases({
      query: queryForSearch,
      scopeDocIds: scope.candidateDocIds,
      semanticCfg,
    });

    // 6) Merge into CandidateChunks with provenance + stable ids
    let candidates = this.mergePhaseCandidates(phaseResults, scope, req);
    const phaseCounts: RetrievalPhaseCounts = {
      considered: candidates.length,
      afterNegatives: candidates.length,
      afterBoosts: candidates.length,
      afterDiversification: candidates.length,
    };

    // 7) Apply retrieval negatives (hard blocks + soft penalties) deterministically
    candidates = this.applyRetrievalNegatives(
      candidates,
      req,
      signals,
      negatives,
    );
    phaseCounts.afterNegatives = candidates.length;

    // 8) Apply boosts (keyword/title/type/recency), with caps and guards
    candidates = this.applyBoosts(candidates, req, signals, {
      boostsKeyword,
      boostsTitle,
      boostsType,
      boostsRecency,
    });
    phaseCounts.afterBoosts = candidates.length;

    // 9) Rank candidates using ranker config (weights + normalization + tie-breakers)
    candidates = this.rankCandidates(candidates, req, signals, rankerCfg);

    // 10) Diversify (doc/section spread + near-dup control) unless disabled by overrides/lock policy
    if (!req.overrides?.disableDiversification) {
      candidates = this.applyDiversification(
        candidates,
        req,
        signals,
        diversification,
      );
    }
    phaseCounts.afterDiversification = candidates.length;

    // 11) Package evidence (strict provenance + caps) into EvidencePack
    const pack = this.packageEvidence(candidates, req, signals, packaging, {
      queryOriginal,
      queryNormalized,
      expandedQueries,
      scope,
      phaseCounts,
    });

    // 12) Final safety: never include raw debug in production (still keep internal stats)
    if (pack.evidence.length === 0 && scope.hardScopeActive) {
      const reasonCode =
        signals.explicitDocRef && !signals.resolvedDocId
          ? "explicit_doc_not_found"
          : "scope_hard_constraints_empty";
      if (!pack.debug) {
        pack.debug = { phases: [], reasonCodes: [reasonCode] };
      } else if (!pack.debug.reasonCodes.includes(reasonCode)) {
        pack.debug.reasonCodes.push(reasonCode);
      }
    }

    if (isProduction(req.env)) {
      delete pack.debug;
    }

    return pack;
  }

  // -----------------------------
  // Normalization
  // -----------------------------

  private async normalizeQuery(req: RetrievalRequest): Promise<{
    normalized: string;
    hasQuotedText: boolean;
    hasFilename: boolean;
  }> {
    if (this.queryNormalizer) {
      return this.queryNormalizer.normalize(
        req.query,
        req.signals?.intentFamily ?? "any",
      );
    }

    // Fallback normalization (non-destructive)
    const q = (req.query ?? "").trim().replace(/\s+/g, " ");
    const hasQuotedText = /"[^"]{2,}"/.test(q);
    const hasFilename =
      /\b\w[\w\-_. ]{0,160}\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\b/i.test(
        q,
      );

    // Light casefold for matching; do not remove punctuation aggressively
    const normalized = q.toLowerCase();
    return { normalized, hasQuotedText, hasFilename };
  }

  // -----------------------------
  // Scope resolution (docIds)
  // -----------------------------

  private async resolveScope(
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    semanticCfg: any,
  ): Promise<{
    candidateDocIds: string[];
    hardScopeActive: boolean;
    sheetName?: string | null;
    rangeA1?: string | null;
  }> {
    const docs = await this.docStore.listDocs();
    const allDocIds = docs.map((d) => d.docId);
    const overrideCap = Number(req.overrides?.maxCandidateDocsHard);
    const maxCandidateDocsHard =
      Number.isFinite(overrideCap) && overrideCap > 0
        ? Math.floor(overrideCap)
        : 0;
    const allDocIdsCapped =
      maxCandidateDocsHard > 0
        ? allDocIds.slice(0, maxCandidateDocsHard)
        : allDocIds;

    const explicitDocId = signals.resolvedDocId ?? null;
    const activeDocId = signals.activeDocId ?? null;

    const isDiscovery = (signals.intentFamily ?? null) === "doc_discovery";
    const corpusAllowed = signals.corpusSearchAllowed ?? isDiscovery;

    // Explicit doc ref always wins (hard lock candidate)
    if (signals.explicitDocRef) {
      if (!explicitDocId) {
        return {
          candidateDocIds: [],
          hardScopeActive: true,
          sheetName: signals.resolvedSheetName ?? null,
          rangeA1: signals.resolvedRangeA1 ?? null,
        };
      }
      return {
        candidateDocIds: [explicitDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Explicit doc lock: restrict to active doc unless discovery mode
    if (signals.explicitDocLock && activeDocId && !corpusAllowed) {
      return {
        candidateDocIds: [activeDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Single-doc intent: prefer active doc if exists; else fall back to corpus
    if (signals.singleDocIntent && activeDocId && !corpusAllowed) {
      return {
        candidateDocIds: [activeDocId],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }

    // Otherwise corpus-wide candidates (later doc selection/ranker will narrow)
    // Note: semantic_search_config may cap candidate docs; keep all here, cap later.
    return {
      candidateDocIds: allDocIdsCapped,
      hardScopeActive: Boolean(
        activeDocId || explicitDocId || signals.hardScopeActive,
      ),
      sheetName: signals.resolvedSheetName ?? null,
      rangeA1: signals.resolvedRangeA1 ?? null,
    };
  }

  // -----------------------------
  // Expansion
  // -----------------------------

  private computeExpansionPolicy(
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    semanticCfg: any,
  ): { enabled: boolean } {
    const policy = semanticCfg?.config?.queryExpansionPolicy;
    const enabledByBank = Boolean(policy?.enabled);

    // Global never-expand literals
    if (signals.hasQuotedText || signals.hasFilename) return { enabled: false };
    if (signals.userAskedForQuote) return { enabled: false };

    // Bank gating
    if (!enabledByBank) return { enabled: false };

    // Must be explicitly allowed upstream OR discovery mode (optional)
    const allowExpansion = Boolean(signals.allowExpansion);
    if (!allowExpansion) return { enabled: false };

    return { enabled: true };
  }

  /**
   * Query expansion using synonym_expansion bank.
   *
   * NOTE: Cross-lingual retrieval is handled by multilingual embeddings (text-embedding-3-small).
   * This expansion is ONLY for:
   *   - Acronyms (ROI, NOI, DRE, EBITDA)
   *   - Domain jargon and abbreviations
   *   - Brazil-specific tokens (NF-e, DARF, NFSe)
   *   - Legal shorthand (NDA, MSA, SOW)
   *
   * Do NOT add general translation terms here - embeddings handle that automatically.
   */
  private expandQuery(
    normalizedQuery: string,
    signals: RetrievalRequest["signals"],
  ): string[] {
    const synonymBank = this.safeGetBank<any>("synonym_expansion");
    if (!synonymBank?.config?.enabled || !synonymBank?.groups) {
      return [normalizedQuery];
    }

    const cfg = synonymBank.config;
    const maxExpansionsTotal = safeNumber(cfg.policy?.maxExpansionsTotal, 12);
    const maxExpansionsPerTerm = safeNumber(
      cfg.policy?.maxExpansionsPerTerm,
      4,
    );

    const queryTokens = this.simpleTokens(normalizedQuery);
    const expansions = new Set<string>([normalizedQuery]);

    // Build lookup map from all groups: variant -> canonical and canonical -> variants
    const variantToCanonical = new Map<string, string>();
    const canonicalToVariants = new Map<string, string[]>();

    for (const group of synonymBank.groups) {
      if (!group.synonyms) continue;
      for (const entry of group.synonyms) {
        const canonical = (entry.canonical ?? "").toLowerCase().trim();
        if (!canonical) continue;

        const variants = (entry.variants ?? [])
          .map((v: string) => v.toLowerCase().trim())
          .filter(Boolean);

        // Map canonical to all variants (for expansion)
        const existing = canonicalToVariants.get(canonical) || [];
        const merged = existing.concat(variants);
        canonicalToVariants.set(canonical, Array.from(new Set(merged)));

        // Map each variant to canonical (for lookup)
        for (const v of variants) {
          variantToCanonical.set(v, canonical);
        }
        // Also map canonical to itself
        variantToCanonical.set(canonical, canonical);
      }
    }

    // For each query token, check if it matches a canonical or variant
    for (const token of queryTokens) {
      if (expansions.size >= maxExpansionsTotal) break;

      // Check if token is a variant -> get canonical
      const canonical = variantToCanonical.get(token);
      if (canonical) {
        // Add canonical if different from token
        if (canonical !== token) {
          expansions.add(
            normalizedQuery.replace(
              new RegExp(`\\b${this.escapeRegex(token)}\\b`, "gi"),
              canonical,
            ),
          );
        }

        // Add other variants of the same concept
        const variants = canonicalToVariants.get(canonical) || [];
        let addedForTerm = 0;
        for (const variant of variants) {
          if (addedForTerm >= maxExpansionsPerTerm) break;
          if (variant !== token && expansions.size < maxExpansionsTotal) {
            expansions.add(
              normalizedQuery.replace(
                new RegExp(`\\b${this.escapeRegex(token)}\\b`, "gi"),
                variant,
              ),
            );
            addedForTerm++;
          }
        }
      }
    }

    return Array.from(expansions);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // -----------------------------
  // Retrieval phases
  // -----------------------------

  private async runPhases(opts: {
    query: string;
    scopeDocIds: string[];
    semanticCfg: any;
  }): Promise<
    Array<{ phaseId: string; source: CandidateSource; hits: any[] }>
  > {
    const phases = opts.semanticCfg?.config?.hybridPhases ?? [];
    const results: Array<{
      phaseId: string;
      source: CandidateSource;
      hits: any[];
    }> = [];

    for (const phase of phases) {
      if (!phase?.enabled) continue;

      if (phase.type === "semantic") {
        const k = safeNumber(phase.k, 80);
        const hits = await this.semanticIndex.search({
          query: opts.query,
          docIds: opts.scopeDocIds,
          k,
        });
        results.push({
          phaseId: phase.id ?? "phase_semantic",
          source: "semantic",
          hits,
        });
      } else if (phase.type === "lexical") {
        const k = safeNumber(phase.k, 120);
        const hits = await this.lexicalIndex.search({
          query: opts.query,
          docIds: opts.scopeDocIds,
          k,
        });
        results.push({
          phaseId: phase.id ?? "phase_lexical",
          source: "lexical",
          hits,
        });
      } else if (phase.type === "structural") {
        const k = safeNumber(phase.k, 60);
        const anchors = Array.isArray(phase.anchors)
          ? phase.anchors
          : ["headings", "table_headers"];
        const hits = await this.structuralIndex.search({
          query: opts.query,
          docIds: opts.scopeDocIds,
          k,
          anchors,
        });
        results.push({
          phaseId: phase.id ?? "phase_structural",
          source: "structural",
          hits,
        });
      }
    }

    return results;
  }

  private mergePhaseCandidates(
    phaseResults: Array<{
      phaseId: string;
      source: CandidateSource;
      hits: any[];
    }>,
    scope: {
      candidateDocIds: string[];
      hardScopeActive: boolean;
      sheetName?: string | null;
      rangeA1?: string | null;
    },
    req: RetrievalRequest,
  ): CandidateChunk[] {
    const out: CandidateChunk[] = [];
    const seen = new Set<string>();

    for (const phase of phaseResults) {
      for (let i = 0; i < phase.hits.length; i++) {
        const hit = phase.hits[i];
        const docId = String(hit.docId);
        const score = clamp01(safeNumber(hit.score, 0));
        const loc: ChunkLocation = hit.location ?? {};
        const locationKey =
          hit.locationKey ??
          stableLocationKey(
            docId,
            loc,
            String(hit.chunkId ?? `${phase.phaseId}:${i}`),
          );
        const candidateId = String(
          hit.chunkId ??
            sha256(
              `${phase.source}|${docId}|${locationKey}|${hit.snippet ?? ""}`,
            ).slice(0, 16),
        );

        const dedupeKey = `${docId}|${locationKey}|${candidateId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        // Minimal provenance requirement: docId + (location OR stable locationKey) + snippet
        const snippet = String(hit.snippet ?? "").trim();
        const provenanceOk = Boolean(docId && locationKey && snippet);

        out.push({
          candidateId,
          type: "text",
          source: phase.source,

          docId,
          title: hit.title ?? null,
          filename: hit.filename ?? null,

          location: loc,
          locationKey,

          snippet,
          rawText: null,
          table: null,

          scores: {
            semantic: phase.source === "semantic" ? score : 0,
            lexical: phase.source === "lexical" ? score : 0,
            structural: phase.source === "structural" ? score : 0,
            penalties: 0,
            final: 0,
          },

          signals: {
            isScopedMatch: scope.hardScopeActive,
            isAnchorMatch: phase.source === "structural",
          },

          provenanceOk,
        });
      }
    }

    return out;
  }

  // -----------------------------
  // Negatives
  // -----------------------------

  private applyRetrievalNegatives(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    negativesBank: any | null,
  ): CandidateChunk[] {
    if (!negativesBank?.config?.enabled) return candidates;

    const cfg = negativesBank.config;
    const minRelevance = safeNumber(
      cfg?.actionsContract?.thresholds?.minRelevanceScore,
      0.55,
    );

    // Hard lock enforcement (engine-side)
    const lockedDocId = signals.explicitDocLock
      ? (signals.activeDocId ?? null)
      : null;

    const out: CandidateChunk[] = [];
    for (const c of candidates) {
      // Hard block: explicit doc lock violation (unless discovery)
      if (
        lockedDocId &&
        c.docId !== lockedDocId &&
        signals.intentFamily !== "doc_discovery"
      ) {
        c.signals.scopeViolation = true;
        continue;
      }

      // Soft/Hard: low relevance chunk exclusion
      const topScore = Math.max(
        c.scores.semantic ?? 0,
        c.scores.lexical ?? 0,
        c.scores.structural ?? 0,
      );
      if (topScore < minRelevance) {
        c.signals.lowRelevanceChunk = true;
        // Many systems exclude; your negatives bank shows exclude_chunk.
        // We'll exclude to avoid weak evidence misleading the answer.
        continue;
      }

      out.push(c);
    }

    return out;
  }

  // -----------------------------
  // Boosts
  // -----------------------------

  private applyBoosts(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    banks: {
      boostsKeyword: any | null;
      boostsTitle: any | null;
      boostsType: any | null;
      boostsRecency: any | null;
    },
  ): CandidateChunk[] {
    // Apply boosts as additive components with caps (final ranker may re-cap).
    for (const c of candidates) {
      // Keyword boost (approximation): if query tokens appear in snippet, treat as body_text match.
      if (banks.boostsKeyword?.config?.enabled) {
        const maxTotalBoost = safeNumber(
          banks.boostsKeyword.config.actionsContract?.thresholds?.maxTotalBoost,
          0.22,
        );
        const wBody = safeNumber(
          banks.boostsKeyword.config.regionWeights?.body_text,
          0.03,
        );
        const q = (req.query ?? "").toLowerCase();
        const s = (c.snippet ?? "").toLowerCase();
        let hitCount = 0;
        for (const tok of this.simpleTokens(q)) {
          if (tok.length < 3) continue;
          if (s.includes(tok)) hitCount++;
        }
        const rawBoost = Math.min(maxTotalBoost, hitCount * wBody);
        c.scores.keywordBoost = clamp01(rawBoost);
      }

      // Title boost (approx): if active doc matches / explicit filename, boost strongly
      if (banks.boostsTitle?.config?.enabled) {
        const maxTotal = safeNumber(
          banks.boostsTitle.config.actionsContract?.thresholds
            ?.maxTotalTitleBoost,
          0.18,
        );
        let b = 0;
        if (
          signals.explicitDocRef &&
          signals.resolvedDocId &&
          c.docId === signals.resolvedDocId
        )
          b += 0.12;
        if (signals.activeDocId && c.docId === signals.activeDocId) b += 0.06;
        c.scores.titleBoost = clamp01(Math.min(maxTotal, b));
      }

      // Type boost (very light): apply if query hints spreadsheet/pdf, etc. (we only know via signals)
      if (banks.boostsType?.config?.enabled) {
        let b = 0;
        if (signals.rangeExplicit || signals.sheetHintPresent) b += 0.08;
        if (signals.userAskedForQuote) b += 0; // quotes don’t need type preference
        c.scores.typeBoost = clamp01(Math.min(0.12, b));
      }

      // Recency boost: requires doc metadata; apply lightly; reduce if time constraints present
      if (banks.boostsRecency?.config?.enabled) {
        // Without doc meta age days we can’t compute precisely; keep 0 unless you wire doc meta.
        c.scores.recencyBoost = 0;
      }
    }

    return candidates;
  }

  // -----------------------------
  // Ranking
  // -----------------------------

  private rankCandidates(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    rankerCfg: any,
  ): CandidateChunk[] {
    const cfg = rankerCfg?.config;
    const weights = cfg?.weights ?? {
      semantic: 0.52,
      lexical: 0.22,
      structural: 0.14,
      titleBoost: 0.06,
      typeBoost: 0.03,
      recencyBoost: 0.03,
    };
    for (const c of candidates) {
      const semantic = clamp01(c.scores.semantic ?? 0);
      const lexical = clamp01(c.scores.lexical ?? 0);
      const structural = clamp01(c.scores.structural ?? 0);

      const titleBoost = clamp01(
        (c.scores.titleBoost ?? 0) + (c.scores.keywordBoost ?? 0) * 0.5,
      );
      const typeBoost = clamp01(c.scores.typeBoost ?? 0);
      const recencyBoost = clamp01(c.scores.recencyBoost ?? 0);

      const penalties = clamp01(c.scores.penalties ?? 0);

      let final =
        weights.semantic * semantic +
        weights.lexical * lexical +
        weights.structural * structural +
        weights.titleBoost * titleBoost +
        weights.typeBoost * typeBoost +
        weights.recencyBoost * recencyBoost -
        penalties;

      final = clamp01(final);

      // If below minFinal, keep but mark; packaging may filter further.
      c.scores.final = final;
    }

    // Stable sort: final desc, docId asc, locationKey asc, candidateId asc
    candidates.sort((a, b) => {
      const fa = a.scores.final ?? 0;
      const fb = b.scores.final ?? 0;
      if (fb !== fa) return fb - fa;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.candidateId.localeCompare(b.candidateId);
    });

    return candidates;
  }

  // -----------------------------
  // Diversification
  // -----------------------------

  private applyDiversification(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    diversificationBank: any | null,
  ): CandidateChunk[] {
    if (!diversificationBank?.config?.enabled) return candidates;

    // Disable diversification when explicit lock or single doc intent (bank policy)
    const explicitDocLock = Boolean(signals.explicitDocLock);
    const singleDocIntent = Boolean(signals.singleDocIntent);
    if (explicitDocLock || singleDocIntent) {
      // Still dedupe near-duplicates lightly within doc
      return this.dedupeNearDuplicates(candidates, 3, 280);
    }

    const maxPerDocHard = safeNumber(
      diversificationBank.config.actionsContract?.thresholds?.maxPerDocHard,
      10,
    );
    const maxTotalHard = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.maxTotalChunksHard,
      36,
    );
    const maxNearDupPerDoc = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.maxNearDuplicatesPerDoc,
      3,
    );
    const windowChars = safeNumber(
      diversificationBank.config.actionsContract?.thresholds
        ?.nearDuplicateWindowChars,
      280,
    );

    // 1) Near-duplicate dedupe first
    let filtered = this.dedupeNearDuplicates(
      candidates,
      maxNearDupPerDoc,
      windowChars,
    );

    // 2) Doc spread cap
    const perDocCount = new Map<string, number>();
    const diversified: CandidateChunk[] = [];
    for (const c of filtered) {
      const n = perDocCount.get(c.docId) ?? 0;
      if (n >= maxPerDocHard) continue;
      perDocCount.set(c.docId, n + 1);
      diversified.push(c);
      if (diversified.length >= maxTotalHard) break;
    }

    return diversified;
  }

  private dedupeNearDuplicates(
    candidates: CandidateChunk[],
    maxNearDupPerDoc: number,
    windowChars: number,
  ): CandidateChunk[] {
    const perDocHashes = new Map<string, Map<string, number>>();
    const out: CandidateChunk[] = [];

    for (const c of candidates) {
      const docMap = perDocHashes.get(c.docId) ?? new Map<string, number>();
      perDocHashes.set(c.docId, docMap);

      const snippetNorm = this.normalizeForNearDup(c.snippet).slice(
        0,
        windowChars,
      );
      const h = sha256(snippetNorm).slice(0, 16);

      const count = docMap.get(h) ?? 0;
      if (count >= maxNearDupPerDoc) continue;

      docMap.set(h, count + 1);
      out.push(c);
    }

    return out;
  }

  private normalizeForNearDup(s: string): string {
    return (s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
  }

  // -----------------------------
  // Packaging
  // -----------------------------

  private packageEvidence(
    candidates: CandidateChunk[],
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    packagingBank: any,
    ctx: {
      queryOriginal: string;
      queryNormalized: string;
      expandedQueries: string[];
      scope: {
        candidateDocIds: string[];
        hardScopeActive: boolean;
        sheetName?: string | null;
        rangeA1?: string | null;
      };
      phaseCounts: RetrievalPhaseCounts;
    },
  ): EvidencePack {
    const cfg = packagingBank?.config ?? {};
    const maxEvidenceHard = safeNumber(
      cfg.actionsContract?.thresholds?.maxEvidenceItemsHard,
      36,
    );
    const maxPerDocHard = safeNumber(
      cfg.actionsContract?.thresholds?.maxEvidencePerDocHard,
      10,
    );
    const minFinalScore = safeNumber(
      cfg.actionsContract?.thresholds?.minFinalScore,
      0.58,
    );

    const evidence: EvidenceItem[] = [];
    const perDoc = new Map<string, number>();

    for (const c of candidates) {
      if (!c.provenanceOk) continue;
      const final = c.scores.final ?? 0;
      if (final < minFinalScore) continue;

      const n = perDoc.get(c.docId) ?? 0;
      if (n >= maxPerDocHard) continue;

      perDoc.set(c.docId, n + 1);

      evidence.push({
        evidenceType: c.type,
        docId: c.docId,
        title: c.title ?? null,
        filename: c.filename ?? null,
        location: c.location,
        locationKey: c.locationKey,
        snippet: c.type === "text" ? c.snippet : undefined,
        table: c.type === "table" ? (c.table ?? undefined) : undefined,
        imageRef: c.type === "image" ? null : undefined,
        score: {
          finalScore: clamp01(final),
          semanticScore: c.scores.semantic,
          lexicalScore: c.scores.lexical,
          structuralScore: c.scores.structural,
          boosts: {
            keywordBoost: c.scores.keywordBoost ?? 0,
            titleBoost: c.scores.titleBoost ?? 0,
            typeBoost: c.scores.typeBoost ?? 0,
            recencyBoost: c.scores.recencyBoost ?? 0,
          },
          penalties: {
            penalties: c.scores.penalties ?? 0,
          },
        },
        warnings: c.table?.warnings ?? undefined,
      });

      if (evidence.length >= maxEvidenceHard) break;
    }

    const uniqueDocs = new Set(evidence.map((e) => e.docId));
    const topScore = evidence.length ? evidence[0].score.finalScore : null;
    const scoreGap =
      evidence.length >= 2
        ? clamp01(
            (evidence[0].score.finalScore ?? 0) -
              (evidence[1].score.finalScore ?? 0),
          )
        : null;

    const pack: EvidencePack = {
      query: {
        original: ctx.queryOriginal,
        normalized: ctx.queryNormalized,
        expanded: ctx.expandedQueries.length ? ctx.expandedQueries : undefined,
      },
      scope: {
        activeDocId: signals.activeDocId ?? null,
        explicitDocLock: Boolean(signals.explicitDocLock),
        candidateDocIds: ctx.scope.candidateDocIds,
        hardScopeActive: ctx.scope.hardScopeActive,
        sheetName: ctx.scope.sheetName ?? null,
        rangeA1: ctx.scope.rangeA1 ?? null,
      },
      stats: {
        candidatesConsidered: ctx.phaseCounts.considered,
        candidatesAfterNegatives: ctx.phaseCounts.afterNegatives,
        candidatesAfterBoosts: ctx.phaseCounts.afterBoosts,
        candidatesAfterDiversification: ctx.phaseCounts.afterDiversification,
        evidenceItems: evidence.length,
        uniqueDocsInEvidence: uniqueDocs.size,
        topScore,
        scoreGap,
      },
      evidence,
      debug: {
        phases: [],
        reasonCodes: [],
      },
    };

    return pack;
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }

  private getRequiredBank<T = any>(bankId: string): T {
    return this.bankLoader.getBank<T>(bankId);
  }

  private simpleTokens(q: string): string[] {
    return (q ?? "")
      .toLowerCase()
      .replace(/["“”]/g, " ")
      .split(/[\s,;:.!?()]+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  private emptyPack(
    req: RetrievalRequest,
    dbg: { reasonCodes: string[]; note?: string },
  ): EvidencePack {
    return {
      query: { original: req.query, normalized: (req.query ?? "").trim() },
      scope: {
        activeDocId: req.signals.activeDocId ?? null,
        explicitDocLock: Boolean(req.signals.explicitDocLock),
        candidateDocIds: [],
        hardScopeActive: Boolean(req.signals.hardScopeActive),
        sheetName: req.signals.resolvedSheetName ?? null,
        rangeA1: req.signals.resolvedRangeA1 ?? null,
      },
      stats: {
        candidatesConsidered: 0,
        candidatesAfterNegatives: 0,
        candidatesAfterBoosts: 0,
        candidatesAfterDiversification: 0,
        evidenceItems: 0,
        uniqueDocsInEvidence: 0,
        topScore: null,
        scoreGap: null,
      },
      evidence: [],
      debug: isProduction(req.env)
        ? undefined
        : { phases: [], reasonCodes: dbg.reasonCodes },
    };
  }
}
