/**
 * HandlerResult - The ONLY return type for all intent handlers
 *
 * ARCHITECTURE RULE: Every intent handler MUST return this interface.
 * Handlers NEVER produce final markdown strings - only the AnswerComposer does that.
 */

import { LanguageCode } from './intentV3.types';

// ============================================================================
// FILE ACTION OPERATORS
// ============================================================================

export type FileActionOperator =
  | 'count'        // "How many files do I have?"
  | 'list'         // "List my files" / "Show only PDFs"
  | 'filter'       // "Only spreadsheets" / "Only images"
  | 'sort'         // "Newest" / "Largest" / "Sorted by date"
  | 'locate'       // "Where is file X located?" (legacy)
  | 'where'        // "Where is it?" - shows folder location with message
  | 'open'         // "Open X" / "Show it again"
  | 'search'       // "Documents about contracts" (topic search)
  | 'group'        // "Group by folder"
  | 'stats'        // "File overview" / "Document statistics"
  | 'disambiguate' // Multiple matches - ask user to choose
  | 'not_found';   // No match found

// ============================================================================
// DOCUMENT OPERATORS
// ============================================================================

export type DocumentOperator =
  | 'summarize'    // "Summarize this document"
  | 'extract'      // "Extract the key points"
  | 'locate'       // "Where does it mention X?"
  | 'compare'      // "Compare document A and B"
  | 'explain'      // "Explain in simpler terms"
  | 'analyze'      // "Analyze the data"
  | 'qa'           // General Q&A about document content
  | 'finance';     // Financial calculations from spreadsheets

// ============================================================================
// FORMAT CONSTRAINTS (from user request)
// ============================================================================

export interface FormatConstraints {
  exactBullets?: number;       // "exactly 5 bullets"
  exactParagraphs?: number;    // "exactly 2 paragraphs"
  exactNumberedItems?: number; // "exactly 4 numbered items"
  exactSentences?: number;     // "exactly 2 sentences"
  requireTable?: boolean;      // "in a table"
  requireBullets?: boolean;    // "as bullets"
  requireNumbered?: boolean;   // "as numbered list"
  maxLength?: number;          // character limit
}

// ============================================================================
// FILE ITEM (for file actions)
// ============================================================================

export interface FileItem {
  documentId: string;
  title: string;
  filename: string;
  mimeType: string;
  folderPath?: string;
  folderName?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// SOURCE REFERENCE (for document citations)
// ============================================================================

export interface SourceReference {
  documentId: string;
  documentName: string;
  filename: string;
  mimeType: string;
  snippet?: string;
  location?: string;
  pageNumber?: number;
  chunkId?: string;
  relevanceScore?: number;
}

// ============================================================================
// TABLE DATA (structured output)
// ============================================================================

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

// ============================================================================
// DOCUMENT STATS (for workspace overview)
// ============================================================================

export interface DocumentStats {
  totalCount: number;
  totalSize: number;
  formattedSize: string;         // Pre-formatted size string (e.g., "1.2 GB")
  byExtension: Record<string, number>;
  byFolder: Record<string, number>;
}

// ============================================================================
// HANDLER RESULT - The core interface
// ============================================================================

export interface HandlerResult {
  // === Identity ===
  intent: string;                          // documents, file_actions, help, finance, etc.
  operator: FileActionOperator | DocumentOperator | string;
  language: LanguageCode;

  // === Raw model output (optional - only for doc QA/help) ===
  draftText?: string;

  // === Structured outputs (preferred over draftText) ===
  bullets?: string[];                      // Bullet points
  steps?: string[];                        // Numbered steps
  table?: TableData;                       // Table data
  oneLiner?: string;                       // Single-line answer (for count, simple responses)

  // === File/inventory outputs ===
  files?: FileItem[];                      // Files to display
  totalCount?: number;                     // Total file count (for "see all" pagination)
  selectionOptions?: FileItem[];           // Multiple matches for disambiguation
  groups?: Array<{ folder: string; files: FileItem[] }>;  // For group_by_folder
  stats?: DocumentStats;                   // For workspace overview/stats queries

  // === Evidence (for UI source buttons) ===
  sourcesUsed?: SourceReference[];         // Documents used to generate answer

  // === Flags ===
  buttonOnly?: boolean;                    // For open/where/show - NO text content
  noContent?: boolean;                     // Content should be empty or minimal
  askClarification?: boolean;              // Should ask user to clarify
  clarificationQuestion?: string;          // The clarification question

  // === Metadata ===
  warnings?: string[];                     // NOT user-visible, for logging
  constraints?: FormatConstraints;         // User's format requirements
  processingTime?: number;
  tokensUsed?: number;
  documentsRetrieved?: number;
}

// ============================================================================
// ATTACHMENT TYPES (for frontend rendering)
// ============================================================================

export type AttachmentType =
  | 'source_buttons'   // Document citation pills
  | 'file_list'        // File listing with items
  | 'grouped_files'    // Files grouped by folder
  | 'select_file'      // Disambiguation - pick one
  | 'see_all';         // "See all N files" button

export interface SourceButtonsAttachment {
  type: 'source_buttons';
  buttons: Array<{
    documentId: string;
    title: string;
    mimeType: string;
    filename?: string;
  }>;
}

export interface FileListAttachment {
  type: 'file_list';
  items: FileItem[];
  totalCount: number;
  seeAllLabel?: string;  // "See all 48 files"
}

export interface SelectFileAttachment {
  type: 'select_file';
  prompt: string;        // "Which one do you mean?"
  options: FileItem[];
}

export interface GroupedFilesAttachment {
  type: 'grouped_files';
  groups: Array<{ folder: string; files: FileItem[] }>;
  totalCount: number;
}

export type Attachment =
  | SourceButtonsAttachment
  | FileListAttachment
  | GroupedFilesAttachment
  | SelectFileAttachment;

// ============================================================================
// COMPOSED RESPONSE - Output of AnswerComposer
// ============================================================================

export interface ComposedResponse {
  content: string;                  // Markdown string (can be empty for button-only)
  attachments: Attachment[];        // source_buttons, file_list, select_file
  language: LanguageCode;

  // Metadata (not user-visible)
  meta?: {
    composedBy?: string;            // GATE 1: Stamp to verify all responses pass through composer
    warnings?: string[];
    repairsApplied?: string[];
    validationPassed?: boolean;
  };
}

// ============================================================================
// VALIDATION RESULT
// ============================================================================

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

// ============================================================================
// MICROCOPY TEMPLATES (for ChatGPT-like responses)
// ============================================================================

export interface MicrocopyTemplate {
  en: string;
  pt: string;
  es: string;
}

export interface MicrocopyLibrary {
  // File actions
  file_count: MicrocopyTemplate[];
  file_list: MicrocopyTemplate[];
  file_filter: MicrocopyTemplate[];
  file_sort: MicrocopyTemplate[];
  file_locate: MicrocopyTemplate[];
  file_not_found: MicrocopyTemplate[];
  file_disambiguate: MicrocopyTemplate[];
  file_topic_search: MicrocopyTemplate[];

  // Documents
  doc_summarize: MicrocopyTemplate[];
  doc_not_found: MicrocopyTemplate[];
}
