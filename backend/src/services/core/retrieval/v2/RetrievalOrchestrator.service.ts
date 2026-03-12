/**
 * Retrieval Orchestrator v2
 *
 * Thin pipeline wiring: calls focused modules in sequence.
 * No business logic of its own — each step delegates to a module.
 *
 * 12-step pipeline:
 *  1. Safety gate
 *  2. Load banks
 *  3. Normalize query
 *  4. Resolve scope + classification + rules
 *  5. Expansion + query variants
 *  6. Run hybrid retrieval phases
 *  7. Merge phase candidates
 *  8. Apply negatives
 *  9. Apply boosts + plan hints
 * 10. Rank candidates
 * 11. Diversify
 * 12. Package evidence
 */

import crypto from "crypto";

import { logger } from "../../../../utils/logger";
import type {
  RetrievalRequest,
  EvidencePack,
  RetrievalRuntimeStatus,
  RetrievalRuntimeError,
  BankLoader,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  DocStore,
  QueryNormalizer,
  DocMeta,
  CandidateChunk,
  RetrievalRuleTelemetryEvent,
  RetrievalRuleTelemetryEventName,
  RetrievalPhaseCounts,
  RetrievalScopeMetrics,
  DocumentClassificationResult,
  IRetrievalEngine,
} from "../retrieval.types";
import {
  clamp01,
  isProductionEnv,
  safeNumber,
  safeGetBank,
} from "../retrievalEngine.utils";
import { RETRIEVAL_CONFIG, BANK_IDS, isFailClosedMode } from "./retrieval.config";
import {
  resolveDocScopeLockFromSignals,
} from "../docScopeLock";
import {
  applyBoostScoring,
  applyQueryRewrites,
  enforceCrossDocPolicy,
  matchBoostRules,
  selectSectionScanPlan,
  summarizeBoostRuleApplications,
  type MatchedBoostRule,
  type BoostRule,
  type RewriteRule,
  type RuleMatchContext,
  type SectionPriorityRule,
} from "../../../retrieval/document_intelligence/ruleInterpreter";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
  type DocumentIntelligenceDomain,
} from "../../banks/documentIntelligenceBanks.service";
import type { RetrievalPlan } from "../retrievalPlanParser.service";
import { BankRuntimeCache } from "../../cache/bankRuntimeCache.service";

// ── v2 module imports ────────────────────────────────────────────────
import { normalizeQuery, simpleTokens } from "./QueryPreparation.service";
import {
  resolveScope,
  resolveExplicitDocIds,
  resolveExplicitDocTypes,
  resolveExplicitDocDomains,
  isDocLockActive,
  resolveLanguageHint,
  isCompareIntent,
  computeExpansionPolicy,
  expandQuery,
  enforceScopeInvariant,
} from "./ScopeResolver.service";
import {
  classifyDocumentContext,
  normalizeDomainHint,
  normalizeDocType,
} from "./DocumentClassification.service";
import {
  buildQueryVariants,
  buildDocTypeBoostPlan,
  buildDocTypeMatchedRule,
} from "./QueryVariantBuilder.service";
import { runPhases } from "./PhaseRunner.service";
import { mergePhaseCandidates } from "./CandidateMerge.service";
import { applyRetrievalNegatives } from "./NegativeRules.service";
import { applyBoosts } from "./BoostEngine.service";
import { applyRetrievalPlanHints } from "./PlanHints.service";
import { rankCandidates } from "./Ranker.service";
import { applyDiversification } from "./Diversifier.service";
import { packageEvidence, applyNonComparePurityPreRank, isExploratoryRetrievalRequest } from "./EvidencePackager.service";
import { buildTelemetryDiagnostics, emptyPack } from "./RetrievalTelemetry.service";
import { buildRetrievalCacheKey, cloneEvidencePack } from "./RetrievalCache.service";
import { validateAllCriticalBanks } from "./BankShapeValidator.service";

// ── Cache singletons ─────────────────────────────────────────────────

const queryRewriteCache = new BankRuntimeCache<{
  variants: Array<{ text: string; weight: number; sourceRuleId: string; reason: string }>;
  ruleIds: string[];
}>({
  maxEntries: RETRIEVAL_CONFIG.rewriteCacheMax,
  ttlMs: RETRIEVAL_CONFIG.rewriteCacheTtlMs,
});

const retrievalResultCache = new BankRuntimeCache<EvidencePack>({
  maxEntries: RETRIEVAL_CONFIG.retrievalCacheMax,
  ttlMs: RETRIEVAL_CONFIG.retrievalCacheTtlMs,
});

// ── Resilience helpers ───────────────────────────────────────────────

function dedupeReasonCodes(reasonCodes: string[]): string[] {
  return Array.from(
    new Set(
      reasonCodes.map((code) => String(code || "").trim()).filter(Boolean),
    ),
  );
}

// isFailClosedMode imported from retrieval.config

function resolveRuntimeError(
  runtimeStatus: RetrievalRuntimeStatus,
  runtimeError: RetrievalRuntimeError | undefined,
  reasonCodes: string[],
): RetrievalRuntimeError | undefined {
  if (runtimeStatus === "ok") return undefined;
  if (runtimeError) return runtimeError;
  const hasTimeoutSignal = reasonCodes.some((code) =>
    /(timed_out|timeout)/i.test(code),
  );
  if (runtimeStatus === "failed") {
    return hasTimeoutSignal
      ? { code: "timeout", message: "Retrieval failed due to upstream timeout.", retryable: true }
      : { code: "dependency_unavailable", message: "Retrieval failed due to upstream dependency failure.", retryable: true };
  }
  return hasTimeoutSignal
    ? { code: "timeout", message: "Retrieval completed with timeout degradation.", retryable: true }
    : { code: "dependency_unavailable", message: "Retrieval completed in degraded mode.", retryable: true };
}

// isEncryptedOnlyMode and safeGetBank imported from shared modules

// ── Orchestrator ─────────────────────────────────────────────────────

export class RetrievalOrchestratorV2 implements IRetrievalEngine {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly docStore: DocStore,
    private readonly semanticIndex: SemanticIndex,
    private readonly lexicalIndex: LexicalIndex,
    private readonly structuralIndex: StructuralIndex,
    private readonly queryNormalizer?: QueryNormalizer,
    private readonly documentIntelligenceBanks: Pick<
      DocumentIntelligenceBanksService,
      | "getCrossDocGroundingPolicy"
      | "getDocumentIntelligenceDomains"
      | "getDocTypeCatalog"
      | "getDocTypeSections"
      | "getDocTypeTables"
      | "getDomainDetectionRules"
      | "getRetrievalBoostRules"
      | "getQueryRewriteRules"
      | "getSectionPriorityRules"
    > &
      Partial<
        Pick<DocumentIntelligenceBanksService, "getDocTypeExtractionHints">
      > = getDocumentIntelligenceBanksInstance(),
  ) {}

  async retrieve(req: RetrievalRequest): Promise<EvidencePack> {
    try {
      const pack = await this.retrieveCore(req);
      const existingCodes = dedupeReasonCodes(pack.debug?.reasonCodes || []);
      const hasPhaseFailureCode = existingCodes.some((code) =>
        /(semantic|lexical|structural)_search_(failed|timed_out)/i.test(code),
      );
      const hasDegradedCode = existingCodes.some((code) =>
        /(timed_out|failed|degraded|budget)/i.test(code),
      );
      const phaseNotes = (pack.debug?.phases || [])
        .map((phase) => String(phase?.note || ""))
        .join(" ")
        .toLowerCase();
      const failClosed = isFailClosedMode();
      const shouldFailClosed =
        failClosed && pack.evidence.length === 0 && hasPhaseFailureCode;

      let runtimeStatus: RetrievalRuntimeStatus = pack.runtimeStatus || "ok";
      if (shouldFailClosed) {
        runtimeStatus = "failed";
      } else if (
        runtimeStatus === "ok" &&
        (hasDegradedCode || phaseNotes.includes("timeout"))
      ) {
        runtimeStatus = "degraded";
      }

      let reasonCodes = existingCodes;
      if (runtimeStatus === "failed") {
        reasonCodes = dedupeReasonCodes([...reasonCodes, "retrieval_v2_failed"]);
      } else if (runtimeStatus === "degraded") {
        reasonCodes = dedupeReasonCodes([...reasonCodes, "retrieval_v2_degraded"]);
      }
      const runtimeError = resolveRuntimeError(runtimeStatus, pack.runtimeError, reasonCodes);
      if (!pack.debug) {
        return { ...pack, runtimeStatus, runtimeError };
      }
      return {
        ...pack,
        runtimeStatus,
        runtimeError,
        debug: { ...pack.debug, reasonCodes },
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error || "unknown_error");
      logger.warn("[retrieval-v2] retrieve failed; returning failed pack", { error: message });

      const debug = isProductionEnv(req.env)
        ? undefined
        : {
            phases: [{ phaseId: "retrieval_runtime_error", candidates: 0, note: "Runtime exception: " + message }],
            reasonCodes: ["retrieval_runtime_error", "retrieval_failed"],
          };
      return {
        runtimeStatus: "failed",
        runtimeError: { code: "runtime_invariant_breach", message, retryable: true },
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
          candidatesConsidered: 0, candidatesAfterNegatives: 0,
          candidatesAfterBoosts: 0, candidatesAfterDiversification: 0,
          scopeCandidatesDropped: 0, scopeViolationsDetected: 0,
          scopeViolationsThrown: 0, evidenceItems: 0,
          uniqueDocsInEvidence: 0, topScore: null, scoreGap: null,
        },
        evidence: [],
        debug,
      };
    }
  }

  /** Load all retrieval banks needed for the pipeline. */
  private loadRetrievalBanks() {
    return {
      semanticCfg: this.bankLoader.getBank<any>(BANK_IDS.semanticSearchConfig),
      rankerCfg: this.bankLoader.getBank<any>(BANK_IDS.retrievalRankerConfig),
      boostsKeyword: safeGetBank<Record<string, any>>(this.bankLoader, BANK_IDS.keywordBoostRules),
      boostsTitle: safeGetBank<Record<string, any>>(this.bankLoader, BANK_IDS.docTitleBoostRules),
      boostsType: safeGetBank<Record<string, any>>(this.bankLoader, BANK_IDS.docTypeBoostRules),
      boostsRecency: safeGetBank<Record<string, any>>(this.bankLoader, BANK_IDS.recencyBoostRules),
      routingPriority: safeGetBank<Record<string, any>>(this.bankLoader, BANK_IDS.routingPriority),
      diversification: this.bankLoader.getBank<any>(BANK_IDS.diversificationRules),
      negatives: this.bankLoader.getBank<any>(BANK_IDS.retrievalNegatives),
      packaging: this.bankLoader.getBank<any>(BANK_IDS.evidencePackaging),
      crossDocGrounding: this.documentIntelligenceBanks.getCrossDocGroundingPolicy(),
    };
  }

  /** Build classification, rule context, cross-doc policy, boost rules, query variants. */
  private prepareRulesAndVariants(
    req: RetrievalRequest,
    queryOriginal: string,
    queryNormalized: string,
    signals: RetrievalRequest["signals"],
    scope: { candidateDocIds: string[]; hardScopeActive: boolean; sheetName?: string | null; rangeA1?: string | null },
    semanticCfg: Record<string, any>,
    telemetry: {
      retrievalRuleEvents: RetrievalRuleTelemetryEvent[];
      matchedBoostRuleIds: string[];
      appliedBoostRuleIds: string[];
      rewriteRuleIds: string[];
      selectedSectionRuleId: string | null;
      crossDocGatedReason: string | null;
    },
  ): {
    classification: DocumentClassificationResult;
    domain: string | null;
    resolvedDocTypes: string[];
    resolvedDocDomains: string[];
    ruleCtx: RuleMatchContext;
    compareIntentFlag: boolean;
    crossDocDecision: ReturnType<typeof enforceCrossDocPolicy>;
    runtimeBoostRules: MatchedBoostRule[];
    queryVariants: ReturnType<typeof buildQueryVariants>;
    expandedQueries: string[];
    additionalStructuralAnchors: string[];
    retrievalCacheKey: string | null;
    cachedPack: EvidencePack | null;
  } {
    // Classification + rule context
    const hintedDomain = normalizeDomainHint(signals.domainHint);
    const explicitDocIdsList = resolveExplicitDocIds(signals);
    const explicitDocTypesList = resolveExplicitDocTypes(signals, normalizeDocType);
    const explicitDocDomainsList = resolveExplicitDocDomains(signals);
    const classification = classifyDocumentContext({
      query: queryOriginal,
      normalizedQuery: queryNormalized,
      hintedDomain,
      explicitDocTypes: explicitDocTypesList,
      explicitDocDomains: explicitDocDomainsList,
    }, this.documentIntelligenceBanks);
    const domain = hintedDomain ?? classification.domain;
    const resolvedDocTypes = explicitDocTypesList.length
      ? explicitDocTypesList
      : classification.docTypeId ? [classification.docTypeId] : [];
    const resolvedDocDomains = explicitDocDomainsList.length
      ? explicitDocDomainsList
      : domain ? [domain] : [];
    const ruleCtx: RuleMatchContext = {
      query: queryOriginal,
      normalizedQuery: queryNormalized,
      intent: signals.queryFamily ?? signals.intentFamily ?? null,
      operator: signals.operator ?? null,
      domain: domain || null,
      docLock: isDocLockActive(signals),
      explicitDocsCount: explicitDocIdsList.length,
      explicitDocIds: explicitDocIdsList,
      explicitDocTypes: resolvedDocTypes,
      explicitDocDomains: resolvedDocDomains,
      language: resolveLanguageHint(signals),
    };

    const emitRuleEvent = (event: RetrievalRuleTelemetryEventName, payload: Record<string, any>) => {
      telemetry.retrievalRuleEvents.push({ event, payload });
    };

    // Cross-doc policy
    const compareIntentFlag = isCompareIntent(signals, queryNormalized);
    const crossDocDecision = enforceCrossDocPolicy(
      { ...ruleCtx, candidateDocIds: scope.candidateDocIds, isCompareIntent: compareIntentFlag },
      this.documentIntelligenceBanks.getCrossDocGroundingPolicy(),
    );
    if (!crossDocDecision.allow) {
      telemetry.crossDocGatedReason = crossDocDecision.reasonCode || "cross_doc_blocked";
      emitRuleEvent("retrieval.crossdoc_gated", {
        reason: telemetry.crossDocGatedReason,
        requiredExplicitDocs: crossDocDecision.requiredExplicitDocs,
        actualExplicitDocs: crossDocDecision.actualExplicitDocs,
      });
    }

    // Cache check
    const retrievalCacheEnabled = RETRIEVAL_CONFIG.multiLevelCacheEnabled;
    const retrievalCacheModelVersion = RETRIEVAL_CONFIG.modelVersion;
    let retrievalCacheKey: string | null = null;
    let cachedPack: EvidencePack | null = null;
    if (retrievalCacheEnabled) {
      retrievalCacheKey = buildRetrievalCacheKey({
        queryNormalized, scopeDocIds: crossDocDecision.allowedCandidateDocIds, domain, resolvedDocTypes,
        resolvedDocDomains, signals, retrievalPlan: req.retrievalPlan || null,
        overrides: req.overrides || null, env: req.env, modelVersion: retrievalCacheModelVersion,
        history: req.history,
      });
      const cached = retrievalResultCache.get(retrievalCacheKey);
      if (cached) {
        cachedPack = cloneEvidencePack(cached);
        if (cachedPack.debug) {
          const reasons = Array.isArray(cachedPack.debug.reasonCodes) ? cachedPack.debug.reasonCodes : [];
          if (!reasons.includes("retrieval_cache_hit")) reasons.push("retrieval_cache_hit");
          cachedPack.debug.reasonCodes = reasons;
        }
      }
    }

    // Bank filtering
    const requiredBankSet =
      Array.isArray(signals.requiredBankIds) && signals.requiredBankIds.length > 0
        ? new Set(signals.requiredBankIds.map((id) => String(id || "").trim()).filter(Boolean))
        : null;
    const includeBank = (bankId: string): boolean => !requiredBankSet || requiredBankSet.has(bankId);

    // Domain-specific rules
    const domainBoostBank = domain && includeBank(`boost_rules_${domain}`)
      ? this.documentIntelligenceBanks.getRetrievalBoostRules(domain) : null;
    const domainRewriteBank = domain && includeBank(`query_rewrites_${domain}`)
      ? this.documentIntelligenceBanks.getQueryRewriteRules(domain) : null;
    const sectionPriorityBank = domain && includeBank(`section_priority_${domain}`)
      ? this.documentIntelligenceBanks.getSectionPriorityRules(domain) : null;

    const boostRules = Array.isArray(domainBoostBank?.rules) ? (domainBoostBank.rules as BoostRule[]) : [];
    const matchedBoostRules = matchBoostRules(
      { ...ruleCtx, maxMatchedBoostRules: safeNumber(domainBoostBank?.config?.maxMatchedRules, 3), maxDocumentIntelligenceBoost: safeNumber(domainBoostBank?.config?.maxDocumentIntelligenceBoost, 0.45) },
      boostRules,
    );
    let runtimeBoostRules: MatchedBoostRule[] = [...matchedBoostRules];
    const docTypeBoostPlan = domain && resolvedDocTypes.length > 0
      ? buildDocTypeBoostPlan(domain, resolvedDocTypes[0], this.documentIntelligenceBanks)
      : null;
    const syntheticDocTypeRule = docTypeBoostPlan
      ? buildDocTypeMatchedRule(docTypeBoostPlan)
      : null;
    if (syntheticDocTypeRule) runtimeBoostRules.push(syntheticDocTypeRule);
    runtimeBoostRules = runtimeBoostRules.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id.localeCompare(b.id);
    });
    for (const rule of runtimeBoostRules) {
      telemetry.matchedBoostRuleIds.push(rule.id);
      emitRuleEvent("retrieval.boost_rule_hit", { ruleId: rule.id, domain: domain || "unknown", operator: signals.operator ?? "unknown", intent: signals.intentFamily ?? "unknown" });
    }

    // Expansion + query variants
    const expansion = computeExpansionPolicy(req, signals, semanticCfg);
    const expansionDisabledByOverride = Boolean(req.overrides?.disableExpansion);
    const expandedQueries = expansion.enabled
      ? expansionDisabledByOverride ? [] : expandQuery(queryNormalized, signals, this.bankLoader)
      : [];

    const rewriteRules = Array.isArray(domainRewriteBank?.rules)
      ? (domainRewriteBank.rules as RewriteRule[]) : [];
    const rewriteCacheEnabled = RETRIEVAL_CONFIG.multiLevelCacheEnabled;
    const rewriteCacheKeyBase = crypto
      .createHash("sha256")
      .update(JSON.stringify({
        queryNormalized, domain: domain || "unknown",
        intentFamily: signals.queryFamily ?? signals.intentFamily ?? "any",
        locale: resolveLanguageHint(signals),
        rewriteRuleCount: rewriteRules.length,
        bankVersion: signals.selectedBankVersionMap || null,
      }), "utf8")
      .digest("hex");
    const rewriteCacheKey = `rewrite:${rewriteCacheKeyBase}`;
    const cachedRewrite = rewriteCacheEnabled ? queryRewriteCache.get(rewriteCacheKey) : null;
    const domainRewriteVariants = cachedRewrite
      ? cachedRewrite.variants
      : applyQueryRewrites(
          { ...ruleCtx, contextText: queryNormalized, maxQueryVariants: safeNumber(domainRewriteBank?.config?.maxRewriteTerms, 12) },
          rewriteRules,
        );
    if (!cachedRewrite && rewriteCacheEnabled) {
      queryRewriteCache.set(rewriteCacheKey, {
        variants: domainRewriteVariants,
        ruleIds: Array.from(new Set(domainRewriteVariants.map((v) => String(v.sourceRuleId || "").trim()).filter(Boolean))),
      });
    }
    const rewriteVariantCounts = new Map<string, number>();
    for (const variant of domainRewriteVariants) {
      const ruleId = String(variant.sourceRuleId || "").trim();
      if (!ruleId) continue;
      rewriteVariantCounts.set(ruleId, (rewriteVariantCounts.get(ruleId) || 0) + 1);
    }
    for (const [ruleId, variantCount] of Array.from(rewriteVariantCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      telemetry.rewriteRuleIds.push(ruleId);
      emitRuleEvent("retrieval.rewrite_applied", { ruleId, variantCount });
    }
    const queryVariants = buildQueryVariants({
      baseQuery: queryNormalized,
      expandedQueries,
      rewriteVariants: domainRewriteVariants,
      plannerQueryVariants: Array.isArray(req.retrievalPlan?.queryVariants) ? (req.retrievalPlan?.queryVariants as string[]) : [],
      requiredTerms: Array.isArray(req.retrievalPlan?.requiredTerms) ? (req.retrievalPlan?.requiredTerms as string[]) : [],
      maxVariants: safeNumber(domainRewriteBank?.config?.maxRewriteTerms, 12),
    });
    const sectionRules = Array.isArray(sectionPriorityBank?.priorities)
      ? (sectionPriorityBank.priorities as SectionPriorityRule[]) : [];
    const sectionScanPlan = selectSectionScanPlan(ruleCtx, sectionRules);
    telemetry.selectedSectionRuleId = sectionScanPlan.selectedRuleId;
    if (telemetry.selectedSectionRuleId) {
      emitRuleEvent("retrieval.section_plan_selected", { ruleId: telemetry.selectedSectionRuleId, anchorsCount: sectionScanPlan.sections.length });
    }
    const additionalStructuralAnchors = Array.from(
      new Set([...sectionScanPlan.sections, ...(docTypeBoostPlan?.sectionAnchors || []), ...(docTypeBoostPlan?.tableAnchors || [])]),
    );

    return {
      classification, domain, resolvedDocTypes, resolvedDocDomains,
      ruleCtx, compareIntentFlag, crossDocDecision,
      runtimeBoostRules, queryVariants, expandedQueries,
      additionalStructuralAnchors, retrievalCacheKey, cachedPack,
    };
  }

  protected async retrieveCore(req: RetrievalRequest): Promise<EvidencePack> {
    // 0) Safety gate
    if (req.signals.unsafeGate) {
      return emptyPack(req, { reasonCodes: ["unsafe_gate"], note: "Retrieval bypassed due to unsafeGate signal." });
    }

    // 0b) Memory guard
    const heapMb = process.memoryUsage().heapUsed / (1024 * 1024);
    if (heapMb > RETRIEVAL_CONFIG.maxHeapUsedMb) {
      logger.warn("[retrieval] Memory pressure", { heapMb });
      return emptyPack(req, { reasonCodes: ["memory_pressure"] });
    }

    // 1) Load banks
    const banks = this.loadRetrievalBanks();
    const { semanticCfg, rankerCfg, boostsKeyword, boostsTitle, boostsType, boostsRecency,
            routingPriority, diversification, negatives, packaging } = banks;

    // 1b) Validate critical bank shapes
    const bankShapeValidation = validateAllCriticalBanks({
      [BANK_IDS.semanticSearchConfig]: semanticCfg,
      [BANK_IDS.retrievalRankerConfig]: rankerCfg,
      [BANK_IDS.retrievalNegatives]: negatives,
      [BANK_IDS.evidencePackaging]: packaging,
      [BANK_IDS.diversificationRules]: diversification,
    });
    if (!bankShapeValidation.allValid) {
      if (isFailClosedMode()) {
        logger.error("[retrieval] Critical bank shape validation failed in fail-closed mode", {
          failures: bankShapeValidation.failures,
        });
        return emptyPack(req, { reasonCodes: ["bank_shape_validation_failed"] });
      }
      logger.warn("[retrieval] Critical bank shape validation failed, continuing in fail-open mode", {
        failures: bankShapeValidation.failures,
      });
    }

    // 2) Normalize query
    const norm = await normalizeQuery(req, this.queryNormalizer);
    const queryOriginal = req.query;
    const queryNormalized = norm.normalized;
    const signals = {
      ...req.signals,
      hasQuotedText: req.signals.hasQuotedText ?? norm.hasQuotedText,
      hasFilename: req.signals.hasFilename ?? norm.hasFilename,
    };

    const allDocs = await this.docStore.listDocs();
    const docMetaById = new Map<string, DocMeta>();
    for (const doc of allDocs) {
      const docId = String(doc?.docId || "").trim();
      if (!docId) continue;
      docMetaById.set(docId, doc);
    }

    // 3) Resolve scope
    let scope = await resolveScope(req, signals, semanticCfg, this.docStore, allDocs);
    if (scope.hardScopeActive && scope.candidateDocIds.length === 0) {
      const reasonCode = signals.explicitDocRef
        ? "explicit_doc_not_found"
        : "scope_hard_constraints_empty";
      return emptyPack(req, { reasonCodes: [reasonCode], note: "Hard scope active but no candidate documents resolved." });
    }

    // 4) Classification, rules, variants
    const telemetry = {
      retrievalRuleEvents: [] as RetrievalRuleTelemetryEvent[],
      matchedBoostRuleIds: [] as string[],
      appliedBoostRuleIds: [] as string[],
      rewriteRuleIds: [] as string[],
      selectedSectionRuleId: null as string | null,
      crossDocGatedReason: null as string | null,
    };
    const prep = this.prepareRulesAndVariants(
      req, queryOriginal, queryNormalized, signals, scope, semanticCfg, telemetry,
    );

    if (!prep.crossDocDecision.allow) {
      return emptyPack(
        req,
        {
          reasonCodes: [telemetry.crossDocGatedReason!],
          note: prep.crossDocDecision.askDisambiguation
            ? "Cross-document retrieval requires explicit disambiguation."
            : "Cross-document retrieval blocked by policy.",
        },
        buildTelemetryDiagnostics({ ruleEvents: telemetry.retrievalRuleEvents, matchedBoostRuleIds: telemetry.matchedBoostRuleIds, appliedBoostRuleIds: telemetry.appliedBoostRuleIds, rewriteRuleIds: telemetry.rewriteRuleIds, selectedSectionRuleId: telemetry.selectedSectionRuleId, crossDocGatedReason: telemetry.crossDocGatedReason, classification: prep.classification }),
      );
    }
    scope = { ...scope, candidateDocIds: prep.crossDocDecision.allowedCandidateDocIds };

    if (prep.cachedPack) return prep.cachedPack;

    const { classification, domain, resolvedDocTypes, resolvedDocDomains, ruleCtx,
            compareIntentFlag, runtimeBoostRules, queryVariants, expandedQueries,
            additionalStructuralAnchors, retrievalCacheKey } = prep;

    // 5) Execute hybrid retrieval phases
    const phaseResults = await runPhases({
      queryVariants, scopeDocIds: scope.candidateDocIds, semanticCfg,
      additionalStructuralAnchors,
      semanticIndex: this.semanticIndex, lexicalIndex: this.lexicalIndex, structuralIndex: this.structuralIndex,
    });

    // 6) Merge candidates
    let candidates = mergePhaseCandidates(phaseResults, scope, req, this.bankLoader);
    const exploratoryMode = isExploratoryRetrievalRequest({
      compareIntent: compareIntentFlag, queryNormalized, signals, classification, resolvedDocTypes,
    });
    candidates = applyNonComparePurityPreRank(candidates, {
      compareIntent: compareIntentFlag, classification, resolvedDocTypes, signals, exploratoryMode,
    });
    const scopeMetrics: RetrievalScopeMetrics = {
      scopeCandidatesDropped: 0, scopeViolationsDetected: 0, scopeViolationsThrown: 0,
    };
    const phaseCounts: RetrievalPhaseCounts = {
      considered: candidates.length, afterNegatives: candidates.length,
      afterBoosts: candidates.length, afterDiversification: candidates.length,
    };

    // 7) Apply negatives
    candidates = applyRetrievalNegatives(candidates, req, signals, scope, negatives, this.bankLoader, RETRIEVAL_CONFIG.isEncryptedOnlyMode, scopeMetrics);
    phaseCounts.afterNegatives = candidates.length;
    enforceScopeInvariant(candidates.map((c) => c.docId), scope, signals, "post_negatives", scopeMetrics);

    // 8) Apply boosts
    candidates = applyBoosts(candidates, req, signals, { boostsKeyword, boostsTitle, boostsType, boostsRecency }, docMetaById);
    const documentIntelligenceBoostCtx: RuleMatchContext = {
      ...ruleCtx, maxMatchedBoostRules: 3,
      maxDocumentIntelligenceBoost: 0.45,
    };
    const boostDeltaSummaries = summarizeBoostRuleApplications(documentIntelligenceBoostCtx, candidates, runtimeBoostRules);
    for (const summary of boostDeltaSummaries) {
      telemetry.appliedBoostRuleIds.push(summary.ruleId);
      telemetry.retrievalRuleEvents.push({ event: "retrieval.boost_rule_applied", payload: {
        ruleId: summary.ruleId,
        scoreDeltaSummary: { candidateHits: summary.candidateHits, totalDelta: summary.totalDelta, averageDelta: summary.averageDelta, maxDelta: summary.maxDelta },
      }});
    }
    candidates = applyBoostScoring(documentIntelligenceBoostCtx, candidates, runtimeBoostRules) as CandidateChunk[];
    candidates = applyRetrievalPlanHints(candidates, req.retrievalPlan);
    phaseCounts.afterBoosts = candidates.length;

    // 9) Rank
    candidates = rankCandidates(candidates, req, signals, rankerCfg, routingPriority || undefined, RETRIEVAL_CONFIG.isEncryptedOnlyMode);

    // 10) Diversify
    if (!req.overrides?.disableDiversification) {
      candidates = applyDiversification(candidates, req, signals, diversification);
    }
    phaseCounts.afterDiversification = candidates.length;
    enforceScopeInvariant(candidates.map((c) => c.docId), scope, signals, "post_diversification", scopeMetrics);

    // 11) Package evidence
    const pack = packageEvidence(candidates, req, signals, packaging, {
      queryOriginal, queryNormalized,
      expandedQueries: queryVariants.map((v) => v.text).filter((t) => t !== queryNormalized),
      scope, compareIntent: compareIntentFlag, exploratoryMode, classification, resolvedDocTypes,
      phaseCounts, scopeMetrics,
      bankLoader: this.bankLoader, documentIntelligenceBanks: this.documentIntelligenceBanks,
      isEncryptedOnlyMode: RETRIEVAL_CONFIG.isEncryptedOnlyMode,
    });
    pack.telemetry = buildTelemetryDiagnostics({
      ruleEvents: telemetry.retrievalRuleEvents, matchedBoostRuleIds: telemetry.matchedBoostRuleIds, appliedBoostRuleIds: telemetry.appliedBoostRuleIds,
      rewriteRuleIds: telemetry.rewriteRuleIds, selectedSectionRuleId: telemetry.selectedSectionRuleId, crossDocGatedReason: telemetry.crossDocGatedReason, classification,
    });

    // Phase failure propagation
    const phaseFailureReasonCodes = Array.from(
      new Set(phaseResults.map((p) => p.failureCode).filter((c): c is string => Boolean(c))),
    );
    const phaseFailureNotes = phaseResults
      .filter((p) => p.status !== "ok")
      .map((p) => ({ phaseId: p.phaseId, candidates: p.hits.length, note: p.note }));
    if (phaseFailureReasonCodes.length > 0 || phaseFailureNotes.length > 0) {
      if (!pack.debug) pack.debug = { phases: [], reasonCodes: [] };
      for (const rc of phaseFailureReasonCodes) {
        if (!pack.debug.reasonCodes.includes(rc)) pack.debug.reasonCodes.push(rc);
      }
      const seenPhaseIds = new Set(pack.debug.phases.map((p) => p.phaseId));
      for (const phase of phaseFailureNotes) {
        if (seenPhaseIds.has(phase.phaseId)) continue;
        pack.debug.phases.push(phase);
        seenPhaseIds.add(phase.phaseId);
      }
    }
    enforceScopeInvariant(pack.evidence.map((e) => e.docId), scope, signals, "post_packaging", scopeMetrics);

    // 12) Final safety
    if (pack.evidence.length === 0 && scope.hardScopeActive) {
      const reasonCode = signals.explicitDocRef && !signals.resolvedDocId
        ? "explicit_doc_not_found" : "scope_hard_constraints_empty";
      if (!pack.debug) pack.debug = { phases: [], reasonCodes: [reasonCode] };
      else if (!pack.debug.reasonCodes.includes(reasonCode)) pack.debug.reasonCodes.push(reasonCode);
    }
    if (isProductionEnv(req.env)) delete pack.debug;

    if (RETRIEVAL_CONFIG.multiLevelCacheEnabled && retrievalCacheKey) {
      retrievalResultCache.set(retrievalCacheKey, cloneEvidencePack(pack));
    }

    return pack;
  }
}
