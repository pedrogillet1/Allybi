import { logger } from "../../../../utils/logger";

/**
 * ScopeResolver — v2 extraction from RetrievalEngineService
 *
 * Standalone functions for resolving retrieval scope (candidate doc sets),
 * expansion policy, query expansion, and scope invariant enforcement.
 */

import {
  resolveDocScopeLockFromSignals,
} from "../docScopeLock";
import type {
  RetrievalRequest,
  DocMeta,
  RetrievalScopeMetrics,
  ScopeInvariantStage,
  RetrievalScope,
  BankLoader,
  DocStore,
} from "../retrieval.types";
import {
  RetrievalScopeLockConfigurationError,
  RetrievalScopeViolationError,
} from "../retrieval.types";
import { safeNumber } from "../retrievalEngine.utils";
import { simpleTokens, escapeRegex } from "./QueryPreparation.service";
import { BANK_IDS } from "./retrieval.config";

// ── Scope Resolution ────────────────────────────────────────────────

/**
 * Resolve the set of candidate document IDs for retrieval.
 *
 * The scope is determined by the doc scope lock signals, explicit doc
 * references, legacy single-doc intents, and finally falls back to all
 * available documents (corpus-wide).
 */
export async function resolveScope(
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  semanticCfg: Record<string, any>,
  docStore: DocStore,
  docsInput?: DocMeta[],
): Promise<RetrievalScope> {
  const docs =
    Array.isArray(docsInput) && docsInput.length
      ? docsInput
      : await docStore.listDocs();
  const allDocIds = Array.from(
    new Set(docs.map((d) => String(d.docId || "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
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
  const docScopeLock = resolveDocScopeLockFromSignals(signals);

  const isDiscovery = (signals.intentFamily ?? null) === "doc_discovery";
  const corpusAllowed = signals.corpusSearchAllowed ?? isDiscovery;

  // Canonical scope lock owner:
  // - single_doc: strict one-doc lock
  // - docset: strict multi-doc lock
  if (docScopeLock.mode === "single_doc" && !corpusAllowed) {
    const singleDocId =
      String(docScopeLock.activeDocumentId || "").trim() ||
      docScopeLock.allowedDocumentIds[0] ||
      "";
    if (!singleDocId) {
      return {
        candidateDocIds: [],
        hardScopeActive: true,
        sheetName: signals.resolvedSheetName ?? null,
        rangeA1: signals.resolvedRangeA1 ?? null,
      };
    }
    return {
      candidateDocIds: [singleDocId],
      hardScopeActive: true,
      sheetName: signals.resolvedSheetName ?? null,
      rangeA1: signals.resolvedRangeA1 ?? null,
    };
  }

  if (docScopeLock.mode === "docset" && !corpusAllowed) {
    if (docScopeLock.allowedDocumentIds.length === 0) {
      throw new RetrievalScopeLockConfigurationError(
        "docScopeLock.mode=docset requires non-empty allowedDocumentIds.",
      );
    }
    const allowedSet = new Set(docScopeLock.allowedDocumentIds);
    // IMPORTANT: never apply corpus-wide max-candidate caps before enforcing
    // an explicit docset lock. Attached-doc scope is the user's hard source
    // of truth and must remain intact even when > maxCandidateDocsHard.
    const scopedDocIds = allDocIds.filter((docId) => allowedSet.has(docId));
    return {
      candidateDocIds: scopedDocIds,
      hardScopeActive: true,
      sheetName: signals.resolvedSheetName ?? null,
      rangeA1: signals.resolvedRangeA1 ?? null,
    };
  }

  // Legacy explicit doc ref always wins (hard lock candidate)
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

  // Legacy explicit doc lock: restrict to active doc unless discovery mode
  if (signals.explicitDocLock && activeDocId && !corpusAllowed) {
    return {
      candidateDocIds: [activeDocId],
      hardScopeActive: true,
      sheetName: signals.resolvedSheetName ?? null,
      rangeA1: signals.resolvedRangeA1 ?? null,
    };
  }

  // Legacy single-doc intent: prefer active doc if exists; else fall back to corpus
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
    hardScopeActive: Boolean(signals.hardScopeActive),
    sheetName: signals.resolvedSheetName ?? null,
    rangeA1: signals.resolvedRangeA1 ?? null,
  };
}

// ── Explicit Signal Resolvers ───────────────────────────────────────

export function resolveExplicitDocIds(
  signals: RetrievalRequest["signals"],
): string[] {
  const docScopeLock = resolveDocScopeLockFromSignals(signals);
  const out = [
    ...(Array.isArray(signals.explicitDocIds) ? signals.explicitDocIds : []),
    ...(Array.isArray(signals.allowedDocumentIds)
      ? signals.allowedDocumentIds
      : []),
    ...(Array.isArray(docScopeLock.allowedDocumentIds)
      ? docScopeLock.allowedDocumentIds
      : []),
    signals.resolvedDocId ?? "",
    signals.activeDocId ?? "",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(out));
}

export function resolveExplicitDocTypes(
  signals: RetrievalRequest["signals"],
  normalizeDocType: (value: unknown) => string | null,
): string[] {
  if (!Array.isArray(signals.explicitDocTypes)) return [];
  return Array.from(
    new Set(
      signals.explicitDocTypes
        .map((value) => normalizeDocType(value))
        .filter(Boolean) as string[],
    ),
  );
}

export function resolveExplicitDocDomains(
  signals: RetrievalRequest["signals"],
): string[] {
  if (!Array.isArray(signals.explicitDocDomains)) return [];
  const out = signals.explicitDocDomains
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return Array.from(new Set(out));
}

export function isDocLockActive(signals: RetrievalRequest["signals"]): boolean {
  const docScopeLock = resolveDocScopeLockFromSignals(signals);
  return (
    docScopeLock.mode !== "none" ||
    Boolean(signals.explicitDocLock || signals.explicitDocRef)
  );
}

export function resolveLanguageHint(
  signals: RetrievalRequest["signals"],
): string {
  return String(signals.languageHint || "any")
    .trim()
    .toLowerCase();
}

export function isCompareIntent(
  signals: RetrievalRequest["signals"],
  normalizedQuery: string,
): boolean {
  const intent = String(signals.intentFamily || "").toLowerCase();
  const operator = String(signals.operator || "").toLowerCase();
  if (intent.includes("compare")) return true;
  if (operator.includes("compare")) return true;
  return /\b(compare|comparison|vs\.?|versus|difference|differ|between|contrast|comparar|diferenca|diferença|entre)\b/i.test(
    normalizedQuery,
  );
}

// ── Expansion ───────────────────────────────────────────────────────

export function computeExpansionPolicy(
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  semanticCfg: Record<string, any>,
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
export function expandQuery(
  normalizedQuery: string,
  signals: RetrievalRequest["signals"],
  bankLoader: BankLoader,
): string[] {
  let synonymBank: Record<string, any> | null = null;
  try {
    synonymBank = bankLoader.getBank<Record<string, any>>(BANK_IDS.synonymExpansion);
  } catch {
    synonymBank = null;
  }
  if (!synonymBank?.config?.enabled || !synonymBank?.groups) {
    return [normalizedQuery];
  }

  const cfg = synonymBank.config;
  const maxExpansionsTotal = safeNumber(cfg.policy?.maxExpansionsTotal, 12);
  const maxExpansionsPerTerm = safeNumber(
    cfg.policy?.maxExpansionsPerTerm,
    4,
  );

  const queryTokens = simpleTokens(normalizedQuery);
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
            new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"),
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
              new RegExp(`\\b${escapeRegex(token)}\\b`, "gi"),
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

// ── Scope Enforcement ───────────────────────────────────────────────

export function shouldEnforceScopedDocSet(
  scope: { candidateDocIds: string[]; hardScopeActive: boolean },
  signals: RetrievalRequest["signals"],
): boolean {
  const isDiscovery =
    signals.intentFamily === "doc_discovery" ||
    signals.corpusSearchAllowed === true;
  if (isDiscovery) return false;
  if (!scope.hardScopeActive) return false;
  return (
    Array.isArray(scope.candidateDocIds) && scope.candidateDocIds.length > 0
  );
}

export function enforceScopeInvariant(
  docIds: string[],
  scope: { candidateDocIds: string[]; hardScopeActive: boolean },
  signals: RetrievalRequest["signals"],
  stage: ScopeInvariantStage,
  scopeMetrics: RetrievalScopeMetrics,
): void {
  if (!shouldEnforceScopedDocSet(scope, signals)) return;
  const allowed = new Set(scope.candidateDocIds);
  const violatingDocIds = Array.from(
    new Set(
      docIds
        .map((docId) => String(docId || "").trim())
        .filter((docId) => docId && !allowed.has(docId)),
    ),
  );
  if (!violatingDocIds.length) return;

  scopeMetrics.scopeViolationsDetected += violatingDocIds.length;
  scopeMetrics.scopeViolationsThrown += 1;
  throw new RetrievalScopeViolationError({
    stage,
    allowedDocIds: [...allowed].sort((a, b) => a.localeCompare(b)),
    violatingDocIds,
    hardScopeActive: scope.hardScopeActive,
    explicitDocLock: Boolean(signals.explicitDocLock),
    explicitDocRef: Boolean(signals.explicitDocRef),
    singleDocIntent: Boolean(signals.singleDocIntent),
    intentFamily: signals.intentFamily ?? null,
  });
}
