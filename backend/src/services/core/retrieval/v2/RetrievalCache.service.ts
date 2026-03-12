import { logger } from "../../../../utils/logger";

/**
 * RetrievalCache — v2 extraction
 *
 * Standalone cache-key builder and evidence-pack cloning extracted from
 * RetrievalEngineService.
 *
 * BUG FIX #6: The legacy `buildRetrievalCacheKey` omitted several
 * signal fields that can change retrieval behaviour:
 *   - `corpusSearchAllowed` — enables cross-corpus discovery mode
 *   - `hasQuotedText` — triggers literal-match rules
 *   - `hasFilename` — enables filename-affinity boosts
 *   - `historyFallbackCount` — recent fallback history affects expansion
 *
 * Without these factors two semantically different requests could collide
 * on the same cache key, returning stale/wrong evidence.
 */

import crypto from "crypto";

import type {
  RetrievalRequest,
  RetrievalOverrides,
  EvidencePack,
  EnvName,
  DocumentClassificationResult,
} from "../retrieval.types";
import type { DocumentIntelligenceDomain } from "../../banks/documentIntelligenceBanks.service";
import type { RetrievalPlan } from "../retrievalPlanParser.service";

// ── Cache key builder ────────────────────────────────────────────────

/**
 * Build a deterministic cache key for a retrieval request.
 *
 * The key is a SHA-256 hash of a canonical JSON payload that captures
 * every factor influencing retrieval output: query text, scope doc IDs,
 * domain classification, signal shape, retrieval plan, overrides, and
 * environment.
 *
 * BUG FIX #6: Added `corpusSearchAllowed`, `hasQuotedText`,
 * `hasFilename`, and `historyFallbackCount` to the signal shape so
 * that changes in these fields bust the cache correctly.
 */
export function buildRetrievalCacheKey(params: {
  queryNormalized: string;
  scopeDocIds: string[];
  domain: DocumentIntelligenceDomain | null;
  resolvedDocTypes: string[];
  resolvedDocDomains: string[];
  signals: RetrievalRequest["signals"];
  history?: RetrievalRequest["history"];
  retrievalPlan: Partial<RetrievalPlan> | null;
  overrides: Partial<RetrievalOverrides> | null;
  env: EnvName;
  modelVersion: string;
}): string {
  const payload = {
    query: String(params.queryNormalized || "").trim(),
    scopeDocIds: Array.from(
      new Set(
        (params.scopeDocIds || [])
          .map((docId) => String(docId || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    domain: params.domain || null,
    resolvedDocTypes: Array.from(
      new Set(
        (params.resolvedDocTypes || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    resolvedDocDomains: Array.from(
      new Set(
        (params.resolvedDocDomains || [])
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    signalShape: {
      intentFamily: params.signals.intentFamily || null,
      queryFamily: params.signals.queryFamily || null,
      operator: params.signals.operator || null,
      answerMode: params.signals.answerMode || null,
      explicitDocLock: Boolean(params.signals.explicitDocLock),
      explicitDocRef: Boolean(params.signals.explicitDocRef),
      singleDocIntent: Boolean(params.signals.singleDocIntent),
      allowExpansion: Boolean(params.signals.allowExpansion),
      tableExpected: Boolean(params.signals.tableExpected),
      userAskedForTable: Boolean(params.signals.userAskedForTable),
      userAskedForQuote: Boolean(params.signals.userAskedForQuote),
      languageHint: params.signals.languageHint || null,
      // BUG FIX #6: include fields that affect retrieval behaviour
      corpusSearchAllowed: Boolean(params.signals.corpusSearchAllowed),
      hasQuotedText: Boolean(params.signals.hasQuotedText),
      hasFilename: Boolean(params.signals.hasFilename),
      requiredBankIds: Array.from(
        new Set(
          (params.signals.requiredBankIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
      selectedBankVersionMap: params.signals.selectedBankVersionMap || null,
    },
    // BUG FIX #6: include fallback history length so expansion changes
    // triggered by recent fallbacks are not served from stale cache
    historyFallbackCount: params.history?.recentFallbacks?.length ?? 0,
    retrievalPlan: params.retrievalPlan || null,
    overrides: params.overrides || null,
    env: params.env,
    modelVersion: String(params.modelVersion || "unknown"),
    retrievalCacheVersion: "v1",
  };

  return `retrieval:${crypto
    .createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex")}`;
}

// ── Evidence pack cloning ────────────────────────────────────────────

/**
 * Deep-clone an EvidencePack via JSON round-trip.
 * Suitable for cache storage where mutations to the returned pack
 * must not affect the cached copy.
 */
export function cloneEvidencePack(pack: EvidencePack): EvidencePack {
  return JSON.parse(JSON.stringify(pack)) as EvidencePack;
}
