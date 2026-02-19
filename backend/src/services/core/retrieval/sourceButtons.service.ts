/**
 * SOURCE BUTTONS SERVICE
 *
 * CENTRALIZED source/citation handling - ChatGPT-like source pills.
 * ALL intents MUST use this service to produce source attachments.
 *
 * Contract:
 * - Sources are structured attachments, NOT text
 * - No filenames in answer body
 * - No numbered markdown source lists
 * - No internal metadata (KB, folder paths) in normal output
 *
 * Policy:
 * - Doc-grounded intents: content + source_buttons attachment
 * - File actions: NO content, ONLY source_buttons attachment
 */

import * as fs from "fs";
import * as path from "path";

// =============================================================================
// DATA BANK LOADING
// =============================================================================

interface SourceEngineDataBank {
  sourceFiltering: {
    matchingRules: {
      minPhraseLength: number;
      minPhraseChars: number;
      minMeaningfulWords: number;
      minMatchScore: number;
      minFallbackScore: number;
      requireMultipleTermMatches: number;
      numericMatchThreshold: number;
    };
  };
  stopwords: {
    en: string[];
    pt: string[];
    es: string[];
  };
  commonCapitalizedWords: {
    any: string[];
    pt: string[];
    es: string[];
  };
}

let _sourceEngineBank: SourceEngineDataBank | null = null;

function loadSourceEngineBank(): SourceEngineDataBank {
  if (_sourceEngineBank) return _sourceEngineBank;

  const bankPath = path.join(
    __dirname,
    "../../../data_banks/retrieval/source_engine.any.json",
  );

  try {
    const raw = fs.readFileSync(bankPath, "utf-8");
    _sourceEngineBank = JSON.parse(raw) as SourceEngineDataBank;
  } catch (err) {
    console.error(
      "[SourceButtons] Failed to load source_engine data bank:",
      err,
    );
    // Fallback to minimal defaults
    _sourceEngineBank = {
      sourceFiltering: {
        matchingRules: {
          minPhraseLength: 5,
          minPhraseChars: 25,
          minMeaningfulWords: 3,
          minMatchScore: 2,
          minFallbackScore: 1,
          requireMultipleTermMatches: 3,
          numericMatchThreshold: 2,
        },
      },
      stopwords: { en: [], pt: [], es: [] },
      commonCapitalizedWords: { any: [], pt: [], es: [] },
    };
  }

  return _sourceEngineBank;
}

/**
 * Get combined stopwords set for all supported languages.
 */
function getStopwordsSet(): Set<string> {
  const bank = loadSourceEngineBank();
  const combined = new Set<string>();
  for (const lang of ["en", "pt", "es"] as const) {
    for (const word of bank.stopwords[lang] || []) {
      combined.add(word.toLowerCase());
    }
  }
  return combined;
}

/**
 * Get combined common capitalized words set for all languages.
 */
function getCommonCapsSet(): Set<string> {
  const bank = loadSourceEngineBank();
  const combined = new Set<string>();
  for (const lang of ["any", "pt", "es"] as const) {
    for (const word of bank.commonCapitalizedWords[lang] || []) {
      combined.add(word);
    }
  }
  return combined;
}

/**
 * Get matching rules from data bank.
 */
function getMatchingRules() {
  return loadSourceEngineBank().sourceFiltering.matchingRules;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single source button (pill) shown to user.
 * This is what the frontend renders as a clickable pill.
 */
export interface SourceButton {
  /** Document ID - required for opening preview modal */
  documentId: string;

  /** Display title - shown in the pill */
  title: string;

  /** MIME type - determines icon (pdf, xlsx, docx, etc.) */
  mimeType?: string;

  /** Folder path string (e.g., "trabalhos / stress test / xlsx") */
  folderPath?: string;

  /** Folder segments array for flexible rendering */
  folderSegments?: string[];

  /** Optional location within document (page, slide, sheet, cell) */
  location?: {
    type: "page" | "slide" | "sheet" | "cell" | "section";
    value: string | number;
    label?: string; // e.g., "Page 3", "Sheet: Q4 2024"
  };
}

/**
 * The source_buttons attachment type.
 * This is what gets attached to assistant messages.
 */
export interface SourceButtonsAttachment {
  type: "source_buttons";

  /** Array of source buttons to display */
  buttons: SourceButton[];

  /** For file lists: show "See all" button if more items exist */
  seeAll?: {
    label: string;
    totalCount: number;
    remainingCount: number;
  };
}

/**
 * The file_list attachment type (reuses SourceButton design).
 * Used for "list files" queries - not sources, but file listing.
 */
export interface FileListAttachment {
  type: "file_list";

  /** Array of file buttons to display (max 10) */
  buttons: SourceButton[];

  /** Show "See all" button if more items exist */
  seeAll?: {
    label: string;
    totalCount: number;
    remainingCount: number;
  };
}

/**
 * Union type for all attachment types.
 */
export type MessageAttachment = SourceButtonsAttachment | FileListAttachment;

/**
 * Raw source data from retrieval/chunks.
 * This is what the backend produces internally.
 */
export interface RawSource {
  documentId: string;
  filename: string;
  mimeType?: string;
  folderPath?: string;
  folderSegments?: string[];
  pageNumber?: number;
  sheetName?: string;
  cellReference?: string;
  slideNumber?: number;
  sectionTitle?: string;
  score?: number; // relevance score for sorting
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Max source buttons for document QA (3-5 recommended) */
const MAX_SOURCE_BUTTONS_QA = 5;

/** Max source buttons for file actions (usually 1, max 10 for disambiguation) */
const MAX_SOURCE_BUTTONS_FILE_ACTION = 10;

/** Max file buttons for file list (10 + see all) */
const MAX_FILE_LIST_BUTTONS = 10;

// =============================================================================
// SERVICE
// =============================================================================

export class SourceButtonsService {
  /**
   * Build source buttons attachment from raw sources.
   * This is THE central function for all source generation.
   *
   * @param sources - Raw source data from retrieval
   * @param options - Configuration options
   * @returns SourceButtonsAttachment or null if no sources
   */
  buildSourceButtons(
    sources: RawSource[],
    options: {
      /** Max buttons to show */
      maxButtons?: number;
      /** Context: 'qa' for document QA, 'file_action' for file operations */
      context?: "qa" | "file_action";
      /** Language for labels */
      language?: "en" | "pt" | "es";
    } = {},
  ): SourceButtonsAttachment | null {
    const {
      maxButtons = options.context === "file_action"
        ? MAX_SOURCE_BUTTONS_FILE_ACTION
        : MAX_SOURCE_BUTTONS_QA,
      language = "en",
    } = options;

    if (!sources || sources.length === 0) {
      return null;
    }

    // 1. Dedupe by documentId (keep highest scoring if duplicates)
    const deduped = this.dedupeByDocumentId(sources);

    // 2. Sort by relevance score (if available)
    const sorted = deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // 3. Limit to maxButtons
    const limited = sorted.slice(0, maxButtons);

    // 4. Convert to SourceButton format
    const buttons: SourceButton[] = limited.map((source) =>
      this.rawToButton(source),
    );

    return {
      type: "source_buttons",
      buttons,
    };
  }

  /**
   * Build file list attachment (for "list files" queries).
   * Reuses SourceButton design but as file_list type.
   *
   * @param files - Array of file data
   * @param totalCount - Total files available (for "see all")
   * @param language - Response language
   */
  buildFileListAttachment(
    files: Array<{ id: string; filename: string; mimeType?: string }>,
    totalCount: number,
    language: "en" | "pt" | "es" = "en",
  ): FileListAttachment {
    const displayFiles = files.slice(0, MAX_FILE_LIST_BUTTONS);
    const hasMore = totalCount > MAX_FILE_LIST_BUTTONS;

    const buttons: SourceButton[] = displayFiles.map((f) => ({
      documentId: f.id,
      title: f.filename,
      mimeType: f.mimeType,
    }));

    const seeAllLabels: Record<string, string> = {
      en: "See all",
      pt: "Ver todos",
      es: "Ver todos",
    };

    return {
      type: "file_list",
      buttons,
      ...(hasMore && {
        seeAll: {
          label: seeAllLabels[language] || seeAllLabels.en,
          totalCount,
          remainingCount: totalCount - MAX_FILE_LIST_BUTTONS,
        },
      }),
    };
  }

  /**
   * Build a single source button (for file actions like "open file X").
   */
  buildSingleSourceButton(
    documentId: string,
    title: string,
    mimeType?: string,
    location?: SourceButton["location"],
  ): SourceButtonsAttachment {
    return {
      type: "source_buttons",
      buttons: [
        {
          documentId,
          title,
          mimeType,
          location,
        },
      ],
    };
  }

  /**
   * Build source buttons from retrieval chunks.
   * Extracts document info and location from chunk metadata.
   */
  buildFromChunks(
    chunks: Array<{
      documentId?: string;
      metadata?: {
        documentId?: string;
        filename?: string;
        mimeType?: string;
        folderPath?: string;
        folderSegments?: string[];
        pageNumber?: number;
        sheetName?: string;
        slideNumber?: number;
      };
      score?: number;
    }>,
    language: "en" | "pt" | "es" = "en",
  ): SourceButtonsAttachment | null {
    // Convert chunks to RawSource format
    const sources: RawSource[] = chunks
      .filter((chunk) => chunk.documentId || chunk.metadata?.documentId)
      .map((chunk) => ({
        documentId: (chunk.documentId || chunk.metadata?.documentId)!,
        filename: chunk.metadata?.filename || "Document",
        mimeType: chunk.metadata?.mimeType,
        folderPath: chunk.metadata?.folderPath,
        folderSegments: chunk.metadata?.folderSegments,
        pageNumber: chunk.metadata?.pageNumber,
        sheetName: chunk.metadata?.sheetName,
        slideNumber: chunk.metadata?.slideNumber,
        score: chunk.score,
      }));

    return this.buildSourceButtons(sources, { context: "qa", language });
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Dedupe sources by documentId, keeping highest score.
   */
  private dedupeByDocumentId(sources: RawSource[]): RawSource[] {
    const seen = new Map<string, RawSource>();

    for (const source of sources) {
      const existing = seen.get(source.documentId);
      if (!existing || (source.score ?? 0) > (existing.score ?? 0)) {
        seen.set(source.documentId, source);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Convert raw source to SourceButton.
   */
  private rawToButton(source: RawSource): SourceButton {
    const button: SourceButton = {
      documentId: source.documentId,
      title: source.filename,
      mimeType: source.mimeType,
      folderPath: source.folderPath,
      folderSegments: source.folderSegments,
    };

    // Add location if available
    if (source.pageNumber) {
      button.location = {
        type: "page",
        value: source.pageNumber,
        label: `Page ${source.pageNumber}`,
      };
    } else if (source.slideNumber) {
      button.location = {
        type: "slide",
        value: source.slideNumber,
        label: `Slide ${source.slideNumber}`,
      };
    } else if (source.sheetName) {
      button.location = {
        type: "sheet",
        value: source.sheetName,
        label: source.sheetName,
      };
    } else if (source.cellReference) {
      button.location = {
        type: "cell",
        value: source.cellReference,
        label: source.cellReference,
      };
    } else if (source.sectionTitle) {
      button.location = {
        type: "section",
        value: source.sectionTitle,
        label: source.sectionTitle,
      };
    }

    return button;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: SourceButtonsService | null = null;

export function getSourceButtonsService(): SourceButtonsService {
  if (!instance) {
    instance = new SourceButtonsService();
  }
  return instance;
}

// =============================================================================
// USED DOCUMENT EXTRACTION (Filter sources to only those actually used in answer)
// =============================================================================

/**
 * Evidence chunk shape from retrieval (minimal for this function).
 */
export interface EvidenceChunkForFiltering {
  docId: string;
  fileName?: string;
  docTitle?: string;
  text: string;
  pageStart?: number;
  sheetName?: string;
  slideNumber?: number;
}

/**
 * Determine which documents from the evidence were actually used in the answer.
 *
 * STRICT FILTERING: Only matches documents whose actual content appears in the answer.
 * Does NOT match based on:
 * - Filename appearing in answer (e.g., "Koda" in filename doesn't count)
 * - Generic terms or short phrases
 * - Document titles alone
 *
 * All thresholds come from source_engine data bank - NO hardcoded values.
 * This ensures sources shown to users are genuinely grounding the answer.
 */
export function extractUsedDocuments(
  draft: string,
  evidence: EvidenceChunkForFiltering[],
): Set<string> {
  const usedDocIds = new Set<string>();

  if (!draft || draft.length === 0 || !evidence || evidence.length === 0) {
    return usedDocIds;
  }

  const draftNormalized = normalizeForMatching(draft);
  const rules = getMatchingRules();

  // Track match scores for each document (higher = more confident it was used)
  const docScores = new Map<string, number>();

  for (const chunk of evidence) {
    if (!chunk.text || chunk.text.length < 30) continue;

    let score = docScores.get(chunk.docId) || 0;

    // Method 1: Content phrase matching
    const specificPhrases = extractSpecificPhrases(chunk.text);
    for (const phrase of specificPhrases) {
      const normalizedPhrase = normalizeForMatching(phrase);
      if (
        normalizedPhrase.length >= rules.minPhraseChars &&
        draftNormalized.includes(normalizedPhrase)
      ) {
        score += 3;
      }
    }

    // Method 2: Unique terminology matching
    const uniqueTerms = extractUniqueTerminology(chunk.text);
    let termMatches = 0;
    for (const term of uniqueTerms) {
      if (draftNormalized.includes(normalizeForMatching(term))) {
        termMatches++;
      }
    }
    if (termMatches >= rules.requireMultipleTermMatches) {
      score += 2;
    }

    // Method 3: Numeric data matching
    const chunkNumbers = extractSignificantNumbers(chunk.text);
    const draftNumbers = extractSignificantNumbers(draft);
    let numMatches = 0;
    for (const num of chunkNumbers) {
      if (draftNumbers.has(num)) {
        numMatches++;
      }
    }
    if (numMatches >= rules.numericMatchThreshold) {
      score += 2;
    }

    docScores.set(chunk.docId, score);
  }

  // Include documents that meet the minimum score threshold
  for (const [docId, score] of docScores) {
    if (score >= rules.minMatchScore) {
      usedDocIds.add(docId);
    }
  }

  // Fallback: if no matches found, include top-scored document if it has any evidence
  if (usedDocIds.size === 0 && evidence.length > 0) {
    let bestDoc: string | null = null;
    let bestScore = 0;
    for (const [docId, score] of docScores) {
      if (score > bestScore) {
        bestScore = score;
        bestDoc = docId;
      }
    }
    if (bestDoc && bestScore >= rules.minFallbackScore) {
      usedDocIds.add(bestDoc);
    }
  }

  return usedDocIds;
}

/**
 * Extract specific, meaningful phrases (5-8 words) that are likely unique to the document.
 * Uses stopwords from source_engine data bank.
 */
function extractSpecificPhrases(text: string): string[] {
  const phrases: string[] = [];
  const stopWords = getStopwordsSet();
  const rules = getMatchingRules();

  const sentences = text.split(/[.!?;]+/).filter((s) => s.trim().length > 20);
  for (const sentence of sentences.slice(0, 8)) {
    const words = sentence
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length > 2);
    for (let i = 0; i <= words.length - rules.minPhraseLength; i++) {
      for (
        let len = rules.minPhraseLength;
        len <= Math.min(8, words.length - i);
        len++
      ) {
        const phraseWords = words.slice(i, i + len);
        const meaningfulWords = phraseWords.filter(
          (w: string) => !stopWords.has(w.toLowerCase()),
        );
        if (meaningfulWords.length >= rules.minMeaningfulWords) {
          const phrase = phraseWords.join(" ");
          if (phrase.length >= 20) {
            phrases.push(phrase);
          }
        }
      }
    }
  }
  return [...new Set(phrases)].slice(0, 30);
}

/**
 * Extract unique terminology - proper nouns, technical terms, specific concepts.
 * Uses commonCapitalizedWords from source_engine data bank.
 */
function extractUniqueTerminology(text: string): string[] {
  const terms: string[] = [];
  const commonCaps = getCommonCapsSet();

  // Match capitalized words/phrases (proper nouns)
  const capitalizedMatches =
    text.match(/[A-Z][a-zà-ü]+(?:\s+[A-Z][a-zà-ü]+)*/g) || [];
  for (const match of capitalizedMatches) {
    if (match.length > 5 && !commonCaps.has(match)) {
      terms.push(match);
    }
  }

  // Match acronyms
  const acronyms = text.match(/\b[A-Z]{2,}[-\w]*\b/g) || [];
  terms.push(
    ...acronyms.filter((t: string) => t.length >= 3 && t.length <= 15),
  );

  // Match quoted text
  const quoted = text.match(/"([^"]{5,50})"|'([^']{5,50})'/g) || [];
  terms.push(...quoted.map((q: string) => q.replace(/['"]/g, "")));

  return [...new Set(terms)].slice(0, 20);
}

/**
 * Extract key phrases from text for overlap matching (LEGACY - kept for compatibility).
 */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences.slice(0, 5)) {
    // Limit to first 5 sentences
    // Extract 3-6 word phrases
    const words = sentence
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (let i = 0; i < words.length - 2; i++) {
      // 3-word phrases
      if (i + 3 <= words.length) {
        const phrase = words.slice(i, i + 3).join(" ");
        if (phrase.length >= 12) {
          // Meaningful length
          phrases.push(phrase);
        }
      }
      // 4-word phrases
      if (i + 4 <= words.length) {
        const phrase = words.slice(i, i + 4).join(" ");
        if (phrase.length >= 15) {
          phrases.push(phrase);
        }
      }
    }
  }

  return phrases.slice(0, 20); // Limit total phrases
}

/**
 * Normalize text for fuzzy matching (remove punctuation, extra spaces, lowercase).
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract significant numbers from text (for data/spreadsheet matching).
 * Filters out common numbers like years, small integers, percentages.
 */
function extractSignificantNumbers(text: string): Set<string> {
  const numbers = new Set<string>();

  // Match numbers with potential decimals/commas (financial data)
  const matches = text.match(/\b\d{1,3}(?:[,.]?\d{3})*(?:\.\d+)?\b/g) || [];

  for (const match of matches) {
    const normalized = match.replace(/,/g, "");
    const num = parseFloat(normalized);

    // Skip common/meaningless numbers
    if (isNaN(num)) continue;
    if (num < 100 && Number.isInteger(num)) continue; // Small integers
    if (num >= 1900 && num <= 2100) continue; // Years

    numbers.add(normalized);
  }

  return numbers;
}

/**
 * Filter source buttons to only include documents that were actually used.
 */
export function filterSourceButtonsByUsage(
  attachment: SourceButtonsAttachment | null,
  usedDocIds: Set<string>,
): SourceButtonsAttachment | null {
  if (!attachment || !attachment.buttons || attachment.buttons.length === 0) {
    return null;
  }

  if (usedDocIds.size === 0) {
    // No filtering needed if we couldn't detect usage - return as-is
    return attachment;
  }

  const filteredButtons = attachment.buttons.filter((btn) =>
    usedDocIds.has(btn.documentId),
  );

  if (filteredButtons.length === 0) {
    return null;
  }

  return {
    ...attachment,
    buttons: filteredButtons,
  };
}

// =============================================================================
// RESPONSE BUILDER HELPERS
// =============================================================================

/**
 * Standard response structure for all handlers.
 * Enforces the "content + attachments" contract.
 */
export interface StandardResponse {
  /** Clean markdown content (empty string for file actions) */
  content: string;

  /** Attachments to include (source buttons, file list, etc.) */
  attachments: MessageAttachment[];

  /** Metadata for analytics/logging */
  metadata?: {
    intent?: string;
    documentsUsed?: number;
    [key: string]: unknown;
  };
}

/**
 * Build a standard doc-grounded response.
 * Content + source buttons.
 */
export function buildDocGroundedResponse(
  content: string,
  sources: RawSource[],
  language: "en" | "pt" | "es" = "en",
): StandardResponse {
  const service = getSourceButtonsService();
  const sourceButtons = service.buildSourceButtons(sources, {
    context: "qa",
    language,
  });

  return {
    content,
    attachments: sourceButtons ? [sourceButtons] : [],
    metadata: {
      documentsUsed: sources.length,
    },
  };
}

/**
 * Build a file action response.
 * NO content, ONLY source buttons.
 */
export function buildFileActionResponse(
  files: Array<{ id: string; filename: string; mimeType?: string }>,
  _language: "en" | "pt" | "es" = "en",
): StandardResponse {
  const service = getSourceButtonsService();

  // For single file: use source_buttons
  // For multiple files: use source_buttons with multiple items
  const buttons: SourceButton[] = files
    .slice(0, MAX_SOURCE_BUTTONS_FILE_ACTION)
    .map((f) => ({
      documentId: f.id,
      title: f.filename,
      mimeType: f.mimeType,
    }));

  return {
    content: "", // NO content for file actions
    attachments: [
      {
        type: "source_buttons",
        buttons,
      },
    ],
    metadata: {
      documentsUsed: files.length,
    },
  };
}

/**
 * Build a file list response.
 * Content (optional intro) + file_list attachment.
 */
export function buildFileListResponse(
  files: Array<{ id: string; filename: string; mimeType?: string }>,
  totalCount: number,
  introText: string = "",
  language: "en" | "pt" | "es" = "en",
): StandardResponse {
  const service = getSourceButtonsService();
  const fileList = service.buildFileListAttachment(files, totalCount, language);

  return {
    content: introText,
    attachments: [fileList],
    metadata: {
      documentsUsed: totalCount,
    },
  };
}

/**
 * Build a "no evidence" response (clarifying question).
 * Content only, NO source buttons.
 */
export function buildNoEvidenceResponse(
  clarifyingQuestion: string,
): StandardResponse {
  return {
    content: clarifyingQuestion,
    attachments: [], // No source buttons when no evidence
  };
}
