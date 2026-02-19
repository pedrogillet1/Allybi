// src/types/retrieval.types.ts
/**
 * RETRIEVAL TYPES
 *
 * Strict contracts for retrieval engines (semantic/lexical/hybrid) + ranking,
 * evidence packaging, and nav/discovery outputs.
 *
 * Goal:
 * - Retrieval never drifts outside hard scope (explicit filename/docId lock).
 * - Retrieval always returns structured evidence separate from answer text.
 */

import type {
  DocType,
  DocumentRef,
  ScopeContext,
  CandidateDoc,
  EvidenceItem,
  SourcesUiPackage,
  QuerySignals,
} from "./rag.types";
import type { DomainId } from "./domains.types";

// ----------------------------------------------------------------------------
// Core retrieval query objects
// ----------------------------------------------------------------------------

export type RetrievalIntent =
  | "answer" // normal content retrieval for answering
  | "discover_docs" // "which file contains X" corpus-wide search
  | "nav" // open/where: metadata-only confirmation
  | "locate_content" // find where inside a doc
  | "debug"; // internal testing

export interface RetrievalQuery {
  text: string; // final rewritten query text
  rawText?: string; // original user query
  language?: "en" | "pt" | "es";
  intent?: RetrievalIntent;

  domain?: DomainId;
  signals?: QuerySignals;

  scope?: ScopeContext;

  // Optional: pre-selected candidate docs (from candidate_filters)
  candidates?: CandidateDoc[];

  // Request limits override (usually via semantic_search_config profiles)
  limits?: Partial<RetrievalLimits>;

  // For precision lookups
  hints?: {
    metric?: string; // e.g. "revenue", "noi"
    entity?: string; // e.g. property name
    time?: string; // user time mention
    sheetName?: string;
    cellRange?: string;
    slideNumber?: number;
    pageNumber?: number;
  };
}

// ----------------------------------------------------------------------------
// Retrieval configuration
// ----------------------------------------------------------------------------

export type RetrievalMethod =
  | "lexical"
  | "semantic"
  | "hybrid"
  | "metadata_only";

export interface RetrievalWeights {
  lexical: number;
  semantic: number;
  structure: number;
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

export interface RetrievalProfileConfig {
  id: string;
  method: RetrievalMethod;
  weights: RetrievalWeights;
  overrideLimits?: Partial<RetrievalLimits>;

  activateWhenAny?: string[]; // signal paths like "signals.numericIntent"
}

// ----------------------------------------------------------------------------
// Corpus / Index records
// ----------------------------------------------------------------------------

export interface IndexedChunk {
  docId: string;
  chunkId: string;

  text: string;
  charCount: number;

  // Layout signals
  structureKind?: "paragraph" | "heading" | "table" | "kv" | "list" | "unknown";

  // Locations (optional)
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  cellRange?: string;
  slideNumber?: number;

  // OCR / extraction signals
  ocrConfidence?: number; // 0..1
  gibberishScore?: number; // 0..1 (higher = worse)
  pdfGibberishScore?: number; // 0..1

  // Precomputed embeddings key or vector id
  embeddingId?: string;

  // Tokens / keywords for lexical
  tokens?: string[];
}

export interface IndexedDocument extends DocumentRef {
  // A doc contains many chunks; may be stored separately
  chunkCount?: number;

  // Doc-level signals
  ocrDominant?: boolean;
  extractionStatus?: "ok" | "failed" | "processing";
  extractedTextChars?: number;

  // Domain hints from ingestion
  detectedDomains?: Array<{ domain: DomainId; confidence: number }>;
}

// ----------------------------------------------------------------------------
// Scoring & ranking
// ----------------------------------------------------------------------------

export interface ChunkScoreBreakdown {
  lexical_overlap?: number;
  semantic_similarity?: number;
  structure_boost?: number;
  domain_boost?: number;
  recency_boost?: number;

  penalties?: Record<string, number>;
}

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number; // 0..1 normalized
  breakdown?: ChunkScoreBreakdown;
  tags?: string[];
}

export interface DocScore {
  docId: string;
  fileName: string;
  docTitle?: string;
  docType: DocType;

  score: number; // 0..1
  margin?: number; // vs second best (optional)
  signals?: string[]; // why it ranked highly
}

// ----------------------------------------------------------------------------
// Outputs
// ----------------------------------------------------------------------------

export interface RetrievalEmptyInfo {
  isEmpty: boolean;
  reasonCode?:
    | "no_docs_indexed"
    | "indexing_in_progress"
    | "extraction_failed"
    | "scope_hard_constraints_empty"
    | "no_relevant_chunks_in_scoped_docs";

  reasonShort?: string;
  recommendedNext?: Array<
    | "ask_for_section"
    | "ask_for_exact_sheet_or_slide"
    | "offer_doc_selection"
    | "remove_scope_lock"
    | "upload_document"
  >;
}

export interface NavResult {
  doc: IndexedDocument;
  // folder navigation metadata (optional)
  folderPath?: string;
}

export interface DiscoveryResultItem {
  docId: string;
  fileName: string;
  docTitle?: string;
  docType: DocType;

  relevanceScore: number; // 0..1
  snippet?: string;
  pageHint?: number;
}

export interface RetrievalOutput {
  method: RetrievalMethod;
  profileUsed?: string;

  query: RetrievalQuery;

  // candidates after scope filtering (candidate_filters)
  candidates: CandidateDoc[];

  // doc ranking results
  rankedDocs: DocScore[];

  // top scored chunks (evidence)
  evidence: EvidenceItem[];

  // sources package for UI
  sourcesUi?: SourcesUiPackage;

  // empty state info (if applicable)
  empty?: RetrievalEmptyInfo;

  // special modes
  nav?: NavResult;
  discovery?: {
    items: DiscoveryResultItem[];
    maxResults: number;
  };

  // stats for debugging
  stats?: {
    docsSearched: number;
    chunksScored: number;
    chunksReturned: number;
  };
}

// ----------------------------------------------------------------------------
// Retrieval engine interfaces (optional but useful)
// ----------------------------------------------------------------------------

export interface IRetrievalEngine {
  retrieve(query: RetrievalQuery): Promise<RetrievalOutput>;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}

export interface IHybridSearcher {
  lexicalSearch(query: RetrievalQuery): Promise<ScoredChunk[]>;
  semanticSearch(query: RetrievalQuery): Promise<ScoredChunk[]>;
  combine(
    lexical: ScoredChunk[],
    semantic: ScoredChunk[],
    weights: RetrievalWeights,
  ): ScoredChunk[];
}
