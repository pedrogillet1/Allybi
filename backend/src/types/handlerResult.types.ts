// src/types/handlerResult.types.ts
/**
 * HANDLER RESULT TYPES
 *
 * A HandlerResult is the canonical "engine output" used by:
 * - router/intent/operator handlers
 * - orchestrator (to decide answerMode + attachments)
 * - answerComposer / responseContractEnforcer (to normalize for frontend)
 *
 * Design goals:
 * - Keep the surface area small and stable (frontend contract can evolve separately).
 * - Support BOTH doc-grounded answers and file-actions (lists/open/where) without leaking internal info.
 * - Carry explicit reasonCodes so quality gates can replace bad fallbacks ("no relevant info").
 */

import type { DocId, DocType, MimeType, ISODateTime, DocumentFile, FileListAttachment } from './files.types';
import type { SourceButtonsAttachment } from './attachments.types';

/** Intent family chosen by the intent engine */
export type IntentFamily =
  | 'documents'
  | 'file_actions'
  | 'navigation'
  | 'help'
  | 'conversation'
  | 'account'
  | 'unknown';

/** Operator chosen by the router */
export type Operator =
  | 'summarize'
  | 'extract'
  | 'compute'
  | 'compare'
  | 'quote'
  | 'locate_content'
  | 'locate_docs'
  | 'open'
  | 'where'
  | 'list'
  | 'filter'
  | 'sort'
  | 'group'
  | 'count'
  | 'stats'
  | 'help'
  | 'greeting'
  | 'fallback';

/** Answer mode (maps to render_policy + frontend UI contract) */
export type AnswerMode =
  | 'doc_grounded_single'
  | 'doc_grounded_multi'
  | 'doc_grounded_table'
  | 'doc_grounded_quote'
  | 'rank_autopick'
  | 'rank_disambiguate'
  | 'nav_pills'
  | 'help_steps'
  | 'no_docs'
  | 'scoped_not_found'
  | 'refusal'
  | 'general_answer';

/** Why a fallback happened (drives adaptive microcopy) */
export type ReasonCode =
  | 'ok'
  | 'no_docs_indexed'
  | 'indexing_in_progress'
  | 'extraction_failed'
  | 'scope_hard_constraints_empty'
  | 'no_relevant_chunks_in_scoped_docs'
  | 'ambiguous_doc_choice'
  | 'wrong_doc_risk'
  | 'policy_refusal_required'
  | 'bad_fallback_detected'
  | 'unknown_error';

/** Confidence breakdown for routing + retrieval */
export interface ConfidenceInfo {
  topScore?: number; // 0..1
  margin?: number; // 0..1
  level?: 'low' | 'medium' | 'high';
  reasons?: string[];
}

/** Explicit doc ref present in the query (filename or docId) */
export interface ExplicitDocRef {
  present: boolean;
  filename?: string;
  docId?: DocId;
}

/** Active doc state (conversation lock) */
export interface ActiveDocRef {
  present: boolean;
  docId?: DocId;
  lockType?: 'soft' | 'hard';
}

/** Scope snapshot at time of handling */
export interface ScopeSnapshot {
  type: 'none' | 'all' | 'filtered' | 'single';
  candidateDocIds?: DocId[];
  chosenDocIds?: DocId[];
  explicitDocRef?: ExplicitDocRef;
  activeDocRef?: ActiveDocRef;
}

/** Evidence chunk location (optional, used for spreadsheet/slide precision) */
export interface EvidenceLocation {
  pageStart?: number;
  pageEnd?: number;
  section?: string;

  sheetName?: string;
  cellRange?: string;
  rowIndex?: number;
  columnIndex?: number;

  slideNumber?: number;
}

/** Evidence snippet used for grounding (do NOT dump huge text blobs to UI) */
export interface EvidenceSnippet {
  docId: DocId;
  fileName: string;
  docType?: DocType;
  chunkId?: string;
  score?: number;
  text: string; // already truncated
  location?: EvidenceLocation;
  tags?: string[];
}

/** Generic attachment union (frontend renders by type) */
export type Attachment = SourceButtonsAttachment | FileListAttachment | SelectFileAttachment | GroupedFilesAttachment;

/** Selection attachment (disambiguation UI) */
export interface SelectFileAttachment {
  type: 'select_file';
  prompt: string;
  options: Array<{
    documentId: DocId;
    title: string;
    filename: string;
    mimeType?: MimeType;
    docType?: DocType;
    uploadedAt?: ISODateTime;
  }>;
}

/** Grouped files attachment (optional, for folder breakdown UI) */
export interface GroupedFilesAttachment {
  type: 'grouped_files';
  groups: Array<{
    label: string; // folder/category name
    items: DocumentFile[];
    count: number;
  }>;
  totalCount: number;
}

/** Output constraints requested by the user (affects composer) */
export interface OutputConstraints {
  outputShape?: 'paragraph' | 'bullets' | 'numbered_list' | 'table' | 'file_list' | 'button_only';
  exactBullets?: number;
  exactNumberedItems?: number;
  requireTable?: boolean;
  requireSourceButtons?: boolean;
  userRequestedShort?: boolean;
  maxSentences?: number;
  maxFollowups?: number;
}

/** Follow-up suggestions for UX (render as text, not pills) */
export interface FollowupSuggestion {
  text: string;
}

/**
 * HandlerResult
 *
 * Use the following conventions:
 * - If answerMode === 'nav_pills': set buttonOnly=true, do not put filenames in content,
 *   and include a SourceButtonsAttachment in attachments.
 * - For doc-grounded modes: include evidence[] + SourceButtonsAttachment.
 * - Never return the generic string "No relevant information found". Use reasonCode + leave content empty,
 *   letting quality_gates route to microcopy.
 */
export interface HandlerResult {
  /** Mandatory */
  intent: IntentFamily;
  operator: Operator;
  answerMode: AnswerMode;

  /** Human-facing answer (may be empty for buttonOnly + file_list attachments) */
  content?: string;

  /** Structured outputs (optional; composer may render them) */
  bullets?: string[];
  steps?: string[];
  table?: {
    headers: string[];
    rows: string[][];
    caption?: string;
  };

  /** Attachments for UI */
  attachments?: Attachment[];

  /** Evidence for doc-grounding + debugging (not necessarily rendered directly) */
  evidence?: EvidenceSnippet[];

  /** Convenience: sources as buttons (preferred) */
  sourceButtons?: SourceButtonsAttachment;

  /** File results (for file_actions / nav) */
  files?: DocumentFile[];
  totalCount?: number;

  /** If true, UI should show only intro text + source button(s) (nav_pills contract) */
  buttonOnly?: boolean;

  /** Output constraints detected from query */
  constraints?: OutputConstraints;

  /** Reason + confidence to enable adaptive fallbacks */
  reasonCode?: ReasonCode;
  confidence?: ConfidenceInfo;

  /** Scope snapshot for quality gates (wrong-doc enforcement) */
  scope?: ScopeSnapshot;

  /** Runtime metadata (safe, non-sensitive) */
  metadata?: {
    requestId?: string;
    conversationId?: string;
    turnId?: string;

    // For regenerate variation
    regenCount?: number;

    // Domain/language (as detected)
    domainId?: string;
    language?: 'en' | 'pt' | 'es';

    // Debug flags (should be stripped in prod render)
    traceId?: string;
  };

  /** Follow-up suggestions (render as inline text at end) */
  followups?: FollowupSuggestion[];
}

/** Validation types used by services/validation */
export interface ValidationFailure {
  rule: string;
  reason: string;
  evidence?: string;
  canRepair: boolean;
}

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
}
