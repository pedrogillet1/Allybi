// Retrieval engine — core orchestrator for RAG pipeline
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
} from '../../../services/core/retrieval/retrievalEngine.service';
export { RetrievalEngineService } from '../../../services/core/retrieval/retrievalEngine.service';

// Evidence gate — evaluates evidence sufficiency
export type { EvidenceCheckResult } from '../../../services/core/retrieval/evidenceGate.service';
export { EvidenceGateService, getEvidenceGate } from '../../../services/core/retrieval/evidenceGate.service';

// Source buttons — UI-layer source attribution
export type {
  SourceButton,
  SourceButtonsAttachment,
  FileListAttachment,
  MessageAttachment,
  RawSource,
  EvidenceChunkForFiltering,
  StandardResponse,
} from '../../../services/core/retrieval/sourceButtons.service';
export {
  SourceButtonsService,
  getSourceButtonsService,
  extractUsedDocuments,
  filterSourceButtonsByUsage,
  buildDocGroundedResponse,
  buildFileActionResponse,
  buildFileListResponse,
  buildNoEvidenceResponse,
} from '../../../services/core/retrieval/sourceButtons.service';

// Slot resolver — entity-role slot matching
export type { SlotContract, SlotResolutionResult } from '../../../services/core/retrieval/slotResolver.service';
export { resolveSlot } from '../../../services/core/retrieval/slotResolver.service';

// Scope gate — document scope resolution
export type {
  ConversationStateLike,
  ScopeGateInput,
  ScopeCandidate,
  ScopeDecision,
} from '../../../services/core/scope/scopeGate.service';
export { ScopeGateService } from '../../../services/core/scope/scopeGate.service';

// Discourse signals — query discourse analysis
export type { DiscourseSignals } from '../../../services/core/scope/discourseSignal.service';
export { analyzeDiscourseSignals } from '../../../services/core/scope/discourseSignal.service';
