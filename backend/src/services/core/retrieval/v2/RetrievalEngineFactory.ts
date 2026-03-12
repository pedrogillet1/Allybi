/**
 * RetrievalEngineFactory — single entry point for constructing the active
 * retrieval engine.  Reads `RETRIEVAL_USE_V2_ORCHESTRATOR` to pick V1 or V2,
 * wraps V2 construction in a try/catch so a build error falls back to V1.
 *
 * Consumers import only `IRetrievalEngine` and `createRetrievalEngine`.
 */

import { logger } from "../../../../utils/logger";
import type {
  IRetrievalEngine,
  BankLoader,
  DocStore,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  QueryNormalizer,
} from "../retrieval.types";
import type { DocumentIntelligenceBanksService } from "../../banks/documentIntelligenceBanks.service";
import { getDocumentIntelligenceBanksInstance } from "../../banks/documentIntelligenceBanks.service";
import { RetrievalEngineService } from "../retrievalEngine.legacy.service";
import { RetrievalOrchestratorV2 } from "./RetrievalOrchestrator.service";
import { FallbackRetrievalEngine } from "./FallbackRetrievalEngine";

// ── Dependency bundle ────────────────────────────────────────────────

export interface RetrievalEngineDeps {
  bankLoader: BankLoader;
  docStore: DocStore;
  semanticIndex: SemanticIndex;
  lexicalIndex: LexicalIndex;
  structuralIndex: StructuralIndex;
  queryNormalizer?: QueryNormalizer;
  documentIntelligenceBanks?: Pick<
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
    >;
}

// ── Factory ──────────────────────────────────────────────────────────

const V2_FLAGS = new Set(["1", "true", "yes", "on"]);

/**
 * Create the active retrieval engine based on the `RETRIEVAL_USE_V2_ORCHESTRATOR`
 * environment variable.  If V2 construction fails, falls back to V1 with an
 * error log.
 */
export function createRetrievalEngine(deps: RetrievalEngineDeps): IRetrievalEngine {
  const diBanks = deps.documentIntelligenceBanks ?? getDocumentIntelligenceBanksInstance();
  const useV2 = V2_FLAGS.has(
    String(process.env.RETRIEVAL_USE_V2_ORCHESTRATOR || "").trim().toLowerCase(),
  );

  const v1Engine = new RetrievalEngineService(
    deps.bankLoader,
    deps.docStore,
    deps.semanticIndex,
    deps.lexicalIndex,
    deps.structuralIndex,
    deps.queryNormalizer,
    diBanks,
  );

  if (useV2) {
    try {
      const v2Engine = new RetrievalOrchestratorV2(
        deps.bankLoader,
        deps.docStore,
        deps.semanticIndex,
        deps.lexicalIndex,
        deps.structuralIndex,
        deps.queryNormalizer,
        diBanks,
      );
      logger.info("[retrieval] Using V2 orchestrator with V1 fallback");
      return new FallbackRetrievalEngine(v2Engine, v1Engine);
    } catch (err) {
      logger.error("[retrieval] V2 orchestrator instantiation failed, falling back to V1", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return v1Engine;
}
