/**
 * Retrieval Config — Centralized environment + bank ID registry
 *
 * All process.env reads for the v2 retrieval pipeline are consolidated here.
 * Modules import the frozen config object instead of reading env vars directly.
 */

import { safeNumber } from "../retrievalEngine.utils";

// ── Environment Configuration ───────────────────────────────────────

function envBool(key: string, fallback: boolean): boolean {
  const raw = String(process.env[key] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function envString(key: string, fallback: string): string {
  const raw = String(process.env[key] || "").trim();
  return raw || fallback;
}

function envNumber(key: string, fallback: number): number {
  return safeNumber(process.env[key], fallback);
}

export interface RetrievalConfig {
  // Phase runner
  readonly phaseCallTimeoutMs: number;
  readonly phaseBudgetMs: number;
  readonly extraVariantPhases: string;

  // Query variants
  readonly maxQueryVariants: number;

  // Cache
  readonly rewriteCacheMax: number;
  readonly rewriteCacheTtlMs: number;
  readonly retrievalCacheMax: number;
  readonly retrievalCacheTtlMs: number;
  readonly multiLevelCacheEnabled: boolean;
  readonly modelVersion: string;

  // Resilience
  readonly failMode: string;

  // Memory guard
  readonly maxHeapUsedMb: number;

  // Encrypted mode
  readonly isEncryptedOnlyMode: boolean;
}

export const RETRIEVAL_CONFIG: Readonly<RetrievalConfig> = Object.freeze({
  // Phase runner
  phaseCallTimeoutMs: Math.max(1000, Math.floor(envNumber("RETRIEVAL_PHASE_CALL_TIMEOUT_MS", 8000))),
  phaseBudgetMs: Math.max(3000, Math.floor(envNumber("RETRIEVAL_PHASE_BUDGET_MS", 25000))),
  extraVariantPhases: envString("RETRIEVAL_EXTRA_VARIANT_PHASES", "semantic_and_lexical").toLowerCase(),

  // Query variants
  maxQueryVariants: Math.max(1, Math.floor(envNumber("RETRIEVAL_MAX_QUERY_VARIANTS", 6))),

  // Cache
  rewriteCacheMax: envNumber("BANK_REWRITE_CACHE_MAX", 1000),
  rewriteCacheTtlMs: envNumber("BANK_REWRITE_CACHE_TTL_MS", 5 * 60 * 1000),
  retrievalCacheMax: envNumber("BANK_RETRIEVAL_CACHE_MAX", 800),
  retrievalCacheTtlMs: envNumber("BANK_RETRIEVAL_CACHE_TTL_MS", 5 * 60 * 1000),
  multiLevelCacheEnabled: envBool("BANK_MULTI_LEVEL_CACHE_ENABLED", false),
  modelVersion: envString("RETRIEVAL_MODEL_VERSION", "")
    || envString("OPENAI_MODEL", "")
    || envString("LLM_MODEL_ID", "unknown"),

  // Resilience
  failMode: envString("RETRIEVAL_FAIL_MODE", "open").toLowerCase(),

  // Memory guard
  maxHeapUsedMb: envNumber("RETRIEVAL_MAX_HEAP_USED_MB", 512),

  // Encrypted mode
  isEncryptedOnlyMode: (() => {
    const raw = String(process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY || "").trim().toLowerCase();
    if (!raw) return true;
    return ["1", "true", "yes", "on"].includes(raw);
  })(),
});

export function isFailClosedMode(): boolean {
  const mode = RETRIEVAL_CONFIG.failMode;
  return mode === "closed" || mode === "fail_closed" || mode === "fail-closed";
}

// ── Bank ID Constants ───────────────────────────────────────────────

export const BANK_IDS = Object.freeze({
  semanticSearchConfig: "semantic_search_config",
  retrievalRankerConfig: "retrieval_ranker_config",
  keywordBoostRules: "keyword_boost_rules",
  docTitleBoostRules: "doc_title_boost_rules",
  docTypeBoostRules: "doc_type_boost_rules",
  recencyBoostRules: "recency_boost_rules",
  routingPriority: "routing_priority",
  diversificationRules: "diversification_rules",
  retrievalNegatives: "retrieval_negatives",
  evidencePackaging: "evidence_packaging",
  tableRenderPolicy: "table_render_policy",
  snippetCompressionPolicy: "snippet_compression_policy",
  evidencePackagingPolicy: "evidence_packaging_policy",
  entityRoleOntology: "entity_role_ontology",
  synonymExpansion: "synonym_expansion",
} as const);
