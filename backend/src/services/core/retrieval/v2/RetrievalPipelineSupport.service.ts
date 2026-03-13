import type {
  BankLoader,
  EvidencePack,
} from "../retrieval.types";
import { safeGetBank } from "../retrievalEngine.utils";
import { BANK_IDS } from "./retrieval.config";
import type { RetrievalDocumentIntelligenceBanks } from "./RetrievalEngineFactory";

export function loadRetrievalBanks(
  bankLoader: BankLoader,
  documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks,
) {
  return {
    semanticCfg: bankLoader.getBank<any>(BANK_IDS.semanticSearchConfig),
    rankerCfg: bankLoader.getBank<any>(BANK_IDS.retrievalRankerConfig),
    boostsKeyword: safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.keywordBoostRules,
    ),
    boostsTitle: safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.docTitleBoostRules,
    ),
    boostsType: safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.docTypeBoostRules,
    ),
    boostsRecency: safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.recencyBoostRules,
    ),
    routingPriority: safeGetBank<Record<string, any>>(
      bankLoader,
      BANK_IDS.routingPriority,
    ),
    diversification: bankLoader.getBank<any>(BANK_IDS.diversificationRules),
    negatives: bankLoader.getBank<any>(BANK_IDS.retrievalNegatives),
    packaging: bankLoader.getBank<any>(BANK_IDS.evidencePackaging),
    crossDocGrounding: documentIntelligenceBanks.getCrossDocGroundingPolicy(),
  };
}

export function applyPhaseFailureDiagnostics(
  pack: EvidencePack,
  phaseResults: Array<{
    phaseId: string;
    status: string;
    hits: Array<unknown>;
    note?: string;
    failureCode?: string | null;
  }>,
): void {
  const phaseFailureReasonCodes = Array.from(
    new Set(
      phaseResults
        .map((phase) => phase.failureCode)
        .filter((code): code is string => Boolean(code)),
    ),
  );
  const phaseFailureNotes = phaseResults
    .filter((phase) => phase.status !== "ok")
    .map((phase) => ({
      phaseId: phase.phaseId,
      candidates: phase.hits.length,
      note: phase.note,
    }));
  if (phaseFailureReasonCodes.length === 0 && phaseFailureNotes.length === 0) {
    return;
  }
  if (!pack.debug) {
    pack.debug = { phases: [], reasonCodes: [] };
  }
  for (const reasonCode of phaseFailureReasonCodes) {
    if (!pack.debug.reasonCodes.includes(reasonCode)) {
      pack.debug.reasonCodes.push(reasonCode);
    }
  }
  const seenPhaseIds = new Set(pack.debug.phases.map((phase) => phase.phaseId));
  for (const phase of phaseFailureNotes) {
    if (seenPhaseIds.has(phase.phaseId)) continue;
    pack.debug.phases.push(phase);
    seenPhaseIds.add(phase.phaseId);
  }
}
