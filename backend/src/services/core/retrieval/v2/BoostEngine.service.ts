/**
 * BoostEngine — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for applying keyword, title, type, and recency
 * boosts to retrieval candidates. Also includes helpers for token
 * overlap computation, type-tag resolution, and doc age calculation.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateChunk,
  DocMeta,
  RetrievalRequest,
  BankLoader,
} from "../retrieval.types";
import { clamp01, safeNumber } from "../retrievalEngine.utils";
import { simpleTokens } from "./QueryPreparation.service";

// ── Boost Application ───────────────────────────────────────────────

/**
 * Apply keyword, title, type, and recency boosts to all candidates.
 * Boosts are additive components with per-category caps.
 */
export function applyBoosts(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  banks: {
    boostsKeyword: Record<string, any> | null;
    boostsTitle: Record<string, any> | null;
    boostsType: Record<string, any> | null;
    boostsRecency: Record<string, any> | null;
  },
  docMetaById?: Map<string, DocMeta>,
): CandidateChunk[] {
  // Apply boosts as additive components with caps (final ranker may re-cap).
  const query = String(req.query || "").toLowerCase();
  const queryTokens = simpleTokens(query).filter(
    (token) => token.length >= 2,
  );

  const keywordCfg = banks.boostsKeyword?.config || {};
  const keywordCap = safeNumber(
    keywordCfg.actionsContract?.combination?.capMaxBoost ??
      keywordCfg.actionsContract?.thresholds?.maxTotalBoost,
    0.25,
  );
  const keywordBodyWeight = safeNumber(
    keywordCfg.regionWeights?.body ?? keywordCfg.regionWeights?.body_text,
    0.02,
  );
  const keywordTitleWeight = safeNumber(
    keywordCfg.regionWeights?.doc_title,
    0.08,
  );
  const keywordHeadingWeight = safeNumber(
    keywordCfg.regionWeights?.section_heading,
    0.06,
  );
  const genericTerms = new Set(
    [
      ...(keywordCfg.genericTermGuard?.terms?.en || []),
      ...(keywordCfg.genericTermGuard?.terms?.pt || []),
      ...(keywordCfg.genericTermGuard?.terms?.es || []),
    ]
      .map((token: unknown) =>
        String(token || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  const genericPenalty = safeNumber(
    keywordCfg.genericTermGuard?.penalty ??
      keywordCfg.actionsContract?.thresholds?.genericTermPenaltyThreshold,
    0.08,
  );

  const titleCfg = banks.boostsTitle?.config || {};
  const titleWeights = titleCfg.boostWeights || {};
  const titleCap = safeNumber(
    titleCfg.actionsContract?.combination?.capMaxBoost ??
      titleCfg.actionsContract?.thresholds?.maxTotalTitleBoost,
    0.15,
  );
  const titleMinOverlapRatio = safeNumber(
    titleCfg.actionsContract?.thresholds?.minOverlapRatioForPartial,
    0.55,
  );
  const titleMinTokens = Math.max(
    1,
    Math.floor(
      safeNumber(
        titleCfg.actionsContract?.thresholds?.minTokensForPartial,
        2,
      ),
    ),
  );

  const typeCfg = banks.boostsType?.config || {};
  const typeCap = safeNumber(
    typeCfg.actionsContract?.thresholds?.maxTotalTypeBoost,
    0.12,
  );
  const expectedTypeTags = resolveExpectedTypeTags(signals, query);

  const recencyCfg = banks.boostsRecency?.config || {};
  const recencyThresholds = recencyCfg.actionsContract?.thresholds || {};
  const recencyWeights = recencyCfg.recencyWeights || {};
  const recencyCap = safeNumber(recencyThresholds.maxTotalRecencyBoost, 0.08);
  const disableRecencyForDocLock =
    recencyCfg.neverOverrideExplicitDocLock !== false &&
    Boolean(signals.explicitDocLock || signals.singleDocIntent);
  const disableRecencyForExplicitTimeWindow =
    Boolean(signals.explicitYearOrQuarterComparison) &&
    recencyCfg.timeFilterGuards
      ?.disableWhenExplicitYearOrQuarterComparison !== false;
  const recencyScale =
    Boolean(signals.timeConstraintsPresent) &&
    recencyCfg.timeFilterGuards?.enabled !== false
      ? clamp01(
          safeNumber(
            recencyCfg.timeFilterGuards
              ?.reduceFactorWhenTimeConstraintsPresent,
            0.5,
          ),
        )
      : 1;

  for (const c of candidates) {
    // Keyword boost (approximation): if query tokens appear in snippet, treat as body_text match.
    if (banks.boostsKeyword?.config?.enabled) {
      const snippet = String(c.snippet || "").toLowerCase();
      const title = String(c.title || "").toLowerCase();
      const section = String(c.location?.sectionKey || "").toLowerCase();
      let genericHits = 0;
      let specificHits = 0;
      let boost = 0;
      for (const token of queryTokens) {
        if (
          !snippet.includes(token) &&
          !title.includes(token) &&
          !section.includes(token)
        ) {
          continue;
        }
        const isGeneric = genericTerms.has(token);
        if (isGeneric) genericHits += 1;
        else specificHits += 1;
        if (title.includes(token)) boost += keywordTitleWeight;
        else if (section.includes(token)) boost += keywordHeadingWeight;
        else boost += keywordBodyWeight;
      }
      if (genericHits > 0 && specificHits === 0) {
        c.scores.penalties = clamp01(
          (c.scores.penalties ?? 0) + genericPenalty,
        );
        boost = Math.max(0, boost - genericPenalty);
      }
      c.scores.keywordBoost = clamp01(Math.min(keywordCap, boost));
    }

    // Title boost (approx): if active doc matches / explicit filename, boost strongly
    if (banks.boostsTitle?.config?.enabled) {
      let b = 0;
      if (
        signals.explicitDocRef &&
        signals.resolvedDocId &&
        c.docId === signals.resolvedDocId
      )
        b += safeNumber(titleWeights.exact_filename, 0.12);
      if (signals.activeDocId && c.docId === signals.activeDocId) {
        b += safeNumber(titleWeights.high_overlap, 0.1) * 0.6;
      }

      const titleTokens = simpleTokens(
        `${String(c.title || "")} ${String(c.filename || "")}`,
      );
      const overlap = computeTokenOverlap(queryTokens, titleTokens);
      const genericOnlyRef = isGenericDocReferenceQuery(query, titleCfg);
      if (!genericOnlyRef) {
        if (
          overlap.overlapCount >= titleMinTokens &&
          overlap.overlapRatio >= 0.7
        ) {
          b += safeNumber(titleWeights.high_overlap, 0.1);
        } else if (
          overlap.overlapCount >= titleMinTokens &&
          overlap.overlapRatio >= titleMinOverlapRatio
        ) {
          b += safeNumber(titleWeights.partial, 0.07);
        }
      }
      c.scores.titleBoost = clamp01(Math.min(titleCap, b));
    }

    // Type boost (very light): apply if query hints spreadsheet/pdf, etc.
    if (banks.boostsType?.config?.enabled) {
      const candidateType = resolveCandidateTypeTag(c);
      let b = 0;
      if (candidateType && expectedTypeTags.has(candidateType)) {
        b += safeNumber(typeCfg.typeWeights?.[candidateType], 0.06);
      }
      c.scores.typeBoost = clamp01(Math.min(typeCap, b));
    }

    // Recency boost: requires doc metadata; apply lightly; reduce if time constraints present
    if (
      banks.boostsRecency?.config?.enabled &&
      !disableRecencyForDocLock &&
      !disableRecencyForExplicitTimeWindow
    ) {
      const docMeta = docMetaById?.get(c.docId);
      const ageDays = resolveDocAgeDays(docMeta);
      if (ageDays == null) {
        c.scores.recencyBoost = 0;
      } else {
        let recencyBoost = 0;
        if (ageDays <= safeNumber(recencyThresholds.recentDaysStrong, 7)) {
          recencyBoost = safeNumber(recencyWeights.strong, 0.05);
        } else if (
          ageDays <= safeNumber(recencyThresholds.recentDaysMedium, 30)
        ) {
          recencyBoost = safeNumber(recencyWeights.medium, 0.03);
        } else if (
          ageDays <= safeNumber(recencyThresholds.recentDaysLight, 90)
        ) {
          recencyBoost = safeNumber(recencyWeights.light, 0.015);
        }
        recencyBoost *= recencyScale;
        c.scores.recencyBoost = clamp01(Math.min(recencyCap, recencyBoost));
      }
    } else {
      c.scores.recencyBoost = 0;
    }
  }

  return candidates;
}

// ── Token Overlap ───────────────────────────────────────────────────

export function computeTokenOverlap(
  queryTokens: string[],
  targetTokens: string[],
): { overlapCount: number; overlapRatio: number } {
  if (!queryTokens.length || !targetTokens.length) {
    return { overlapCount: 0, overlapRatio: 0 };
  }
  const targetSet = new Set(targetTokens.map((token) => token.toLowerCase()));
  const overlapCount = queryTokens.filter((token) =>
    targetSet.has(token),
  ).length;
  const overlapRatio = overlapCount / Math.max(1, queryTokens.length);
  return { overlapCount, overlapRatio };
}

// ── Generic Doc Reference Guard ─────────────────────────────────────

export function isGenericDocReferenceQuery(query: string, titleCfg: any): boolean {
  const clean = String(query || "")
    .trim()
    .toLowerCase();
  if (!clean) return false;
  const patterns = [
    ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.en)
      ? titleCfg.genericDocRefGuard.patterns.en
      : []),
    ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.pt)
      ? titleCfg.genericDocRefGuard.patterns.pt
      : []),
    ...(Array.isArray(titleCfg?.genericDocRefGuard?.patterns?.es)
      ? titleCfg.genericDocRefGuard.patterns.es
      : []),
  ]
    .map((pattern: unknown) => String(pattern || "").trim())
    .filter(Boolean);
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(clean);
    } catch {
      return false;
    }
  });
}

// ── Candidate Type Tag ──────────────────────────────────────────────

export function resolveCandidateTypeTag(candidate: CandidateChunk): string | null {
  const filename = String(candidate.filename || "").toLowerCase();
  const docType = String(candidate.docType || "").toLowerCase();
  const raw = `${filename} ${docType}`;
  if (/\b(pdf|application\/pdf)\b/.test(raw)) return "pdf";
  if (/\b(xlsx|xls|csv|spreadsheet|sheet)\b/.test(raw)) return "spreadsheet";
  if (/\b(ppt|pptx|slide|presentation)\b/.test(raw)) return "slides";
  if (/\b(png|jpg|jpeg|webp|gif|image)\b/.test(raw)) return "image";
  if (/\b(txt|text|doc|docx)\b/.test(raw)) return "text";
  return null;
}

// ── Doc Age ─────────────────────────────────────────────────────────

export function resolveDocAgeDays(docMeta: DocMeta | undefined): number | null {
  if (!docMeta) return null;
  const rawTimestamp = docMeta.updatedAt || docMeta.createdAt || null;
  if (!rawTimestamp) return null;
  const ts = Date.parse(String(rawTimestamp));
  if (!Number.isFinite(ts)) return null;
  const ageMs = Date.now() - ts;
  if (!Number.isFinite(ageMs)) return null;
  return Math.max(0, ageMs / (1000 * 60 * 60 * 24));
}

// ── Expected Type Tags ──────────────────────────────────────────────

export function resolveExpectedTypeTags(
  signals: RetrievalRequest["signals"],
  queryLower: string,
): Set<string> {
  const expected = new Set<string>();
  if (signals.rangeExplicit || signals.sheetHintPresent) {
    expected.add("spreadsheet");
  }
  if (signals.userAskedForQuote) {
    expected.add("pdf");
    expected.add("text");
  }
  if (signals.userAskedForTable || signals.tableExpected) {
    expected.add("spreadsheet");
  }
  if (
    /\b(sheet|tab|xlsx|csv|range|aba|planilha|hoja|rango)\b/.test(queryLower)
  ) {
    expected.add("spreadsheet");
  }
  if (/\b(page|pdf|section|página|pagina|seção|seccion)\b/.test(queryLower)) {
    expected.add("pdf");
  }
  if (
    /\b(slide|deck|pptx|diapositiva|apresentação|presentacion)\b/.test(
      queryLower,
    )
  ) {
    expected.add("slides");
  }
  if (
    /\b(image|photo|screenshot|ocr|png|jpg|jpeg|imagem|foto|captura|imagen)\b/.test(
      queryLower,
    )
  ) {
    expected.add("image");
  }
  return expected;
}

// ── Extraction Hints Lookup ─────────────────────────────────────────

export function lookupExtractionHints(
  domain: string | null,
  docType: string | null,
  documentIntelligenceBanks: Record<string, any>,
): Array<Record<string, any>> {
  if (!domain || !docType) return [];
  try {
    if (typeof documentIntelligenceBanks.getDocTypeExtractionHints !== "function") {
      return [];
    }
    const hints = documentIntelligenceBanks.getDocTypeExtractionHints(
      domain,
      docType,
    );
    if (!hints) return [];
    const fields = Array.isArray(hints.fields)
      ? hints.fields
      : Array.isArray(hints.hints)
        ? hints.hints
        : [];
    return fields.slice(0, 5).map((f: unknown) =>
      f && typeof f === "object" ? (f as Record<string, any>) : { hint: String(f) },
    );
  } catch {
    return [];
  }
}
