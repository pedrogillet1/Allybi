// ── Retrieval engine — public API ────────────────────────────────────
// Consumers should use IRetrievalEngine + createRetrievalEngine only.
// Direct engine class imports are deprecated.

export type { IRetrievalEngine } from "../../../services/core/retrieval/retrieval.types";
export { createRetrievalEngine } from "../../../services/core/retrieval/v2/RetrievalEngineFactory";
export type { RetrievalEngineDeps } from "../../../services/core/retrieval/v2/RetrievalEngineFactory";

// Retrieval engine — types (shared)
export type {
  RetrievalRequest,
  RetrievalOverrides,
  DocMeta,
  ChunkLocation,
  CandidateChunk,
  EvidenceItem,
  EvidencePack,
  BankLoader,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  DocStore,
  QueryNormalizer,
  RetrievalScopeViolationDetails,
} from "../../../services/core/retrieval/retrieval.types";
export {
  RetrievalScopeViolationError,
} from "../../../services/core/retrieval/retrieval.types";

// ── Deprecated: direct engine class exports ─────────────────────────
// These remain for backwards compatibility with existing test files.
// New code should use createRetrievalEngine() instead.
/** @deprecated Use createRetrievalEngine() */
export {
  RetrievalEngineService,
} from "../../../services/core/retrieval/retrievalEngine.legacy.service";
/** @deprecated Use createRetrievalEngine() */
export {
  RetrievalOrchestratorV2,
} from "../../../services/core/retrieval/v2/RetrievalOrchestrator.service";

// Doc scope lock
export {
  buildAttachmentDocScopeLock,
  createDocScopeLock,
} from "../../../services/core/retrieval/docScopeLock";

// Prisma retrieval adapters
export type { PrismaRetrievalEngineDependencies } from "../../../services/core/retrieval/prismaRetrievalAdapters.service";
export { PrismaRetrievalAdapterFactory } from "../../../services/core/retrieval/prismaRetrievalAdapters.service";

// Evidence gate — evaluates evidence sufficiency
export type { EvidenceCheckResult } from "../../../services/core/retrieval/evidenceGate.service";
export {
  EvidenceGateService,
  getEvidenceGate,
} from "../../../services/core/retrieval/evidenceGate.service";

// Source buttons — UI-layer source attribution
export type {
  SourceButton,
  SourceButtonsAttachment,
  FileListAttachment,
  MessageAttachment,
  RawSource,
  StandardResponse,
} from "../../../services/core/retrieval/sourceButtons.service";
export {
  SourceButtonsService,
  getSourceButtonsService,
  filterSourceButtonsByUsage,
  buildDocGroundedResponse,
  buildFileActionResponse,
  buildFileListResponse,
  buildNoEvidenceResponse,
} from "../../../services/core/retrieval/sourceButtons.service";

// Slot resolver — entity-role slot matching
export type {
  SlotContract,
  SlotResolutionResult,
} from "../../../services/core/retrieval/slotResolver.service";
export { resolveSlot } from "../../../services/core/retrieval/slotResolver.service";

// Scope gate — document scope resolution
export type {
  ConversationStateLike,
  ScopeGateInput,
  ScopeCandidate,
  ScopeDecision,
} from "../../../services/core/scope/scopeGate.service";
export { ScopeGateService } from "../../../services/core/scope/scopeGate.service";
