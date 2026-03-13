import { logger } from "../../../../utils/logger";
import type {
  RetrievalRequest,
  EvidencePack,
  BankLoader,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  DocStore,
  QueryNormalizer,
  DocMeta,
  CandidateChunk,
  RetrievalPhaseCounts,
  RetrievalScopeMetrics,
  IRetrievalEngine,
} from "../retrieval.types";
import { RETRIEVAL_CONFIG, BANK_IDS, isFailClosedMode } from "./retrieval.config";
import {
  applyBoostScoring,
  summarizeBoostRuleApplications,
  type RuleMatchContext,
} from "../../../retrieval/document_intelligence/ruleInterpreter";
import {
  getDocumentIntelligenceBanksInstance,
} from "../../banks/documentIntelligenceBanks.service";
import { normalizeQuery } from "./QueryPreparation.service";
import { resolveScope } from "./ScopeResolver.service";
import { runPhases } from "./PhaseRunner.service";
import { mergePhaseCandidates } from "./CandidateMerge.service";
import { applyRetrievalNegatives } from "./NegativeRules.service";
import { applyBoosts } from "./BoostEngine.service";
import { applyRetrievalPlanHints } from "./PlanHints.service";
import { rankCandidates } from "./Ranker.service";
import { applyDiversification } from "./Diversifier.service";
import {
  packageEvidence,
  applyNonComparePurityPreRank,
  isExploratoryRetrievalRequest,
} from "./EvidencePackager.service";
import { buildTelemetryDiagnostics, emptyPack } from "./RetrievalTelemetry.service";
import { validateAllCriticalBanks } from "./BankShapeValidator.service";
import {
  createRetrievalEngineCaches,
  type RetrievalEngineCaches,
} from "./RetrievalEngineCaches.service";
import {
  buildFailedPack,
  buildRuntimeFailurePack,
  buildScopeInvariantFailurePack,
  dedupeReasonCodes,
  resolveRuntimeError,
} from "./RetrievalFailurePolicy.service";
import {
  guardRetrievalMemoryPressure,
  guardUnsafeRetrievalRequest,
} from "./RetrievalGuardPolicy.service";
import {
  prepareRulesAndVariants,
  type RetrievalRuleTelemetryAccumulator,
} from "./RetrievalRulePreparation.service";
import type { RetrievalDocumentIntelligenceBanks } from "./RetrievalEngineFactory";
import {
  loadRetrievalBanks,
} from "./RetrievalPipelineSupport.service";
import {
  captureScopeViolation,
  finalizeRetrievedPack,
} from "./RetrievalResultAssembler.service";

export class RetrievalOrchestratorV2 implements IRetrievalEngine {
  constructor(
    private readonly bankLoader: BankLoader,
    private readonly docStore: DocStore,
    private readonly semanticIndex: SemanticIndex,
    private readonly lexicalIndex: LexicalIndex,
    private readonly structuralIndex: StructuralIndex,
    private readonly queryNormalizer: QueryNormalizer,
    private readonly documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks = getDocumentIntelligenceBanksInstance(),
    private readonly caches: RetrievalEngineCaches = createRetrievalEngineCaches(),
  ) {}

  async resolveScope(
    req: RetrievalRequest,
    signals: RetrievalRequest["signals"],
    semanticCfg: Record<string, any>,
    docsInput?: DocMeta[],
  ) {
    return resolveScope(
      req,
      signals,
      semanticCfg,
      this.docStore,
      docsInput,
    );
  }

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
      const shouldFailClosed =
        isFailClosedMode() &&
        pack.evidence.length === 0 &&
        hasPhaseFailureCode;

      let runtimeStatus = pack.runtimeStatus || "ok";
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
        reasonCodes = dedupeReasonCodes([
          ...reasonCodes,
          "retrieval_v2_degraded",
        ]);
      }
      const runtimeError = resolveRuntimeError(
        runtimeStatus,
        pack.runtimeError,
        reasonCodes,
      );
      return pack.debug
        ? {
            ...pack,
            runtimeStatus,
            runtimeError,
            debug: { ...pack.debug, reasonCodes },
          }
        : { ...pack, runtimeStatus, runtimeError };
    } catch (error: unknown) {
      return buildRuntimeFailurePack(req, error);
    }
  }

  protected async retrieveCore(req: RetrievalRequest): Promise<EvidencePack> {
    const unsafePack = guardUnsafeRetrievalRequest(req);
    if (unsafePack) return unsafePack;
    const memoryPressurePack = guardRetrievalMemoryPressure(req);
    if (memoryPressurePack) return memoryPressurePack;

    const banks = loadRetrievalBanks(
      this.bankLoader,
      this.documentIntelligenceBanks,
    );
    const {
      semanticCfg,
      rankerCfg,
      boostsKeyword,
      boostsTitle,
      boostsType,
      boostsRecency,
      routingPriority,
      diversification,
      negatives,
      packaging,
    } = banks;

    const bankShapeValidation = validateAllCriticalBanks({
      [BANK_IDS.semanticSearchConfig]: semanticCfg,
      [BANK_IDS.retrievalRankerConfig]: rankerCfg,
      [BANK_IDS.retrievalNegatives]: negatives,
      [BANK_IDS.evidencePackaging]: packaging,
      [BANK_IDS.diversificationRules]: diversification,
    });
    if (!bankShapeValidation.allValid) {
      logger.error("[retrieval] Critical bank shape validation failed", {
        failures: bankShapeValidation.failures,
      });
      return buildFailedPack(req, {
        reasonCodes: ["bank_shape_validation_failed", "retrieval_failed"],
        runtimeError: {
          code: "bank_shape_validation_failed",
          message: "Critical retrieval bank validation failed.",
          retryable: false,
          details: { failures: bankShapeValidation.failures },
        },
        note: "Critical retrieval bank validation failed.",
      });
    }

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

    let scope = await resolveScope(req, signals, semanticCfg, this.docStore, allDocs);
    if (scope.hardScopeActive && scope.candidateDocIds.length === 0) {
      const reasonCode = signals.explicitDocRef
        ? "explicit_doc_not_found"
        : "scope_hard_constraints_empty";
      return emptyPack(req, {
        reasonCodes: [reasonCode],
        note: "Hard scope active but no candidate documents resolved.",
      });
    }

    const telemetry: RetrievalRuleTelemetryAccumulator = {
      retrievalRuleEvents: [],
      matchedBoostRuleIds: [],
      appliedBoostRuleIds: [],
      rewriteRuleIds: [],
      selectedSectionRuleId: null,
      crossDocGatedReason: null,
    };
    const prep = prepareRulesAndVariants({
      req,
      queryOriginal,
      queryNormalized,
      signals,
      scope,
      semanticCfg,
      telemetry,
      bankLoader: this.bankLoader,
      documentIntelligenceBanks: this.documentIntelligenceBanks,
      caches: this.caches,
    });

    if (!prep.crossDocDecision.allow) {
      return emptyPack(
        req,
        {
          reasonCodes: [telemetry.crossDocGatedReason || "cross_doc_blocked"],
          note: prep.crossDocDecision.askDisambiguation
            ? "Cross-document retrieval requires explicit disambiguation."
            : "Cross-document retrieval blocked by policy.",
        },
        buildTelemetryDiagnostics({
          ruleEvents: telemetry.retrievalRuleEvents,
          matchedBoostRuleIds: telemetry.matchedBoostRuleIds,
          appliedBoostRuleIds: telemetry.appliedBoostRuleIds,
          rewriteRuleIds: telemetry.rewriteRuleIds,
          selectedSectionRuleId: telemetry.selectedSectionRuleId,
          crossDocGatedReason: telemetry.crossDocGatedReason,
          classification: prep.classification,
        }),
      );
    }
    scope = {
      ...scope,
      candidateDocIds: prep.crossDocDecision.allowedCandidateDocIds,
    };
    if (prep.cachedPack) return prep.cachedPack;

    const {
      classification,
      resolvedDocTypes,
      ruleCtx,
      compareIntentFlag,
      runtimeBoostRules,
      queryVariants,
      additionalStructuralAnchors,
      retrievalCacheKey,
    } = prep;

    const phaseResults = await runPhases({
      queryVariants,
      scopeDocIds: scope.candidateDocIds,
      semanticCfg,
      additionalStructuralAnchors,
      semanticIndex: this.semanticIndex,
      lexicalIndex: this.lexicalIndex,
      structuralIndex: this.structuralIndex,
    });

    let candidates = mergePhaseCandidates(phaseResults, scope, req, this.bankLoader);
    const exploratoryMode = isExploratoryRetrievalRequest({
      compareIntent: compareIntentFlag,
      queryNormalized,
      signals,
      classification,
      resolvedDocTypes,
    });
    candidates = applyNonComparePurityPreRank(candidates, {
      compareIntent: compareIntentFlag,
      classification,
      resolvedDocTypes,
      signals,
      exploratoryMode,
    });

    const scopeMetrics: RetrievalScopeMetrics = {
      scopeCandidatesDropped: 0,
      scopeViolationsDetected: 0,
      scopeViolationsThrown: 0,
    };
    const phaseCounts: RetrievalPhaseCounts = {
      considered: candidates.length,
      afterNegatives: candidates.length,
      afterBoosts: candidates.length,
      afterDiversification: candidates.length,
    };

    candidates = applyRetrievalNegatives(
      candidates,
      req,
      signals,
      scope,
      negatives,
      this.bankLoader,
      RETRIEVAL_CONFIG.isEncryptedOnlyMode,
      scopeMetrics,
    );
    phaseCounts.afterNegatives = candidates.length;
    const negativeScopeViolation = captureScopeViolation(
      candidates.map((c) => c.docId),
      scope,
      signals,
      "post_negatives",
      scopeMetrics,
    );
    if (negativeScopeViolation) {
      return buildScopeInvariantFailurePack(req, negativeScopeViolation);
    }

    candidates = applyBoosts(
      candidates,
      req,
      signals,
      { boostsKeyword, boostsTitle, boostsType, boostsRecency },
      docMetaById,
    );
    const documentIntelligenceBoostCtx: RuleMatchContext = {
      ...ruleCtx,
      maxMatchedBoostRules: 3,
      maxDocumentIntelligenceBoost: 0.45,
    };
    const boostDeltaSummaries = summarizeBoostRuleApplications(
      documentIntelligenceBoostCtx,
      candidates,
      runtimeBoostRules,
    );
    for (const summary of boostDeltaSummaries) {
      telemetry.appliedBoostRuleIds.push(summary.ruleId);
      telemetry.retrievalRuleEvents.push({
        event: "retrieval.boost_rule_applied",
        payload: {
          ruleId: summary.ruleId,
          scoreDeltaSummary: {
            candidateHits: summary.candidateHits,
            totalDelta: summary.totalDelta,
            averageDelta: summary.averageDelta,
            maxDelta: summary.maxDelta,
          },
        },
      });
    }
    candidates = applyBoostScoring(
      documentIntelligenceBoostCtx,
      candidates,
      runtimeBoostRules,
    ) as CandidateChunk[];
    candidates = applyRetrievalPlanHints(candidates, req.retrievalPlan);
    phaseCounts.afterBoosts = candidates.length;

    candidates = rankCandidates(
      candidates,
      req,
      signals,
      rankerCfg,
      routingPriority || undefined,
      RETRIEVAL_CONFIG.isEncryptedOnlyMode,
    );
    if (!req.overrides?.disableDiversification) {
      candidates = applyDiversification(candidates, req, signals, diversification);
    }
    phaseCounts.afterDiversification = candidates.length;
    const diversificationScopeViolation = captureScopeViolation(
      candidates.map((c) => c.docId),
      scope,
      signals,
      "post_diversification",
      scopeMetrics,
    );
    if (diversificationScopeViolation) {
      return buildScopeInvariantFailurePack(req, diversificationScopeViolation);
    }

    const pack = packageEvidence(candidates, req, signals, packaging, {
      queryOriginal,
      queryNormalized,
      expandedQueries: queryVariants
        .map((variant) => variant.text)
        .filter((text) => text !== queryNormalized),
      scope,
      compareIntent: compareIntentFlag,
      exploratoryMode,
      classification,
      resolvedDocTypes,
      phaseCounts,
      scopeMetrics,
      bankLoader: this.bankLoader,
      documentIntelligenceBanks: this.documentIntelligenceBanks,
      isEncryptedOnlyMode: RETRIEVAL_CONFIG.isEncryptedOnlyMode,
    });
    return finalizeRetrievedPack({
      req,
      pack,
      phaseResults,
      telemetry,
      classification,
      scope,
      signals,
      scopeMetrics,
      caches: this.caches,
      retrievalCacheKey:
        RETRIEVAL_CONFIG.multiLevelCacheEnabled && retrievalCacheKey
          ? retrievalCacheKey
          : null,
    });
  }
}

export { RetrievalOrchestratorV2 as RetrievalEngineService };
