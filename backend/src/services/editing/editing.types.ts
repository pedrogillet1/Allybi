import type { LanguageCode } from "../../types/common.types";

export type EditOperator =
  | "EDIT_PARAGRAPH"
  | "EDIT_SPAN"
  | "EDIT_DOCX_BUNDLE"
  | "ADD_PARAGRAPH"
  | "EDIT_CELL"
  | "EDIT_RANGE"
  | "ADD_SHEET"
  | "RENAME_SHEET"
  | "DELETE_SHEET"
  | "CREATE_CHART"
  | "COMPUTE"
  | "COMPUTE_BUNDLE"
  | "ADD_SLIDE"
  | "REWRITE_SLIDE_TEXT"
  | "REPLACE_SLIDE_IMAGE";

export type EditDomain = "docx" | "sheets" | "slides";

export interface EditExecutionContext {
  userId: string;
  conversationId: string;
  correlationId: string;
  clientMessageId: string;
  language?: LanguageCode;
}

export interface EditConstraintSet {
  preserveNumbers: boolean;
  preserveEntities: boolean;
  strictNoNewFacts: boolean;
  tone: "neutral" | "formal" | "casual";
  outputLanguage: LanguageCode;
  maxExpansionRatio: number;
}

export interface EditPlanRequest {
  instruction: string;
  operator: EditOperator;
  domain: EditDomain;
  documentId: string;
  targetHint?: string;
  requiredEntities?: string[];
  preserveTokens?: string[];
}

export interface EditPlanDiagnostics {
  extractedEntities: string[];
  extractedHints: string[];
  checks: Array<{ id: string; pass: boolean; detail?: string }>;
}

export interface EditPlan {
  operator: EditOperator;
  domain: EditDomain;
  documentId: string;
  targetHint?: string;
  normalizedInstruction: string;
  constraints: EditConstraintSet;
  missingRequiredEntities: string[];
  preserveTokens: string[];
  diagnostics: EditPlanDiagnostics;
}

export interface EditPlanResult {
  ok: boolean;
  plan?: EditPlan;
  missingRequiredEntities?: string[];
  error?: string;
}

export interface ResolvedTargetCandidate {
  id: string;
  label: string;
  confidence: number;
  reasons: string[];
}

export interface ResolvedTarget {
  id: string;
  label: string;
  confidence: number;
  candidates: ResolvedTargetCandidate[];
  decisionMargin: number;
  isAmbiguous: boolean;
  resolutionReason: string;
}

export interface DocxParagraphNode {
  paragraphId: string;
  text: string;
  sectionPath?: string[];
  styleFingerprint?: string;
  /** Stable document-order index (0-based) when available. */
  docIndex?: number;
}

export interface SheetsTargetNode {
  targetId: string;
  a1: string;
  sheetName: string;
  text: string;
  header?: string;
}

export interface SlidesTargetNode {
  objectId: string;
  slideNumber: number;
  label: string;
  text: string;
}

export interface EditDiffChange {
  before: string;
  after: string;
  type: "replace" | "add" | "remove";
}

export interface EditDiffPayload {
  kind: "paragraph" | "cell" | "slide" | "structural";
  before: string;
  after: string;
  changed: boolean;
  summary: string;
  changes: EditDiffChange[];
}

export interface EditRationale {
  reasons: string[];
  preserved: string[];
  styleMatched: string;
  riskLevel: "LOW" | "MED" | "HIGH";
  guardrails: string[];
}

export type EditActionKind =
  | "confirm"
  | "cancel"
  | "pick_target"
  | "undo"
  | "open_doc"
  | "go_to_location"
  | "export";

export interface EditAction {
  kind: EditActionKind;
  label: string;
  payload?: Record<string, unknown>;
}

export interface EditReceipt {
  stage: "preview" | "applied" | "blocked" | "noop";
  actions: EditAction[];
  note?: string;
}

export interface EditPreviewRequest {
  plan: EditPlan;
  target: ResolvedTarget;
  beforeText: string;
  proposedText: string;
  preserveTokens?: string[];
}

export interface EditPreviewResult {
  ok: boolean;
  target?: ResolvedTarget;
  diff?: EditDiffPayload;
  rationale?: EditRationale;
  receipt?: EditReceipt;
  requiresConfirmation?: boolean;
  similarityScore?: number;
  error?: string;
}

export interface EditApplyRequest {
  plan: EditPlan;
  target: ResolvedTarget;
  beforeText: string;
  proposedText: string;
  /**
   * Client-provided idempotency key. Reusing the same key with the same
   * payload must not create duplicate revisions.
   */
  idempotencyKey?: string;
  /**
   * Optimistic lock guardrails from the planning step.
   * If provided and the backing document changed, apply must be blocked.
   */
  expectedDocumentUpdatedAtIso?: string;
  expectedDocumentFileHash?: string;
  /**
   * Optional rich-text payload used for DOCX paragraph edits.
   * When provided, `proposedText` is still used for diff/similarity, but the
   * revision store may apply the richer representation to the underlying file.
   */
  proposedHtml?: string;
  userConfirmed: boolean;
}

export interface EditApplyResult {
  ok: boolean;
  applied: boolean;
  revisionId?: string;
  baseRevisionId?: string;
  newRevisionId?: string;
  changeset?: {
    kind: "paragraph" | "cell" | "slide" | "structural" | "bundle";
    changed: boolean;
    summary: string;
    changeCount: number;
    sampleBefore?: string;
    sampleAfter?: string;
    targets?: string[];
  };
  proof?: {
    verified: boolean;
    fileHashBefore: string;
    fileHashAfter: string;
    affectedTargetsCount: number;
    changedCellsCount?: number;
    changedStructuresCount?: number;
    affectedRanges?: string[];
    affectedParagraphIds?: string[];
    warnings?: string[];
    rejectedOps?: string[];
  };
  preview?: EditPreviewResult;
  receipt?: EditReceipt;
  error?: string;
}

export interface UndoRequest {
  documentId: string;
  revisionId?: string;
}

export interface UndoResult {
  ok: boolean;
  restoredRevisionId?: string;
  receipt?: EditReceipt;
  error?: string;
}

export interface EditPolicy {
  minConfidenceForAutoApply: number;
  minDecisionMarginForAutoApply: number;
  minSimilarityForAutoApply: number;
  alwaysRequireConfirmation: EditOperator[];
}

export interface EditTelemetry {
  track(
    event: "edit_planned" | "edit_previewed" | "edit_applied" | "edit_failed",
    payload: Record<string, unknown>,
  ): Promise<void>;
}

export interface EditRevisionStore {
  createRevision(input: {
    documentId: string;
    userId: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
    content: string;
    idempotencyKey?: string;
    expectedDocumentUpdatedAtIso?: string;
    expectedDocumentFileHash?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    revisionId: string;
    fileHashBefore?: string;
    fileHashAfter?: string;
    applyMetrics?: {
      changedCellsCount?: number;
      changedStructuresCount?: number;
      affectedRanges?: string[];
      locateRange?: string | null;
      changedSamples?: Array<{ sheetName: string; cell: string; before: string; after: string }>;
      rejectedOps?: string[];
    };
  }>;
  undoToRevision(input: {
    documentId: string;
    userId: string;
    revisionId?: string;
  }): Promise<{ restoredRevisionId: string }>;
}
