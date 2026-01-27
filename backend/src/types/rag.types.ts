// src/types/rag.types.ts
/**
 * RAG TYPES
 *
 * Shared types for retrieval (semantic/lexical/hybrid), evidence packaging,
 * and doc-grounded answering.
 *
 * IMPORTANT:
 * - Evidence is separate from answer text.
 * - Sources are rendered via attachments (source_buttons), not inline.
 */

import type { OutputShape, AnswerMode } from './operators.types';
import type { DomainId } from './domains.types';

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

export type DocType =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'ppt'
  | 'pptx'
  | 'xls'
  | 'xlsx'
  | 'csv'
  | 'txt'
  | 'md'
  | 'png'
  | 'jpg'
  | 'jpeg'
  | 'webp'
  | 'unknown';

export interface DocumentRef {
  docId: string;            // canonical id used across system
  fileName: string;         // original filename (with extension)
  docTitle?: string;        // display title (if different)
  docType: DocType;
  folderPath?: string;
  uploadedAt?: string;      // ISO
  sizeBytes?: number;
  sha256?: string;
  tags?: string[];
}

// ----------------------------------------------------------------------------
// Query & Scope
// ----------------------------------------------------------------------------

export interface ExplicitDocRef {
  present: boolean;
  type?: 'docId' | 'filename';
  value?: string;           // docId or filename
}

export interface ActiveDocRef {
  present: boolean;
  docId?: string;
  lockType?: 'soft' | 'hard';
  lastSwitchedAt?: string;  // ISO
}

export interface ScopeHard {
  docIdAllowlist?: string[];
  docIdDenylist?: string[];
  filenameMustContain?: string[]; // raw filename string(s)
  docTypeAllowlist?: DocType[];
}

export interface ScopeSoft {
  docIdAllowlist?: string[]; // active doc preferences
  docTypePreference?: DocType[];
  timeHint?: TimeHint;
  metricHint?: MetricHint;
  entityHint?: EntityHint;
}

export interface ScopeContext {
  explicitDocRef?: ExplicitDocRef;
  hard?: ScopeHard;
  soft?: ScopeSoft;
}

export interface CandidateDoc {
  docId: string;
  fileName: string;
  docTitle?: string;
  docType: DocType;
  folderPath?: string;
  uploadedAt?: string;
  score?: number;           // ranking score (0..1)
  tags?: string[];          // preference tags
  filterNotes?: string[];   // why kept/dropped
}

// ----------------------------------------------------------------------------
// Signals (from query rewrite/semantics)
// ----------------------------------------------------------------------------

export interface TimeHint {
  raw?: string; // original text fragment
  type?: 'month' | 'quarter' | 'year' | 'range' | 'relative';
  start?: string; // ISO date
  end?: string;   // ISO date
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
}

export interface MetricHint {
  raw?: string;
  metricKey?: string; // e.g. "noi", "revenue", "ebitda"
}

export interface EntityHint {
  raw?: string;
  entityType?: 'person' | 'company' | 'property' | 'account' | 'project' | 'unknown';
  entityValue?: string;
}

export interface QuerySignals {
  // formatting / UX
  userAskedForTable?: boolean;
  userAskedForBullets?: boolean;
  userAskedForSteps?: boolean;
  userAskedForQuote?: boolean;
  userAskedForJson?: boolean;

  userRequestedShort?: boolean;
  shortOverview?: boolean;
  justAnswer?: boolean;

  // retrieval intent
  discoveryQuery?: boolean;
  navQuery?: boolean;

  // semantics
  numericIntent?: boolean;
  numericIntentStrong?: boolean;
  spreadsheetQuery?: boolean;
  calculationIntent?: boolean;
  scannedDocQuery?: boolean;

  // doc scope
  hasExplicitDocRef?: boolean;

  // evidence quality
  lowEvidence?: boolean;
  ocrLowConfidence?: boolean;
  groundingFailSoft?: boolean;

  // meta
  language?: 'en' | 'pt' | 'es';
}

// ----------------------------------------------------------------------------
// Retrieval Config + Profiles
// ----------------------------------------------------------------------------

export type RetrievalMethod = 'lexical' | 'semantic' | 'hybrid' | 'metadata_only';

export interface RetrievalWeights {
  lexical: number;
  semantic: number;
  structure: number;
}

export interface RetrievalProfile {
  id: string;
  method: RetrievalMethod;
  weights: RetrievalWeights;
  overrideLimits?: Partial<RetrievalLimits>;
}

export interface RetrievalLimits {
  maxDocsToSearchSoft: number;
  maxDocsToSearchHard: number;

  maxChunksToScoreSoft: number;

  maxChunksToReturnSoft: number;
  maxChunksToReturnHard: number;

  maxEvidencePerDocSoft: number;
  maxEvidenceTotalSoft: number;

  truncateChunkTextChars: number;
}

// ----------------------------------------------------------------------------
// Evidence
// ----------------------------------------------------------------------------

export type EvidenceKind =
  | 'chunk_match'
  | 'quote'
  | 'table_cell_match'
  | 'page_map_ref'
  | 'extraction';

export interface EvidenceLocation {
  // pdf/doc
  pageStart?: number;
  pageEnd?: number;

  // spreadsheets
  sheetName?: string;
  cellRange?: string;
  rowIndex?: number;
  columnIndex?: number;

  // slides
  slideNumber?: number;

  // generic
  section?: string;
}

export interface EvidenceItem {
  kind: EvidenceKind;
  docId: string;
  fileName?: string;
  docTitle?: string;
  docType?: DocType;

  chunkId?: string;
  score: number;            // 0..1
  tags?: string[];

  location?: EvidenceLocation;

  text: string;             // truncated chunk text
}

export interface SourcesUiPackage {
  topDocs: Array<{
    docId: string;
    fileName: string;
    docTitle?: string;
    docType?: DocType;
    locations?: EvidenceLocation[];
    topChunks?: EvidenceItem[];
  }>;
}

// ----------------------------------------------------------------------------
// Retrieval Output
// ----------------------------------------------------------------------------

export interface RetrievalResult {
  method: RetrievalMethod;
  profileUsed?: string;

  domain?: DomainId;
  signals?: QuerySignals;

  scope: ScopeContext;

  candidates: CandidateDoc[];
  chosenDocs: CandidateDoc[]; // after ranking / selection

  evidence: EvidenceItem[];
  sourcesUi?: SourcesUiPackage;

  // reason codes for empty results
  empty?: {
    isEmpty: boolean;
    reasonCode?: 'no_docs_indexed' | 'scope_hard_constraints_empty' | 'no_relevant_chunks_in_scoped_docs' | 'indexing_in_progress' | 'extraction_failed';
    reasonShort?: string;
  };

  stats?: {
    docsSearched: number;
    chunksScored: number;
    chunksReturned: number;
  };
}

// ----------------------------------------------------------------------------
// Grounding Verdict (post-retrieval / pre-compose)
// ----------------------------------------------------------------------------

export type GroundingVerdict = 'pass' | 'pass_with_warning' | 'fail_soft' | 'fail_hard';

export interface GroundingResult {
  verdict: GroundingVerdict;
  reasons: string[];
  recommendedAction:
    | 'proceed'
    | 'add_hedge_or_cite'
    | 'ask_one_clarification'
    | 'narrow_scope'
    | 'retry_retrieval'
    | 'no_docs_or_block';

  evidenceStats?: {
    docsUsed: number;
    snippets: number;
    tokenOverlap?: number;
    numericClaims?: number;
    numericClaimsGrounded?: number;
  };
}

// ----------------------------------------------------------------------------
// Compose Contract (retrieval -> answer)
// ----------------------------------------------------------------------------

export interface ComposeContext {
  conversationId: string;
  turnId: string;

  queryText: string;
  language: 'en' | 'pt' | 'es';

  domain: DomainId;
  signals: QuerySignals;

  answerMode: AnswerMode;
  outputShape?: OutputShape;

  scope: ScopeContext;
  activeDocRef?: ActiveDocRef;

  regenCount?: number;
}

export interface ComposeRequest {
  context: ComposeContext;
  retrieval: RetrievalResult;
  grounding?: GroundingResult;
}

export interface ComposeResponseDraft {
  text: string; // markdown without sources
  answerMode: AnswerMode;

  // used by frontend render policy
  meta?: {
    answerMode?: AnswerMode;
    profile?: string;
    plannedBlocks?: string[];
    followUpSuggestions?: string[];
  };
}

// ---------------------------------------------------------------------------
// Aliases for older code that uses these names
// ---------------------------------------------------------------------------

export interface RetrievedChunk {
  chunkId?: string;
  docId?: string;
  documentId?: string;
  documentName?: string;
  fileName?: string;
  docTitle?: string;
  docType?: DocType;
  score: number;
  text?: string;
  content?: string;
  pageNumber?: number;
  metadata?: Record<string, any>;
  tags?: string[];
  location?: EvidenceLocation;
  [k: string]: any;
}

export type DocumentMarker = DocumentRef & { [k: string]: any };

export interface RetrievalFilters {
  documentIds?: string[];
  docTypes?: DocType[];
  folderIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  maxResults?: number;
  [k: string]: any;
}

export interface IntentClassificationV3 {
  intentFamily: string;
  operator: string;
  confidence: number;
  signals?: Record<string, any>;
  target?: { documentIds?: string[]; [k: string]: any } | string;
  [k: string]: any;
}

export interface RankingParams {
  method?: string;
  weights?: Partial<RetrievalWeights>;
  maxChunks?: number;
  boostActive?: boolean;
  query?: string;
  intent?: any;
  chunks?: any[];
  boostMap?: Record<string, number>;
  [k: string]: any;
}

export type RankedChunks = EvidenceItem[];

export interface LoadMoreMarker {
  type: 'load_more';
  totalAvailable?: number;
  displayed?: number;
  totalDocs?: number;
  shownDocs?: number;
  remainingDocs?: number;
  action?: string;
  [k: string]: any;
}
