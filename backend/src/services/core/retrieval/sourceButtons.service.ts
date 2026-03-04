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
import { getOptionalBank } from "../banks/bankLoader.service";
import { stableLocationKey } from "./retrievalEngine.utils";

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
  locationKey?: string;
  snippet?: string;
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
  locationKey?: string;
  locationLabel?: string;
  snippet?: string;
  score?: number; // relevance score for sorting
}

type SourceButtonsLanguage = "en" | "pt" | "es";

interface SourceEngineDataBank {
  sourceButtons?: {
    qaMaxButtons?: number;
    fileActionMaxButtons?: number;
    fileListMaxButtons?: number;
    seeAllLabels?: Partial<Record<SourceButtonsLanguage, string>>;
  };
  sourceFiltering?: {
    citationRules?: {
      maxCitations?: number;
    };
  };
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
  private readonly sourceEngineBank =
    getOptionalBank<SourceEngineDataBank>("source_engine");

  getDefaultMaxButtons(context: "qa" | "file_action" | "file_list"): number {
    if (context === "file_action") {
      return (
        this.toPositiveInt(this.sourceEngineBank?.sourceButtons?.fileActionMaxButtons) ??
        MAX_SOURCE_BUTTONS_FILE_ACTION
      );
    }
    if (context === "file_list") {
      return (
        this.toPositiveInt(this.sourceEngineBank?.sourceButtons?.fileListMaxButtons) ??
        MAX_FILE_LIST_BUTTONS
      );
    }
    return (
      this.toPositiveInt(
        this.sourceEngineBank?.sourceButtons?.qaMaxButtons ??
          this.sourceEngineBank?.sourceFiltering?.citationRules?.maxCitations,
      ) ?? MAX_SOURCE_BUTTONS_QA
    );
  }

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
      language?: SourceButtonsLanguage;
    } = {},
  ): SourceButtonsAttachment | null {
    const context = options.context || "qa";
    const maxButtons =
      this.toPositiveInt(options.maxButtons) ||
      this.getDefaultMaxButtons(
        context === "file_action" ? "file_action" : "qa",
      );
    const language = options.language || "en";

    if (!sources || sources.length === 0) {
      return null;
    }

    // 1. Dedupe by documentId + location (keep highest scoring if duplicates)
    const deduped = this.dedupeByDocumentAndLocation(sources);

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
    language: SourceButtonsLanguage = "en",
  ): FileListAttachment {
    const maxButtons = this.getDefaultMaxButtons("file_list");
    const displayFiles = files.slice(0, maxButtons);
    const hasMore = totalCount > maxButtons;

    const buttons: SourceButton[] = displayFiles.map((f) => ({
      documentId: f.id,
      title: f.filename,
      mimeType: f.mimeType,
    }));

    const fallbackSeeAllLabels: Record<SourceButtonsLanguage, string> = {
      en: "See all",
      pt: "Ver todos",
      es: "Ver todos",
    };
    const bankSeeAllLabels = this.sourceEngineBank?.sourceButtons?.seeAllLabels;

    return {
      type: "file_list",
      buttons,
      ...(hasMore && {
        seeAll: {
          label:
            bankSeeAllLabels?.[language] ||
            bankSeeAllLabels?.en ||
            fallbackSeeAllLabels[language] ||
            fallbackSeeAllLabels.en,
          totalCount,
          remainingCount: totalCount - maxButtons,
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
      locationKey?: string;
      snippet?: string;
      metadata?: {
        documentId?: string;
        filename?: string;
        mimeType?: string;
        folderPath?: string;
        folderSegments?: string[];
        pageNumber?: number;
        sheetName?: string;
        cellReference?: string;
        slideNumber?: number;
        sectionTitle?: string;
        locationKey?: string;
        locationLabel?: string;
        snippet?: string;
      };
      score?: number;
    }>,
    language: SourceButtonsLanguage = "en",
  ): SourceButtonsAttachment | null {
    const fallbackTitle = (documentId: string): string =>
      `Document ${String(documentId || "").slice(0, 8)}`;

    // Convert chunks to RawSource format
    const sources: RawSource[] = chunks
      .filter((chunk) => chunk.documentId || chunk.metadata?.documentId)
      .map((chunk) => {
        const documentId = (chunk.documentId || chunk.metadata?.documentId)!;
        return {
          documentId,
          filename: chunk.metadata?.filename || fallbackTitle(documentId),
          mimeType: chunk.metadata?.mimeType,
          folderPath: chunk.metadata?.folderPath,
          folderSegments: chunk.metadata?.folderSegments,
          pageNumber: chunk.metadata?.pageNumber,
          sheetName: chunk.metadata?.sheetName,
          cellReference: chunk.metadata?.cellReference,
          slideNumber: chunk.metadata?.slideNumber,
          sectionTitle: chunk.metadata?.sectionTitle,
          locationKey:
            chunk.locationKey ||
            chunk.metadata?.locationKey ||
            undefined,
          locationLabel: chunk.metadata?.locationLabel,
          snippet: chunk.snippet || chunk.metadata?.snippet,
          score: chunk.score,
        };
      });

    return this.buildSourceButtons(sources, { context: "qa", language });
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Dedupe sources by documentId, keeping highest score.
   */
  private dedupeByDocumentAndLocation(sources: RawSource[]): RawSource[] {
    const seen = new Map<string, RawSource>();

    for (const source of sources) {
      const locationKey = String(source.locationKey || "").trim().toLowerCase();
      const locationFingerprint = [
        locationKey,
        source.pageNumber ?? "",
        source.slideNumber ?? "",
        String(source.sheetName || "").trim().toLowerCase(),
        String(source.cellReference || "").trim().toLowerCase(),
        String(source.sectionTitle || "").trim().toLowerCase(),
      ].join("|");
      const hasLocationFingerprint = Boolean(
        locationKey ||
          source.pageNumber ||
          source.slideNumber ||
          String(source.sheetName || "").trim() ||
          String(source.cellReference || "").trim() ||
          String(source.sectionTitle || "").trim(),
      );
      const snippetFingerprint = String(source.snippet || "")
        .trim()
        .toLowerCase();
      const dedupeKey = hasLocationFingerprint
        ? `${source.documentId}|${locationFingerprint}`
        : `${source.documentId}|snippet:${snippetFingerprint || "__none__"}`;
      const existing = seen.get(dedupeKey);
      if (!existing || (source.score ?? 0) > (existing.score ?? 0)) {
        seen.set(dedupeKey, source);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Convert raw source to SourceButton.
   */
  private rawToButton(source: RawSource): SourceButton {
    const inferredLocationKey =
      String(source.locationKey || "").trim() ||
      this.buildStableLocationKeyFromSource(source) ||
      undefined;
    const fallbackLocation = this.parseLocationKeyFallback(inferredLocationKey);
    const pageNumber = source.pageNumber ?? fallbackLocation.pageNumber ?? undefined;
    const sectionTitle =
      source.sectionTitle ||
      (fallbackLocation.chunkIndex !== null
        ? `chunk_${fallbackLocation.chunkIndex}`
        : undefined);
    const button: SourceButton = {
      documentId: source.documentId,
      title: source.filename,
      mimeType: source.mimeType,
      folderPath: source.folderPath,
      folderSegments: source.folderSegments,
      locationKey: inferredLocationKey,
      snippet: source.snippet,
    };

    // Add location if available
    if (pageNumber) {
      button.location = {
        type: "page",
        value: pageNumber,
        label: source.locationLabel || `Page ${pageNumber}`,
      };
    } else if (source.slideNumber) {
      button.location = {
        type: "slide",
        value: source.slideNumber,
        label: source.locationLabel || `Slide ${source.slideNumber}`,
      };
    } else if (source.cellReference) {
      button.location = {
        type: "cell",
        value: source.cellReference,
        label: source.locationLabel || source.cellReference,
      };
    } else if (source.sheetName) {
      button.location = {
        type: "sheet",
        value: source.sheetName,
        label: source.locationLabel || source.sheetName,
      };
    } else if (sectionTitle) {
      button.location = {
        type: "section",
        value: sectionTitle,
        label: source.locationLabel || sectionTitle,
      };
    }

    return button;
  }

  private buildStableLocationKeyFromSource(source: RawSource): string | null {
    const pageNumber =
      typeof source.pageNumber === "number" && Number.isFinite(source.pageNumber)
        ? Math.trunc(source.pageNumber)
        : null;
    const slideNumber =
      typeof source.slideNumber === "number" && Number.isFinite(source.slideNumber)
        ? Math.trunc(source.slideNumber)
        : null;
    const sheetName = String(source.sheetName || "").trim() || null;
    const cellReference = String(source.cellReference || "").trim() || null;
    const sectionTitle = String(source.sectionTitle || "").trim() || null;
    if (
      !pageNumber &&
      !slideNumber &&
      !sheetName &&
      !cellReference &&
      !sectionTitle
    ) {
      return null;
    }
    return stableLocationKey(
      source.documentId,
      {
        page: pageNumber,
        sheet: sheetName,
        slide: slideNumber,
        sectionKey: cellReference || sectionTitle,
      },
      "1",
    );
  }

  private toPositiveInt(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const normalized = Math.floor(value);
    if (normalized <= 0) return null;
    return normalized;
  }

  private parseLocationKeyFallback(
    rawLocationKey: unknown,
  ): { pageNumber: number | null; chunkIndex: number | null } {
    const locationKey = String(rawLocationKey || "").trim();
    if (!locationKey) return { pageNumber: null, chunkIndex: null };

    const pageMatch = locationKey.match(/\|p:(-?\d+)/i);
    const chunkMatch = locationKey.match(/\|c:(-?\d+)/i);
    const page = pageMatch ? Number(pageMatch[1] || Number.NaN) : Number.NaN;
    const chunk = chunkMatch ? Number(chunkMatch[1] || Number.NaN) : Number.NaN;

    return {
      pageNumber: Number.isFinite(page) && page > 0 ? page : null,
      chunkIndex: Number.isFinite(chunk) && chunk >= 0 ? chunk : null,
    };
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
  language: SourceButtonsLanguage = "en",
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
  _language: SourceButtonsLanguage = "en",
): StandardResponse {
  const service = getSourceButtonsService();
  const maxButtons = service.getDefaultMaxButtons("file_action");

  // For single file: use source_buttons
  // For multiple files: use source_buttons with multiple items
  const buttons: SourceButton[] = files
    .slice(0, maxButtons)
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
  language: SourceButtonsLanguage = "en",
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
