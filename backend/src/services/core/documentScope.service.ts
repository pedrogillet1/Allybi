/**
 * DOCUMENT SCOPE DETECTION SERVICE (REDO 5)
 *
 * Detects document name mentions in queries and resolves them to document IDs.
 * This prevents cross-document mixing by scoping retrieval to mentioned documents.
 *
 * Examples:
 * - "summarize the Rosewood Fund document" → scope to Rosewood Fund PDF
 * - "in contract.pdf, what are the terms?" → scope to contract.pdf
 * - "what does that spreadsheet say about July?" → scope to last-referenced spreadsheet
 * - "compare the LMR and Lone Star documents" → scope to both
 *
 * Contract:
 * - When a document is explicitly mentioned, ONLY retrieve from that document
 * - When no document is mentioned, allow cross-document retrieval (normal behavior)
 * - When "that/this document" is used, use conversation context to resolve
 */

import prisma from '../../config/database';
import { LanguageCode } from '../../types/intentV3.types';

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentScopeResult {
  /** Whether a specific document scope was detected */
  hasScope: boolean;

  /** Type of scope detection */
  scopeType: 'none' | 'by_name' | 'by_reference' | 'by_type' | 'multi_doc';

  /** Extracted document name mentions from query */
  mentionedNames: string[];

  /** Resolved document IDs (empty if no match or no scope) */
  resolvedDocumentIds: string[];

  /** Unresolved names (mentioned but not found) */
  unresolvedNames: string[];

  /** Whether to strictly filter (true) or just boost (false) */
  strictFilter: boolean;

  /** Debug info */
  debug?: {
    pattern?: string;
    confidence?: number;
  };
}

interface ResolvedDocument {
  id: string;
  filename: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial';
}

// ============================================================================
// PATTERNS - Document mention detection
// ============================================================================

const DOCUMENT_NAME_PATTERNS: Record<LanguageCode, RegExp[]> = {
  en: [
    // "the X document/file/pdf"
    /\bthe\s+([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})\s+(document|file|pdf|spreadsheet|presentation|report)\b/i,
    // "in/from file/document named X"
    /\b(?:in|from)\s+(?:the\s+)?(?:file|document|pdf)\s+(?:named|called)?\s*[""']?([A-Za-z0-9][A-Za-z0-9\s._-]{2,50})[""']?\b/i,
    // "document/file X" (quoted or with extension)
    /\b(?:document|file|pdf)\s+[""']?([A-Za-z0-9][A-Za-z0-9\s._-]{2,50}(?:\.[a-z]{2,5}))[""']?\b/i,
    // "X.pdf", "X.xlsx", etc. (filename with extension)
    /\b([A-Za-z0-9][A-Za-z0-9\s_-]{1,40})\.(pdf|xlsx|xls|docx|doc|pptx|ppt|csv|txt)\b/i,
    // "from the X" (when X is likely a document name)
    /\bfrom\s+the\s+([A-Z][A-Za-z0-9\s]{2,30})\b(?:\s+(?:document|file|report|spreadsheet))?/,
    // "summarize/analyze/review the X" (common document action verbs)
    /\b(?:summarize|analyze|review|read|open)\s+(?:the\s+)?([A-Z][A-Za-z0-9\s]{2,30})\s+(?:document|file|report|pdf)?\b/i,
  ],
  pt: [
    // "o documento/arquivo X"
    /\bo\s+(?:documento|arquivo|pdf|planilha)\s+([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})\b/i,
    // "no arquivo/documento X"
    /\b(?:no|na|do|da)\s+(?:arquivo|documento|pdf|planilha)\s+([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})\b/i,
    // "chamado X" / "named X"
    /\b(?:chamado|nomeado)\s+[""']?([A-Za-z0-9][A-Za-z0-9\s._-]{2,50})[""']?\b/i,
  ],
  es: [
    // "el documento/archivo X"
    /\bel\s+(?:documento|archivo|pdf|hoja)\s+([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})\b/i,
    // "en el archivo/documento X"
    /\b(?:en|del)\s+(?:el\s+)?(?:archivo|documento|pdf)\s+([A-Za-z0-9][A-Za-z0-9\s_-]{2,40})\b/i,
  ],
};

// Reference patterns (this/that document - use conversation context)
const REFERENCE_PATTERNS: Record<LanguageCode, RegExp[]> = {
  en: [
    /\b(?:that|this|the)\s+(?:document|file|pdf|spreadsheet|report)\b/i,
    /\b(?:that|this|the)\s+(?:same\s+)?(?:one|doc)\b/i,
    /\bbased on (?:that|this|the above)\b/i,
  ],
  pt: [
    /\b(?:esse|este|aquele)\s+(?:documento|arquivo|pdf|planilha)\b/i,
    /\bo mesmo\s+(?:documento|arquivo)\b/i,
  ],
  es: [
    /\b(?:ese|este|aquel)\s+(?:documento|archivo|pdf|hoja)\b/i,
    /\bel mismo\s+(?:documento|archivo)\b/i,
  ],
};

// Document type patterns (the spreadsheet, the PDF)
const TYPE_PATTERNS: Record<LanguageCode, RegExp[]> = {
  en: [
    /\bthe\s+(pdf|spreadsheet|presentation|excel|powerpoint|word)\b/i,
    /\b(?:in|from)\s+the\s+(xlsx?|pptx?|docx?)\s+(?:file)?\b/i,
  ],
  pt: [
    /\b(?:o|a)\s+(pdf|planilha|apresentação|excel)\b/i,
  ],
  es: [
    /\b(?:el|la)\s+(pdf|hoja|presentación|excel)\b/i,
  ],
};

// MIME type mapping for type patterns
const TYPE_TO_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  spreadsheet: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'],
  excel: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  presentation: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'],
  powerpoint: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ppt: ['application/vnd.ms-powerpoint'],
  word: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc: ['application/msword'],
};

// ============================================================================
// SERVICE
// ============================================================================

export class DocumentScopeService {
  /**
   * Detect document scope from query and resolve to document IDs.
   *
   * @param query - User query
   * @param userId - User ID for document lookup
   * @param language - Query language
   * @param lastDocumentIds - Document IDs from previous conversation turn (for reference resolution)
   */
  async detectScope(
    query: string,
    userId: string,
    language: LanguageCode,
    lastDocumentIds?: string[]
  ): Promise<DocumentScopeResult> {
    const result: DocumentScopeResult = {
      hasScope: false,
      scopeType: 'none',
      mentionedNames: [],
      resolvedDocumentIds: [],
      unresolvedNames: [],
      strictFilter: false,
    };

    // Step 1: Check for reference patterns (this/that document)
    const referenceMatch = this.matchReferencePatterns(query, language);
    if (referenceMatch && lastDocumentIds && lastDocumentIds.length > 0) {
      result.hasScope = true;
      result.scopeType = 'by_reference';
      result.resolvedDocumentIds = lastDocumentIds;
      result.strictFilter = true; // Strict - user explicitly referenced previous doc
      result.debug = { pattern: 'reference', confidence: 0.9 };
      console.log(`[DocScope] REFERENCE detected → using ${lastDocumentIds.length} docs from previous turn`);
      return result;
    }

    // Step 2: Check for document name patterns
    const nameMatches = this.matchNamePatterns(query, language);
    if (nameMatches.length > 0) {
      result.mentionedNames = nameMatches;

      // Resolve names to document IDs
      const resolved = await this.resolveNames(nameMatches, userId);
      result.resolvedDocumentIds = resolved.map(r => r.id);
      result.unresolvedNames = nameMatches.filter(
        name => !resolved.some(r => this.nameMatches(r.filename, name))
      );

      if (result.resolvedDocumentIds.length > 0) {
        result.hasScope = true;
        result.scopeType = result.resolvedDocumentIds.length > 1 ? 'multi_doc' : 'by_name';
        result.strictFilter = true; // Strict - user explicitly named a document
        result.debug = {
          pattern: 'by_name',
          confidence: resolved[0]?.confidence || 0.8,
        };
        console.log(`[DocScope] NAME detected: "${nameMatches.join('", "')}" → resolved ${result.resolvedDocumentIds.length} docs`);
      } else {
        console.log(`[DocScope] NAME detected but unresolved: "${nameMatches.join('", "')}"`);
      }

      return result;
    }

    // Step 3: Check for type patterns (the spreadsheet, the PDF)
    const typeMatch = this.matchTypePatterns(query, language);
    if (typeMatch) {
      const mimeTypes = TYPE_TO_MIME[typeMatch.toLowerCase()] || [];
      if (mimeTypes.length > 0) {
        // Find documents of this type for the user
        const typeDocs = await this.findDocumentsByType(userId, mimeTypes, 1);
        if (typeDocs.length === 1) {
          // Only one document of this type - scope to it
          result.hasScope = true;
          result.scopeType = 'by_type';
          result.resolvedDocumentIds = [typeDocs[0].id];
          result.strictFilter = true;
          result.debug = { pattern: `type:${typeMatch}`, confidence: 0.85 };
          console.log(`[DocScope] TYPE detected: "${typeMatch}" → single doc match: ${typeDocs[0].filename}`);
          return result;
        } else if (typeDocs.length > 1 && lastDocumentIds) {
          // Multiple docs of this type - use context to disambiguate
          const contextMatch = typeDocs.find(d => lastDocumentIds.includes(d.id));
          if (contextMatch) {
            result.hasScope = true;
            result.scopeType = 'by_type';
            result.resolvedDocumentIds = [contextMatch.id];
            result.strictFilter = true;
            result.debug = { pattern: `type:${typeMatch}+context`, confidence: 0.8 };
            console.log(`[DocScope] TYPE detected: "${typeMatch}" → context match: ${contextMatch.filename}`);
            return result;
          }
        }
      }
    }

    // No scope detected
    return result;
  }

  /**
   * Check for reference patterns (this/that document)
   */
  private matchReferencePatterns(query: string, language: LanguageCode): boolean {
    const patterns = REFERENCE_PATTERNS[language] || REFERENCE_PATTERNS['en'];
    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Extract document names from query using patterns
   */
  private matchNamePatterns(query: string, language: LanguageCode): string[] {
    const patterns = DOCUMENT_NAME_PATTERNS[language] || DOCUMENT_NAME_PATTERNS['en'];
    const names: string[] = [];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        // Get the captured group (document name)
        const captured = match[1]?.trim();
        if (captured && captured.length >= 3 && !names.includes(captured)) {
          // Clean up the name
          const cleaned = captured.replace(/[""']/g, '').trim();
          if (cleaned.length >= 3) {
            names.push(cleaned);
          }
        }
      }
    }

    return names;
  }

  /**
   * Check for type patterns (the spreadsheet, the PDF)
   */
  private matchTypePatterns(query: string, language: LanguageCode): string | null {
    const patterns = TYPE_PATTERNS[language] || TYPE_PATTERNS['en'];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }

    return null;
  }

  /**
   * Resolve document names to document IDs using fuzzy matching
   */
  private async resolveNames(names: string[], userId: string): Promise<ResolvedDocument[]> {
    const resolved: ResolvedDocument[] = [];

    for (const name of names) {
      // Try exact match first
      let docs = await prisma.document.findMany({
        where: {
          userId,
          status: { in: ['available', 'enriching', 'ready', 'completed'] },
          filename: { equals: name, mode: 'insensitive' },
        },
        select: { id: true, filename: true },
        take: 1,
      });

      if (docs.length > 0) {
        resolved.push({
          id: docs[0].id,
          filename: docs[0].filename,
          confidence: 1.0,
          matchType: 'exact',
        });
        continue;
      }

      // Try contains match
      docs = await prisma.document.findMany({
        where: {
          userId,
          status: { in: ['available', 'enriching', 'ready', 'completed'] },
          filename: { contains: name, mode: 'insensitive' },
        },
        select: { id: true, filename: true },
        take: 3,
      });

      if (docs.length === 1) {
        resolved.push({
          id: docs[0].id,
          filename: docs[0].filename,
          confidence: 0.85,
          matchType: 'partial',
        });
      } else if (docs.length > 1) {
        // Multiple matches - use the shortest filename (likely most specific)
        const bestMatch = docs.sort((a, b) => a.filename.length - b.filename.length)[0];
        resolved.push({
          id: bestMatch.id,
          filename: bestMatch.filename,
          confidence: 0.7,
          matchType: 'fuzzy',
        });
      }

      // Try word-by-word matching if no results yet
      if (docs.length === 0) {
        const words = name.split(/\s+/).filter(w => w.length >= 3);
        for (const word of words) {
          docs = await prisma.document.findMany({
            where: {
              userId,
              status: { in: ['available', 'enriching', 'ready', 'completed'] },
              filename: { contains: word, mode: 'insensitive' },
            },
            select: { id: true, filename: true },
            take: 3,
          });

          if (docs.length === 1) {
            resolved.push({
              id: docs[0].id,
              filename: docs[0].filename,
              confidence: 0.6,
              matchType: 'fuzzy',
            });
            break;
          }
        }
      }
    }

    return resolved;
  }

  /**
   * Find documents by MIME type
   */
  private async findDocumentsByType(
    userId: string,
    mimeTypes: string[],
    limit?: number
  ): Promise<Array<{ id: string; filename: string }>> {
    const docs = await prisma.document.findMany({
      where: {
        userId,
        status: { in: ['available', 'enriching', 'ready', 'completed'] },
        mimeType: { in: mimeTypes },
      },
      select: { id: true, filename: true },
      orderBy: { createdAt: 'desc' },
      take: limit ? limit + 5 : undefined, // Get a few extra to check count
    });

    return docs;
  }

  /**
   * Check if two document names match (case-insensitive, ignoring extension)
   */
  private nameMatches(filename: string, searchName: string): boolean {
    const normalizedFilename = filename.toLowerCase().replace(/\.[^/.]+$/, '');
    const normalizedSearch = searchName.toLowerCase().replace(/\.[^/.]+$/, '');
    return normalizedFilename.includes(normalizedSearch) || normalizedSearch.includes(normalizedFilename);
  }
}

// Export singleton instance
export const documentScopeService = new DocumentScopeService();
