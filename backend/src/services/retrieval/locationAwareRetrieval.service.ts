// locationAwareRetrieval.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeWhitespace } from "../../utils";

/**
 * Koda Location-Aware Retrieval (ChatGPT-parity, doc-grounded)
 * -----------------------------------------------------------
 * Purpose:
 *  - Serve "locate_content" / "where is X mentioned?" style queries with high precision.
 *  - Prefer returning *locations* (page/sheet/slide/section) with minimal, relevant snippets.
 *  - Respect scope locks:
 *      - explicit filename/doc lock => NEVER search other docs (except discovery intent)
 *      - discovery intent can search corpus, but this service is typically for inside-doc location
 *  - Use structural signals:
 *      - section heading patterns
 *      - "page X", "sheet/tab", "slide X", "section Y" hints
 *      - table header anchors when query is table-ish
 *
 * Output:
 *  - A list of "LocationHits" that downstream composer can render as breadcrumbs or bullets.
 *  - NO user-facing copy and NO "Sources:" header.
 *
 * Banks used (as available):
 *  - semantics/section_heading_patterns.any.json (heading detection & normalization)
 *  - overlays/scope_hints.any.json (page/sheet/slide/range/section hints; usually upstream)
 *  - retrieval/retrieval_ranker_config.any.json (weights)
 *  - retrieval/keyword_boost_rules.any.json (region boosting)
 *  - retrieval/doc_title_boost_rules.any.json (doc affinity/explicit filename)
 *  - retrieval/retrieval_negatives.any.json (scope correctness & min relevance)
 *  - retrieval/evidence_packaging.any.json (provenance requirements)
 *  - formatting/breadcrumb rules are handled downstream (formatting_overlays)
 *
 * Indexes required:
 *  - LexicalIndex: for precise phrase/term matching + "where mentioned"
 *  - StructuralIndex: for headings/table headers/TOC-like anchors
 *  - SemanticIndex (optional): for recall when lexical misses
 */

import crypto from "crypto";

type EnvName = "production" | "staging" | "dev" | "local";

export interface BankLoader {
  getBank<T = any>(bankId: string): T;
}

export interface ChunkLocation {
  page?: number | null;
  sheet?: string | null;
  slide?: number | null;
  sectionKey?: string | null;
  bbox?: { x: number; y: number; w: number; h: number } | null;
}

export interface LocationHit {
  docId: string;
  title?: string | null;
  filename?: string | null;

  // Normalized location
  location: ChunkLocation;
  locationKey: string;

  // Small evidence
  snippet: string;

  // Ranking
  score: {
    finalScore: number;
    lexicalScore?: number;
    structuralScore?: number;
    semanticScore?: number;
    boosts?: Record<string, number>;
    penalties?: Record<string, number>;
  };

  // Useful for downstream UI selection
  evidenceType: "text" | "table" | "image";
}

export interface LocationAwareRequest {
  env: EnvName;
  query: string;

  // Scope constraints
  signals: {
    intentFamily?: string | null; // typically "documents"
    operator?: string | null; // "locate_content"
    explicitDocLock?: boolean;
    activeDocId?: string | null;
    explicitDocRef?: boolean;
    resolvedDocId?: string | null;

    // Hints (prefer from scope_hints/followup)
    pageRefPresent?: boolean;
    pageNumber?: number | null;

    slideRefPresent?: boolean;
    slideNumber?: number | null;

    sheetHintPresent?: boolean;
    sheetName?: string | null;

    sectionRefPresent?: boolean;
    sectionName?: string | null;

    rangeExplicit?: boolean;
    rangeA1?: string | null;

    // Derived query properties
    hasQuotedText?: boolean;
    hasFilename?: boolean;

    // Controls
    allowExpansion?: boolean; // usually false for locate_content
    preferStructuralAnchors?: boolean;

    // Additional signals that may be needed
    userAskedForQuote?: boolean;
    corpusSearchAllowed?: boolean;
  };

  // Candidate docs (from ScopeGate / retrieval engine). If provided, must be enforced.
  scopeDocIds?: string[];

  // Optional: language hint (for heading normalization)
  langHint?: "any" | "en" | "pt" | "es";

  // Optional: override retrieval caps
  overrides?: Partial<{
    maxHits: number;
    maxHitsPerDoc: number;
    kLexical: number;
    kStructural: number;
    kSemantic: number;
    minFinalScore: number;
  }>;
}

export interface LocationAwareResponse {
  hits: LocationHit[];
  stats: {
    queryOriginal: string;
    queryNormalized: string;
    candidateDocs: number;
    returned: number;
    uniqueDocs: number;
    usedPhases: string[];
    topScore: number | null;
    scoreGap: number | null;
  };
  debug?: {
    reasonCodes: string[];
    notes: string[];
  };
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
      title?: string;
      filename?: string;
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
      title?: string;
      filename?: string;
    }>
  >;
}

export interface SemanticIndex {
  search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string;
      filename?: string;
    }>
  >;
}

// -------------------- helpers --------------------

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeNumber(x: any, fallback: number): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

// normalizeWhitespace imported from ../../utils

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

function uniqueBy<T>(items: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function sortStable(hits: LocationHit[]): LocationHit[] {
  return hits.sort((a, b) => {
    if (b.score.finalScore !== a.score.finalScore)
      return b.score.finalScore - a.score.finalScore;
    if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
    const ak = a.locationKey ?? "";
    const bk = b.locationKey ?? "";
    if (ak !== bk) return ak.localeCompare(bk);
    return (a.filename ?? "").localeCompare(b.filename ?? "");
  });
}

// -------------------- service --------------------

export class LocationAwareRetrievalService {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly lexicalIndex: LexicalIndex,
    private readonly structuralIndex: StructuralIndex,
    private readonly semanticIndex?: SemanticIndex,
  ) {}

  async locate(req: LocationAwareRequest): Promise<LocationAwareResponse> {
    // Banks (soft)
    const rankerCfg = this.safeGetBank<any>("retrieval_ranker_config");
    const negatives = this.safeGetBank<any>("retrieval_negatives");
    const packaging = this.safeGetBank<any>("evidence_packaging");
    const headingPatterns = this.safeGetBank<any>("section_heading_patterns");
    const keywordBoostRules = this.safeGetBank<any>("keyword_boost_rules");

    // Defaults
    const maxHits = req.overrides?.maxHits ?? 12;
    const maxHitsPerDoc = req.overrides?.maxHitsPerDoc ?? 6;

    const kLexical = req.overrides?.kLexical ?? 80;
    const kStructural = req.overrides?.kStructural ?? 60;
    const kSemantic = req.overrides?.kSemantic ?? 60;

    const minFinalScore =
      req.overrides?.minFinalScore ??
      safeNumber(
        packaging?.config?.actionsContract?.thresholds?.minFinalScore,
        0.58,
      );

    const queryOriginal = req.query ?? "";
    const queryNormalized = this.normalizeLocateQuery(queryOriginal);

    // Scope enforcement: explicitDocRef wins, else explicitDocLock, else provided scopeDocIds, else corpus.
    const scopeDocIds = await this.resolveScopeDocIds(req);

    // Run phases (deterministic)
    const usedPhases: string[] = [];
    const rawHits: Array<{
      phase: "lexical" | "structural" | "semantic";
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string;
      filename?: string;
    }> = [];

    // 1) Lexical (strong for "where mentioned")
    usedPhases.push("lexical");
    const lex = await this.lexicalIndex.search({
      query: queryNormalized,
      docIds: scopeDocIds,
      k: kLexical,
    });
    rawHits.push(...lex.map((h) => ({ phase: "lexical" as const, ...h })));

    // 2) Structural anchors (headings/table headers), especially if section hints exist
    const anchors = this.computeAnchors(req, headingPatterns);
    usedPhases.push("structural");
    const str = await this.structuralIndex.search({
      query: queryNormalized,
      docIds: scopeDocIds,
      k: kStructural,
      anchors,
    });
    rawHits.push(...str.map((h) => ({ phase: "structural" as const, ...h })));

    // 3) Semantic recall (optional), only if semanticIndex provided and lexical is weak
    if (
      this.semanticIndex &&
      (lex.length < 6 || this.needsSemanticRecall(req))
    ) {
      usedPhases.push("semantic");
      const sem = await this.semanticIndex.search({
        query: queryNormalized,
        docIds: scopeDocIds,
        k: kSemantic,
      });
      rawHits.push(...sem.map((h) => ({ phase: "semantic" as const, ...h })));
    }

    // Merge into LocationHits with deterministic scoring
    let hits = rawHits.map((h, idx) =>
      this.toLocationHit(
        h,
        idx,
        rankerCfg,
        req,
        queryNormalized,
        keywordBoostRules,
      ),
    );

    // Apply negatives: lock correctness + min relevance
    hits = this.applyNegatives(hits, req, negatives);

    // Apply hint filters (page/sheet/slide/section) as *soft narrowing* (do not hard exclude unless explicitly asked)
    hits = this.applyLocationHints(hits, req);

    // Provenance enforcement (strict)
    hits = hits.filter((h) => this.provenanceOk(h));

    // Filter low scores, then dedupe
    hits = hits.filter((h) => h.score.finalScore >= minFinalScore);
    hits = uniqueBy(hits, (h) => `${h.docId}|${h.locationKey}`);

    // Per-doc caps + total caps
    hits = this.capPerDoc(hits, maxHitsPerDoc);
    hits = sortStable(hits).slice(0, maxHits);

    const uniqueDocs = new Set(hits.map((h) => h.docId)).size;
    const topScore = hits.length ? hits[0].score.finalScore : null;
    const scoreGap =
      hits.length >= 2
        ? clamp01(hits[0].score.finalScore - hits[1].score.finalScore)
        : null;

    return {
      hits,
      stats: {
        queryOriginal,
        queryNormalized,
        candidateDocs: scopeDocIds.length,
        returned: hits.length,
        uniqueDocs,
        usedPhases,
        topScore,
        scoreGap,
      },
      debug:
        req.env === "production"
          ? undefined
          : {
              reasonCodes: [],
              notes: [
                `scopeDocs=${scopeDocIds.length}`,
                `phases=${usedPhases.join(",")}`,
                `anchors=${anchors.join(",")}`,
              ],
            },
    };
  }

  // ---------------- scope resolution ----------------

  private async resolveScopeDocIds(
    req: LocationAwareRequest,
  ): Promise<string[]> {
    const explicitResolvedDoc = req.signals.resolvedDocId ?? null;
    const activeDocId = req.signals.activeDocId ?? null;

    const isDiscovery = req.signals.intentFamily === "doc_discovery";
    const corpusAllowed = Boolean(
      req.signals.corpusSearchAllowed ?? isDiscovery,
    );

    if (req.signals.explicitDocRef && explicitResolvedDoc)
      return [explicitResolvedDoc];

    if (req.signals.explicitDocLock && activeDocId && !corpusAllowed)
      return [activeDocId];

    if (Array.isArray(req.scopeDocIds) && req.scopeDocIds.length)
      return req.scopeDocIds;

    // If nothing else, allow corpus (callers should ideally pass scopeDocIds)
    return [];
  }

  // ---------------- query normalization ----------------

  private normalizeLocateQuery(q: string): string {
    // For locate_content we prefer precise terms:
    // - keep quotes
    // - keep important punctuation minimal
    // - collapse whitespace + lowercase
    return normalizeWhitespace(q).toLowerCase();
  }

  private needsSemanticRecall(req: LocationAwareRequest): boolean {
    // Use semantic recall when:
    // - query is phrased conceptually ("where do they discuss profitability?")
    // - not a strict literal match request (quote/filename)
    if (req.signals.userAskedForQuote) return false;
    if (req.signals.hasQuotedText || req.signals.hasFilename) return false;
    return true;
  }

  // ---------------- anchors and hints ----------------

  private computeAnchors(
    req: LocationAwareRequest,
    headingPatterns: any | null,
  ): string[] {
    const anchors: string[] = ["headings", "table_headers", "toc"];

    // If user referenced a section explicitly, emphasize section headings
    if (req.signals.sectionRefPresent || req.signals.sectionName)
      anchors.push("section_headings");

    // Spreadsheet hint -> include sheet/tab anchors
    if (req.signals.sheetHintPresent || req.signals.rangeExplicit)
      anchors.push("sheet_names");

    // If heading patterns bank provides categories, include them as tags (engine-side)
    const pats = headingPatterns?.patterns ?? headingPatterns?.rules ?? null;
    if (Array.isArray(pats) && pats.length) anchors.push("heading_patterns");

    return Array.from(new Set(anchors));
  }

  private applyLocationHints(
    hits: LocationHit[],
    req: LocationAwareRequest,
  ): LocationHit[] {
    // Soft narrowing: increase scores for matches in hinted page/sheet/slide/section
    const page = req.signals.pageNumber ?? null;
    const slide = req.signals.slideNumber ?? null;
    const sheet = (req.signals.sheetName ?? "").trim() || null;
    const section =
      (req.signals.sectionName ?? "").trim().toLowerCase() || null;

    return hits.map((h) => {
      let bonus = 0;

      if (page != null && h.location.page === page) bonus += 0.06;
      if (slide != null && h.location.slide === slide) bonus += 0.06;
      if (
        sheet &&
        h.location.sheet &&
        h.location.sheet.toLowerCase() === sheet.toLowerCase()
      )
        bonus += 0.06;

      if (
        section &&
        h.location.sectionKey &&
        h.location.sectionKey.toLowerCase().includes(section)
      )
        bonus += 0.05;

      if (bonus > 0) {
        h.score.finalScore = clamp01(h.score.finalScore + bonus);
        h.score.boosts = {
          ...(h.score.boosts ?? {}),
          location_hint_bonus: bonus,
        };
      }

      return h;
    });
  }

  // ---------------- ranking & scoring ----------------

  private toLocationHit(
    h: {
      phase: "lexical" | "structural" | "semantic";
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string;
      filename?: string;
    },
    idx: number,
    rankerCfg: any | null,
    req: LocationAwareRequest,
    queryNormalized: string,
    keywordBoostRules: any | null,
  ): LocationHit {
    const docId = String(h.docId);
    const loc = h.location ?? {};
    const chunkId = String(h.chunkId ?? `${h.phase}:${idx}`);
    const locationKey = h.locationKey ?? stableLocationKey(docId, loc, chunkId);

    const semanticW = safeNumber(rankerCfg?.config?.weights?.semantic, 0.52);
    const lexicalW = safeNumber(rankerCfg?.config?.weights?.lexical, 0.22);
    const structuralW = safeNumber(
      rankerCfg?.config?.weights?.structural,
      0.14,
    );

    const rawScore = clamp01(safeNumber(h.score, 0));

    let lexicalScore = 0;
    let structuralScore = 0;
    let semanticScore = 0;

    if (h.phase === "lexical") lexicalScore = rawScore;
    if (h.phase === "structural") structuralScore = rawScore;
    if (h.phase === "semantic") semanticScore = rawScore;

    // Region-aware keyword boost (very light; locate_content should remain precise)
    const keywordBoost = this.computeKeywordBoostForSnippet(
      queryNormalized,
      h.snippet,
      keywordBoostRules,
    );

    // Combine final score
    const base =
      semanticW * semanticScore +
      lexicalW * lexicalScore +
      structuralW * structuralScore;

    const finalScore = clamp01(base + keywordBoost);

    return {
      docId,
      title: h.title ?? null,
      filename: h.filename ?? null,
      location: loc,
      locationKey,
      snippet: (h.snippet ?? "").trim(),
      score: {
        finalScore,
        lexicalScore,
        structuralScore,
        semanticScore,
        boosts: keywordBoost > 0 ? { keywordBoost } : undefined,
        penalties: undefined,
      },
      evidenceType: "text",
    };
  }

  private computeKeywordBoostForSnippet(
    query: string,
    snippet: string,
    keywordBoostRules: any | null,
  ): number {
    if (!keywordBoostRules?.config?.enabled) return 0;

    // Use the bank's cap if present, but keep locate boosts smaller than normal retrieval
    const maxTotalBoost = safeNumber(
      keywordBoostRules?.config?.actionsContract?.thresholds?.maxTotalBoost,
      0.22,
    );
    const capForLocate = Math.min(0.06, maxTotalBoost);

    const qTokens = new Set(query.split(/\s+/).filter((t) => t.length >= 3));
    const s = (snippet ?? "").toLowerCase();

    let hits = 0;
    for (const t of qTokens) {
      if (s.includes(t)) hits++;
    }

    // Small linear boost
    return clamp01(Math.min(capForLocate, hits * 0.01));
  }

  // ---------------- negatives ----------------

  private applyNegatives(
    hits: LocationHit[],
    req: LocationAwareRequest,
    negatives: any | null,
  ): LocationHit[] {
    if (!negatives?.config?.enabled) return hits;

    const minChunkRel = safeNumber(
      negatives?.config?.actionsContract?.thresholds?.minChunkRelevance,
      0.55,
    );

    const locked = Boolean(req.signals.explicitDocLock);
    const activeDocId = req.signals.activeDocId ?? null;
    const isDiscovery = req.signals.intentFamily === "doc_discovery";

    return hits.filter((h) => {
      // Hard lock violation outside discovery
      if (locked && activeDocId && h.docId !== activeDocId && !isDiscovery)
        return false;

      // Low relevance
      if (h.score.finalScore < minChunkRel) return false;

      return true;
    });
  }

  // ---------------- provenance ----------------

  private provenanceOk(hit: LocationHit): boolean {
    if (!hit.docId || !hit.locationKey) return false;
    if (!hit.snippet || !hit.snippet.trim()) return false;
    return true;
  }

  // ---------------- caps ----------------

  private capPerDoc(hits: LocationHit[], maxPerDoc: number): LocationHit[] {
    const perDoc = new Map<string, number>();
    const out: LocationHit[] = [];
    for (const h of sortStable(hits)) {
      const n = perDoc.get(h.docId) ?? 0;
      if (n >= maxPerDoc) continue;
      perDoc.set(h.docId, n + 1);
      out.push(h);
    }
    return out;
  }

  // ---------------- bank loader safety ----------------

  private safeGetBank<T = any>(bankId: string): T | null {
    try {
      return this.bankLoader.getBank<T>(bankId);
    } catch {
      return null;
    }
  }
}
