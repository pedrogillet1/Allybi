/**
 * RetrievalEngineFactory — single entry point for constructing the active
 * retrieval engine. V2 is the only supported runtime.
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
import {
  createRetrievalEngineCaches,
  type RetrievalEngineCaches,
} from "./RetrievalEngineCaches.service";
import { RetrievalOrchestratorV2 } from "./RetrievalOrchestrator.service";

// ── Dependency bundle ────────────────────────────────────────────────

export type RetrievalDocumentIntelligenceBanks = Pick<
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
  Partial<Pick<DocumentIntelligenceBanksService, "getDocTypeExtractionHints">>;

export interface RetrievalEngineDeps {
  bankLoader: BankLoader;
  docStore: DocStore;
  semanticIndex: SemanticIndex;
  lexicalIndex: LexicalIndex;
  structuralIndex: StructuralIndex;
  queryNormalizer: QueryNormalizer;
  documentIntelligenceBanks: RetrievalDocumentIntelligenceBanks;
  caches?: RetrievalEngineCaches;
}

// ── Factory ──────────────────────────────────────────────────────────

export type ActiveRetrievalEngineMode = "v2";

const ACTIVE_RETRIEVAL_ENGINE_MODE: ActiveRetrievalEngineMode = "v2";

export function getActiveRetrievalEngineMode(): ActiveRetrievalEngineMode {
  return ACTIVE_RETRIEVAL_ENGINE_MODE;
}

export interface RetrievalEngineDescriptor {
  activeEngineMode: ActiveRetrievalEngineMode;
  engineId: "retrieval_orchestrator_v2";
  engineClass: "RetrievalOrchestratorV2";
}

export const ACTIVE_RETRIEVAL_ENGINE_DESCRIPTOR: RetrievalEngineDescriptor = {
  activeEngineMode: ACTIVE_RETRIEVAL_ENGINE_MODE,
  engineId: "retrieval_orchestrator_v2",
  engineClass: "RetrievalOrchestratorV2",
};

export function getActiveRetrievalEngineDescriptor(): RetrievalEngineDescriptor {
  return ACTIVE_RETRIEVAL_ENGINE_DESCRIPTOR;
}

export function validateRetrievalEngineDeps(
  deps: RetrievalEngineDeps,
): void {
  if (!deps.bankLoader?.getBank) {
    throw new Error("retrieval_engine_bank_loader_required");
  }
  if (!deps.docStore?.listDocs || !deps.docStore?.getDocMeta) {
    throw new Error("retrieval_engine_doc_store_required");
  }
  if (!deps.semanticIndex?.search) {
    throw new Error("retrieval_engine_semantic_index_required");
  }
  if (!deps.lexicalIndex?.search) {
    throw new Error("retrieval_engine_lexical_index_required");
  }
  if (!deps.structuralIndex?.search) {
    throw new Error("retrieval_engine_structural_index_required");
  }
  if (!deps.queryNormalizer?.normalize) {
    throw new Error("retrieval_engine_query_normalizer_required");
  }
  if (
    !deps.documentIntelligenceBanks?.getCrossDocGroundingPolicy ||
    !deps.documentIntelligenceBanks?.getDocumentIntelligenceDomains ||
    !deps.documentIntelligenceBanks?.getDocTypeCatalog ||
    !deps.documentIntelligenceBanks?.getDomainDetectionRules
  ) {
    throw new Error("retrieval_engine_document_intelligence_banks_required");
  }
}

/**
 * Create the active retrieval engine using the sole supported V2 orchestrator.
 */
export function createRetrievalEngine(deps: RetrievalEngineDeps): IRetrievalEngine {
  validateRetrievalEngineDeps(deps);
  logger.info("[retrieval] Using V2 orchestrator", {
    ...ACTIVE_RETRIEVAL_ENGINE_DESCRIPTOR,
  });
  return new RetrievalOrchestratorV2(
    deps.bankLoader,
    deps.docStore,
    deps.semanticIndex,
    deps.lexicalIndex,
    deps.structuralIndex,
    deps.queryNormalizer,
    deps.documentIntelligenceBanks,
    deps.caches ?? createRetrievalEngineCaches(),
  );
}
