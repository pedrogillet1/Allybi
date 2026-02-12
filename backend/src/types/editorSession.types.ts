import type { EditDomain, EditOperator, ResolvedTarget } from '../services/editing/editing.types';
import type { EditPlanRequest, EditPreviewResult, EditApplyResult, EditReceipt } from '../services/editing';

export type EditorSessionStatus =
  | 'idle'
  | 'planning'
  | 'awaiting_confirmation'
  | 'applying'
  | 'applied'
  | 'cancelled'
  | 'error'
  | 'expired';

export interface EditorSessionContext {
  userId: string;
  conversationId: string;
  correlationId: string;
  clientMessageId: string;
  language?: 'en' | 'pt' | 'es';
}

export interface EditorSessionStartRequest {
  documentId: string;
  instruction: string;
  operator: EditOperator;
  domain: EditDomain;

  beforeText: string;
  proposedText: string;

  targetHint?: string;
  preserveTokens?: string[];

  // Optional: if client already resolved a target.
  target?: ResolvedTarget;

  // Optional candidates to allow server-side target resolution.
  docxCandidates?: Array<{ paragraphId: string; text: string; sectionPath?: string[]; styleFingerprint?: string }>;
  sheetsCandidates?: Array<{ targetId: string; a1: string; sheetName: string; text: string; header?: string }>;
  slidesCandidates?: Array<{ objectId: string; slideNumber: number; label: string; text: string }>;
}

export interface EditorSessionStartResponse {
  sessionId: string;
  status: EditorSessionStatus;
  baseRevisionId?: string;
  baseDocumentUpdatedAtIso?: string;
  baseDocumentFileHash?: string;
  planVersion?: string;
  preview: EditPreviewResult;
  receipt?: EditReceipt | null;
  requiresUserChoice: boolean;
  expiresAt: string;
}

export interface EditorSessionGetResponse {
  sessionId: string;
  status: EditorSessionStatus;
  documentId: string;
  planRequest: EditPlanRequest;
  baseRevisionId?: string;
  baseDocumentUpdatedAtIso?: string;
  baseDocumentFileHash?: string;
  planVersion?: string;
  beforeText: string;
  proposedText: string;
  resolvedTarget?: ResolvedTarget;
  lastPreview?: EditPreviewResult;
  receipt?: EditReceipt | null;
  requiresUserChoice?: boolean;
  expiresAt: string;
}

export interface EditorSessionApplyRequest {
  sessionId: string;
  confirmed: boolean;
  selectedTargetId?: string;
  idempotencyKey?: string;
}

export interface EditorSessionApplyResponse {
  sessionId: string;
  status: EditorSessionStatus;
  applied?: EditApplyResult;
  receipt?: EditReceipt | null;
  requiresUserChoice?: boolean;
  previewIfChoiceRequired?: EditPreviewResult;
}

export interface EditorSessionCancelRequest {
  sessionId: string;
}

export interface EditorSessionCancelResponse {
  sessionId: string;
  status: EditorSessionStatus;
}
