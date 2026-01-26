/**
 * Conversation State Types
 *
 * Persisted state for ChatGPT-quality follow-ups.
 * Stored per conversation in DB/Redis.
 */

export interface ConversationState {
  // Core identification
  conversationId: string;
  userId: string;

  // Last action context
  lastIntent: string;
  lastOperator: OperatorType;
  lastTimestamp: number;

  // Document context
  lastReferencedFileId: string | null;
  lastReferencedFilename: string | null;
  lastSourcesUsed: string[];  // documentIds used in answer

  // Topic context
  lastTopicEntities: string[];  // stakeholders, metrics, concepts
  lastQueryLanguage: 'en' | 'pt' | 'es';

  // Spreadsheet context (for finance/excel follow-ups)
  lastSpreadsheetContext: SpreadsheetContext | null;

  // Output shape
  lastOutputShape: OutputShape;

  // Open questions / ambiguity
  openQuestions: OpenQuestion[];

  // Scope lock
  scopeLockedToDocId: string | null;
  scopeLockedToFolder: string | null;
}

export type OperatorType =
  | 'summarize'
  | 'extract'
  | 'locate'
  | 'compare'
  | 'compute'
  | 'list'
  | 'filter'
  | 'open'
  | 'count'
  | 'stats'
  | 'group'
  | 'search'
  | 'unknown';

export interface SpreadsheetContext {
  docId: string;
  filename: string;
  sheet?: string;
  metric?: string;
  period?: string;
  lastRow?: string;
  lastColumn?: string;
}

export type OutputShape =
  | 'paragraph'
  | 'bullets'
  | 'numbered'
  | 'table'
  | 'button_only'
  | 'mixed';

export interface OpenQuestion {
  type: 'ambiguous_file' | 'missing_period' | 'unclear_metric' | 'multiple_matches';
  question: string;
  options?: string[];
  context?: Record<string, any>;
}

/**
 * State update payload
 */
export interface StateUpdatePayload {
  intent?: string;
  operator?: OperatorType;
  referencedFileId?: string;
  referencedFilename?: string;
  sourcesUsed?: string[];
  topicEntities?: string[];
  language?: 'en' | 'pt' | 'es';
  spreadsheetContext?: SpreadsheetContext;
  outputShape?: OutputShape;
  openQuestions?: OpenQuestion[];
  scopeDocId?: string;
  scopeFolder?: string;
}

/**
 * Default empty state
 */
export function createEmptyState(conversationId: string, userId: string): ConversationState {
  return {
    conversationId,
    userId,
    lastIntent: 'unknown',
    lastOperator: 'unknown',
    lastTimestamp: Date.now(),
    lastReferencedFileId: null,
    lastReferencedFilename: null,
    lastSourcesUsed: [],
    lastTopicEntities: [],
    lastQueryLanguage: 'en',
    lastSpreadsheetContext: null,
    lastOutputShape: 'paragraph',
    openQuestions: [],
    scopeLockedToDocId: null,
    scopeLockedToFolder: null,
  };
}
