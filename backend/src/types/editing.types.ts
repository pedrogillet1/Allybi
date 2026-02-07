export type EditIntent = 'EDITING';

export type EditDomain = 'docx' | 'sheets' | 'slides';

export type EditScope = 'workspace' | 'documents';

export type EditOperator =
  | 'EDIT_PARAGRAPH'
  | 'EDIT_CELL'
  | 'EDIT_RANGE'
  | 'ADD_SHEET'
  | 'RENAME_SHEET'
  | 'CREATE_CHART'
  | 'ADD_SLIDE'
  | 'REWRITE_SLIDE_TEXT'
  | 'REPLACE_IMAGE'
  | 'DELETE_ROW'
  | 'DELETE_COLUMN'
  | 'DELETE_SHEET'
  | 'DELETE_SLIDE'
  | 'MOVE_COLUMN';

export type EditPlanType =
  | 'EDIT_PARAGRAPH'
  | 'EDIT_CELL'
  | 'EDIT_RANGE'
  | 'ADD_SHEET'
  | 'CREATE_CHART'
  | 'ADD_SLIDE'
  | 'REWRITE_SLIDE_TEXT'
  | 'REPLACE_IMAGE'
  | 'DELETE_ROW'
  | 'DELETE_COLUMN'
  | 'DELETE_SHEET'
  | 'DELETE_SLIDE'
  | 'MOVE_COLUMN';

export type EditRiskLevel = 'LOW' | 'MED' | 'HIGH';

export type EditActionPillType =
  | 'confirm'
  | 'cancel'
  | 'pick_target'
  | 'undo'
  | 'open_doc'
  | 'go_to_location'
  | 'export';

export interface EditRequestContext {
  correlationId: string;
  userId: string;
  conversationId: string;
  clientMessageId: string;
  requestId?: string;
}

export interface EditRoutingDecision {
  intent: EditIntent;
  operator: EditOperator;
  domain: EditDomain;
  scope: EditScope;
  confidence: number;
  reasonCodes: string[];
  databanksUsed: string[];
}

export interface EditConstraintExtraction {
  preserveNumbers: boolean;
  preserveEntities: boolean;
  styleTarget?: 'formal' | 'casual' | 'professional' | 'neutral';
  language?: 'en' | 'pt';
  strictMode?: boolean;
  preserveTokens?: string[];
}

export interface MissingEntity {
  key: string;
  description: string;
  required: boolean;
}

export interface EditPlanBase {
  planId: string;
  type: EditPlanType;
  domain: EditDomain;
  operator: EditOperator;
  targetRef?: string;
  constraints: EditConstraintExtraction;
  missingEntities: MissingEntity[];
  userInstruction: string;
}

export interface EditParagraphPlan extends EditPlanBase {
  type: 'EDIT_PARAGRAPH';
  domain: 'docx';
  targetRef: string;
  payload: {
    paragraphId: string;
    proposedText: string;
  };
}

export interface EditCellPlan extends EditPlanBase {
  type: 'EDIT_CELL';
  domain: 'sheets';
  targetRef: string;
  payload: {
    sheetName: string;
    a1: string;
    value: string;
  };
}

export interface EditRangePlan extends EditPlanBase {
  type: 'EDIT_RANGE';
  domain: 'sheets';
  targetRef: string;
  payload: {
    rangeA1: string;
    values: string[][];
  };
}

export interface AddSheetPlan extends EditPlanBase {
  type: 'ADD_SHEET';
  domain: 'sheets';
  payload: {
    title: string;
  };
}

export interface CreateChartPlan extends EditPlanBase {
  type: 'CREATE_CHART';
  domain: 'sheets';
  payload: {
    chartType: 'BAR' | 'LINE' | 'PIE' | 'AREA' | 'SCATTER';
    rangeA1: string;
    title?: string;
  };
}

export interface AddSlidePlan extends EditPlanBase {
  type: 'ADD_SLIDE';
  domain: 'slides';
  payload: {
    layout: string;
    insertionIndex?: number;
    title?: string;
    body?: string[];
  };
}

export interface RewriteSlideTextPlan extends EditPlanBase {
  type: 'REWRITE_SLIDE_TEXT';
  domain: 'slides';
  targetRef: string;
  payload: {
    objectId: string;
    proposedText: string;
  };
}

export interface ReplaceImagePlan extends EditPlanBase {
  type: 'REPLACE_IMAGE';
  domain: 'slides';
  targetRef: string;
  payload: {
    imageObjectId: string;
    imageUrl: string;
    altText?: string;
  };
}

export type EditPlan =
  | EditParagraphPlan
  | EditCellPlan
  | EditRangePlan
  | AddSheetPlan
  | CreateChartPlan
  | AddSlidePlan
  | RewriteSlideTextPlan
  | ReplaceImagePlan
  | EditPlanBase;

export interface TargetCandidate {
  id: string;
  label: string;
  score: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface EditTargetResolution {
  target?: TargetCandidate;
  confidence: number;
  candidates: TargetCandidate[];
  decisionMargin: number;
  ambiguous: boolean;
  reasonCodes: string[];
}

export interface DiffSegment {
  type: 'unchanged' | 'inserted' | 'deleted' | 'replaced';
  before?: string;
  after?: string;
}

export interface EditDiff {
  kind: 'paragraph' | 'cell' | 'slide_text' | 'structural';
  summary: string;
  segments: DiffSegment[];
  before?: string;
  after?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface EditRationale {
  reasons: string[];
  preserved: string[];
  styleMatched?: string;
  riskLevel: EditRiskLevel;
}

export interface EditProof {
  sourceType: 'target_excerpt' | 'retrieval_chunk' | 'policy_check' | 'validator';
  label: string;
  value: string;
}

export interface EditActionPill {
  type: EditActionPillType;
  label: string;
  payload?: Record<string, string | number | boolean>;
}

export interface EditPreviewBlock {
  target: {
    label: string;
    confidence: number;
    candidates?: TargetCandidate[];
  };
  diff: EditDiff;
  why: EditRationale;
  proof: EditProof[];
  actions: EditActionPill[];
}

export interface EditPlanResult {
  plan: EditPlan;
  resolution: EditTargetResolution;
  requiresConfirmation: boolean;
  blocked: boolean;
  reasonCodes: string[];
}

export interface EditPreviewResult {
  planId: string;
  previewId: string;
  blocks: EditPreviewBlock;
  requiresConfirmation: boolean;
  reasonCodes: string[];
}

export interface EditApprovalPayload {
  planId: string;
  previewId: string;
  confirmed: boolean;
  selectedTargetId?: string;
}

export interface EditRevisionRef {
  documentId: string;
  revisionId: string;
  previousRevisionId?: string;
}

export interface EditApplyResult {
  applied: boolean;
  revision?: EditRevisionRef;
  receiptActions: EditActionPill[];
  reasonCodes: string[];
}

export interface EditUndoPayload {
  documentId: string;
  revisionId: string;
}

export interface UndoResult {
  reverted: boolean;
  newRevision?: EditRevisionRef;
  reasonCodes: string[];
}

export interface EditingPolicyThresholds {
  minTargetConfidence: number;
  minDecisionMargin: number;
  minSimilarityForStyleOnlyEdits: number;
  minSemanticSimilarity: number;
}
