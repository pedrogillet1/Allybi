// Edit handler — top-level entry point for edit requests
export type {
  EditHandlerRequest,
  EditHandlerResponse,
} from '../../../services/core/handlers/editHandler.service';
export { EditHandlerService } from '../../../services/core/handlers/editHandler.service';

// Editing facade, orchestrator, and supporting services
export {
  EditOrchestratorService,
  EditTelemetryService,
  TargetResolverService,
  EditingFacadeService,
  ApplyVerificationService,
  BankIntegrityService,
  EditingPolicyService,
  AllybiEditing,
} from '../../../services/editing';

export type {
  DocxParagraphNode,
  EditAction,
  EditApplyRequest,
  EditApplyResult,
  EditConstraintSet,
  EditDiffPayload,
  EditDomain,
  EditExecutionContext,
  EditOperator,
  EditOutcomeType,
  EditPolicy,
  EditPlan,
  EditPlanDiagnostics,
  EditPlanRequest,
  EditPlanResult,
  EditPreviewRequest,
  EditPreviewResult,
  EditRationale,
  EditReceipt,
  EditBlockedReason,
  EditSupportGateId,
  EditIntentSource,
  EditRevisionStore,
  EditTelemetry,
  EditDiffChange,
  ResolvedTarget,
  ResolvedTargetCandidate,
  SheetsTargetNode,
  SlidesTargetNode,
  UndoRequest,
  UndoResult,
} from '../../../services/editing';

// Intent runtime — pattern-matching pipeline for edit instructions
export { analyzeMessageToPlan } from '../../../services/editing/intentRuntime';
