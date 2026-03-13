import { RetrievalScopeViolationError } from "../retrieval.types";
import type {
  DocumentClassificationResult,
  EvidencePack,
  RetrievalRequest,
  RetrievalRuleTelemetryEvent,
  RetrievalScopeMetrics,
} from "../retrieval.types";
import { cloneEvidencePack } from "./RetrievalCache.service";
import type { RetrievalEngineCaches } from "./RetrievalEngineCaches.service";
import { buildScopeInvariantFailurePack } from "./RetrievalFailurePolicy.service";
import {
  buildTelemetryDiagnostics,
} from "./RetrievalTelemetry.service";
import { enforceScopeInvariant } from "./ScopeResolver.service";
import { isProductionEnv } from "../retrievalEngine.utils";
import { applyPhaseFailureDiagnostics } from "./RetrievalPipelineSupport.service";

export function captureScopeViolation(
  docIds: string[],
  scope: { candidateDocIds: string[]; hardScopeActive: boolean },
  signals: RetrievalRequest["signals"],
  stage: "post_negatives" | "post_diversification" | "post_packaging",
  scopeMetrics: RetrievalScopeMetrics,
): RetrievalScopeViolationError | null {
  try {
    enforceScopeInvariant(docIds, scope, signals, stage, scopeMetrics);
    return null;
  } catch (error: unknown) {
    if (error instanceof RetrievalScopeViolationError) return error;
    throw error;
  }
}

export function finalizeRetrievedPack(params: {
  req: RetrievalRequest;
  pack: EvidencePack;
  phaseResults: Awaited<ReturnType<typeof import("./PhaseRunner.service").runPhases>>;
  telemetry: {
    retrievalRuleEvents: RetrievalRuleTelemetryEvent[];
    matchedBoostRuleIds: string[];
    appliedBoostRuleIds: string[];
    rewriteRuleIds: string[];
    selectedSectionRuleId: string | null;
    crossDocGatedReason: string | null;
  };
  classification: DocumentClassificationResult;
  scope: { candidateDocIds: string[]; hardScopeActive: boolean };
  signals: RetrievalRequest["signals"];
  scopeMetrics: RetrievalScopeMetrics;
  caches: RetrievalEngineCaches;
  retrievalCacheKey: string | null;
}): EvidencePack {
  const {
    req,
    pack,
    phaseResults,
    telemetry,
    classification,
    scope,
    signals,
    scopeMetrics,
    caches,
    retrievalCacheKey,
  } = params;

  pack.telemetry = buildTelemetryDiagnostics({
    ruleEvents: telemetry.retrievalRuleEvents,
    matchedBoostRuleIds: telemetry.matchedBoostRuleIds,
    appliedBoostRuleIds: telemetry.appliedBoostRuleIds,
    rewriteRuleIds: telemetry.rewriteRuleIds,
    selectedSectionRuleId: telemetry.selectedSectionRuleId,
    crossDocGatedReason: telemetry.crossDocGatedReason,
    classification,
  });
  applyPhaseFailureDiagnostics(pack, phaseResults);

  const packagingScopeViolation = captureScopeViolation(
    pack.evidence.map((evidence) => evidence.docId),
    scope,
    signals,
    "post_packaging",
    scopeMetrics,
  );
  if (packagingScopeViolation) {
    return buildScopeInvariantFailurePack(req, packagingScopeViolation);
  }

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
  if (isProductionEnv(req.env)) {
    delete pack.debug;
  }
  if (retrievalCacheKey) {
    caches.retrievalResultCache.set(retrievalCacheKey, cloneEvidencePack(pack));
  }
  return pack;
}
