/**
 * FileActionResolver Service
 *
 * Resolves file action queries to structured requests with document IDs.
 * Never returns empty filename - always resolves to docId, candidates, or browse pill.
 *
 * BANK-DRIVEN: All operator detection uses pattern_bank_master.json via patternBankLoader.
 * NO HARDCODED PATTERNS ALLOWED.
 */

import { PrismaClient } from '@prisma/client';
import { loadPatternBank, matchesKeywords } from '../core/runtimePatterns.service';

// Types
export type FileActionOperator =
  | 'open'
  | 'locate_file'
  | 'again'
  | 'list'
  | 'filter'
  | 'sort'
  | 'group'
  | 'preview'
  | 'download';

export interface FileCandidate {
  docId: string;
  title: string;
  mimeType: string;
  folderPath: string;
  score: number;
}

export interface FileActionRequest {
  operator: FileActionOperator;
  resolvedDocId?: string;
  resolvedTitle?: string;
  candidates?: FileCandidate[];
  needsDisambiguation: boolean;
  showBrowsePill: boolean;
  extractedFilename?: string;
  language: 'en' | 'pt' | 'es';
}

export interface ConversationState {
  lastReferencedFileId?: string;
  lastReferencedFileName?: string;
  lastDocScope?: string[];
  lastSpreadsheetContext?: {
    docId: string;
    sheetName?: string;
  };
}

export interface DocumentInventoryItem {
  id: string;
  filename: string;
  mimeType: string;
  folderId?: string;
  folderPath?: string;
}

// ============================================================================
// BANK-DRIVEN OPERATOR DETECTION
// All patterns loaded from pattern_bank_master.json via patternBankLoader
// NO HARDCODED PATTERNS - this ensures sort/group/filter/etc are all recognized
// ============================================================================

// Operator priority order: more specific operators checked first
// IMPORTANT: group and sort MUST be before list to avoid false matches
const OPERATOR_PRIORITY: FileActionOperator[] = [
  'again',       // Check first: references to previous file
  'locate_file', // "where is X" - specific
  'group',       // "group by folder" - BEFORE list
  'sort',        // "sort by date" - BEFORE list
  'filter',      // "only PDFs" - BEFORE list
  'preview',     // "preview X"
  'download',    // "download X"
  'open',        // "open X" - specific file
  'list',        // Generic fallback - MUST BE LAST
];

// Filename extraction patterns (kept as regex for parsing, not routing)
const FILENAME_PATTERNS: RegExp[] = [
  // Explicit filename with extension
  /([A-Za-z0-9_\-\s]+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg|jpeg|md))/gi,
  // Quoted filename
  /["']([^"']+)["']/g,
  // After "file" or "document" keywords
  /(?:file|document|arquivo|documento)\s+(?:called\s+|named\s+|chamado\s+)?([A-Za-z0-9_\-\s]+)/gi,
];

// Follow-up indicators loaded from bank - used for "again" detection
// These are pronouns/references, not operators, so kept as simple lists
const FOLLOWUP_PRONOUNS: Record<string, string[]> = {
  en: ['it', 'this', 'that', 'the same', 'this one', 'that one'],
  pt: ['ele', 'ela', 'isso', 'isto', 'este', 'esta', 'esse', 'essa', 'o mesmo', 'a mesma'],
  es: ['lo', 'la', 'esto', 'eso', 'el mismo', 'la misma'],
};

export class FileActionResolverService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Main entry point: Resolve a file action query to a structured request
   */
  async resolveFileActionRequest(
    query: string,
    lang: 'en' | 'pt' | 'es',
    conversationState: ConversationState,
    inventory: DocumentInventoryItem[]
  ): Promise<FileActionRequest> {
    // 1. Detect operator
    const operator = this.detectOperator(query, lang);

    // 2. Check if this is a follow-up reference
    if (this.isFollowUpReference(query, lang)) {
      if (conversationState.lastReferencedFileId) {
        const doc = inventory.find(d => d.id === conversationState.lastReferencedFileId);
        if (doc) {
          return {
            operator: operator || 'again',
            resolvedDocId: doc.id,
            resolvedTitle: doc.filename,
            needsDisambiguation: false,
            showBrowsePill: false,
            language: lang,
          };
        }
      }
      // No last reference - need disambiguation
      return {
        operator: operator || 'again',
        needsDisambiguation: true,
        showBrowsePill: true,
        language: lang,
      };
    }

    // 3. Extract filename from query
    const extractedFilename = this.extractFilename(query);

    // 4. If we have a filename, try to match against inventory
    if (extractedFilename) {
      const candidates = this.fuzzyMatchInventory(extractedFilename, inventory);

      if (candidates.length === 1 && candidates[0].score >= 0.8) {
        // Single high-confidence match
        return {
          operator: operator || 'open',
          resolvedDocId: candidates[0].docId,
          resolvedTitle: candidates[0].title,
          extractedFilename,
          needsDisambiguation: false,
          showBrowsePill: false,
          language: lang,
        };
      } else if (candidates.length > 0) {
        // Multiple candidates or low confidence
        return {
          operator: operator || 'open',
          candidates: candidates.slice(0, 5), // Top 5
          extractedFilename,
          needsDisambiguation: true,
          showBrowsePill: false,
          language: lang,
        };
      }
    }

    // 5. No filename extracted or no matches - show browse pill
    return {
      operator: operator || 'open',
      extractedFilename: extractedFilename || undefined,
      needsDisambiguation: true,
      showBrowsePill: true,
      language: lang,
    };
  }

  /**
   * Detect the file action operator from the query
   */
  /**
   * BANK-DRIVEN operator detection
   * Uses pattern_bank_master.json via patternBankLoader
   * Checks operators in priority order to ensure sort/group aren't shadowed by list
   */
  private detectOperator(query: string, lang: 'en' | 'pt' | 'es'): FileActionOperator | null {
    const bank = loadPatternBank();
    const q = query.toLowerCase().trim();

    // Check operators in priority order (most specific first)
    for (const operator of OPERATOR_PRIORITY) {
      const patterns = bank.fileActionOperators[operator];
      if (!patterns) continue;

      // Check all languages, prioritizing the detected language
      const langsToCheck = [lang, 'en', 'pt', 'es'].filter((l, i, arr) => arr.indexOf(l) === i);

      for (const checkLang of langsToCheck) {
        const keywords = patterns[checkLang as keyof typeof patterns];
        if (!keywords) continue;

        for (const keyword of keywords) {
          if (q.includes(keyword.toLowerCase())) {
            console.log(`[FileActionResolver] Detected operator=${operator} from keyword="${keyword}" (lang=${checkLang})`);
            return operator;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if query is a follow-up reference to a previous file
   */
  /**
   * Check if query is a follow-up reference using bank patterns
   */
  private isFollowUpReference(query: string, lang: 'en' | 'pt' | 'es'): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const bank = loadPatternBank();

    // First check if query matches 'again' operator patterns from bank
    const againPatterns = bank.fileActionOperators.again;
    if (againPatterns) {
      for (const checkLang of [lang, 'en', 'pt', 'es']) {
        const keywords = againPatterns[checkLang as keyof typeof againPatterns];
        if (!keywords) continue;
        for (const keyword of keywords) {
          if (normalizedQuery.includes(keyword.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // Also check for pronoun references (it, this, that, etc.)
    const pronouns = FOLLOWUP_PRONOUNS[lang] || FOLLOWUP_PRONOUNS.en;
    for (const pronoun of pronouns) {
      // Check for word boundary match
      const regex = new RegExp(`\\b${pronoun.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (regex.test(normalizedQuery)) {
        // Make sure it's not a full filename query
        const hasExplicitFilename = FILENAME_PATTERNS.some(p => {
          p.lastIndex = 0;
          return p.test(query);
        });
        if (!hasExplicitFilename) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract filename from query using multiple strategies
   */
  private extractFilename(query: string): string | null {
    // Strategy 1: Look for explicit filename with extension
    const extensionMatch = query.match(/([A-Za-z0-9_\-\s()]+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg|jpeg|md))/i);
    if (extensionMatch) {
      return this.normalizeFilename(extensionMatch[1]);
    }

    // Strategy 2: Look for quoted strings
    const quotedMatch = query.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      return this.normalizeFilename(quotedMatch[1]);
    }

    // Strategy 3: Extract from common patterns
    const patterns = [
      // "open the X" / "open X"
      /\b(?:open|abrir?|abra)\s+(?:the\s+|o\s+|a\s+)?([A-Za-z0-9_\-\s()]+?)(?:\s*\.|$|\?)/i,
      // "where is X" / "onde está X"
      /\b(?:where\s+is|onde\s+está|cadê)\s+(?:the\s+|o\s+|a\s+|my\s+|meu\s+|minha\s+)?([A-Za-z0-9_\-\s()]+?)(?:\s*\?|$)/i,
      // "file X" / "document X"
      /\b(?:file|document|arquivo|documento)\s+([A-Za-z0-9_\-\s()]+)/i,
      // "the X file/document"
      /\bthe\s+([A-Za-z0-9_\-\s()]+)\s+(?:file|document)/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const extracted = this.normalizeFilename(match[1]);
        // Filter out common false positives
        if (extracted && !this.isCommonWord(extracted)) {
          return extracted;
        }
      }
    }

    return null;
  }

  /**
   * Normalize a filename for matching
   * Strips common file type words that don't help matching
   */
  private normalizeFilename(filename: string): string {
    // Common words that describe file types but don't appear in actual filenames
    const fileTypeWords = /\b(presentation|spreadsheet|document|file|pdf|excel|word|powerpoint|slide|slides|worksheet|workbook|arquivo|documento|planilha|apresentação)\b/gi;

    return filename
      .trim()
      .replace(fileTypeWords, '')
      .replace(/\s+/g, ' ')
      .replace(/['"]/g, '')
      .trim();
  }

  /**
   * Check if a string is a common word that shouldn't be treated as a filename
   */
  private isCommonWord(str: string): boolean {
    const commonWords = new Set([
      'it', 'this', 'that', 'the', 'a', 'an', 'my', 'file', 'document', 'pdf',
      'ele', 'ela', 'isso', 'isto', 'o', 'a', 'um', 'uma', 'meu', 'minha', 'arquivo', 'documento',
      'again', 'de novo', 'outra vez', 'please', 'por favor',
    ]);
    return commonWords.has(str.toLowerCase());
  }

  /**
   * Fuzzy match extracted filename against inventory
   */
  private fuzzyMatchInventory(
    searchTerm: string,
    inventory: DocumentInventoryItem[]
  ): FileCandidate[] {
    const normalizedSearch = searchTerm.toLowerCase().replace(/[_\-]/g, ' ');
    const candidates: FileCandidate[] = [];

    for (const doc of inventory) {
      const normalizedFilename = doc.filename.toLowerCase().replace(/[_\-]/g, ' ');
      const score = this.calculateMatchScore(normalizedSearch, normalizedFilename);

      if (score > 0.3) {
        candidates.push({
          docId: doc.id,
          title: doc.filename,
          mimeType: doc.mimeType,
          folderPath: doc.folderPath || '',
          score,
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }

  /**
   * Calculate match score between search term and filename
   * Improved: All search words matching = high confidence even if filename has extra words
   */
  private calculateMatchScore(search: string, filename: string): number {
    // Exact match
    if (filename === search) return 1.0;

    // Contains exact search term
    if (filename.includes(search)) return 0.95;

    // Search term contains filename (partial)
    if (search.includes(filename.replace(/\.[^.]+$/, ''))) return 0.9;

    // Starts with search term
    if (filename.startsWith(search)) return 0.85;

    // Word-level matching (improved)
    const searchWords = search.split(/\s+/).filter(w => w.length > 1);
    const filenameWords = filename.replace(/\.[^.]+$/, '').split(/\s+/).filter(w => w.length > 1);

    let matchedWords = 0;
    for (const sw of searchWords) {
      if (filenameWords.some(fw => fw.includes(sw) || sw.includes(fw))) {
        matchedWords++;
      }
    }

    // If ALL search words match (even if filename has more words), high confidence
    if (matchedWords === searchWords.length && searchWords.length >= 2) {
      // All search words found in filename - very good match
      return 0.85;
    }

    // If most search words match
    const wordScore = matchedWords / Math.max(searchWords.length, 1);
    if (wordScore >= 0.8) {
      return 0.75;
    }

    // Levenshtein-like character overlap
    const charOverlap = this.calculateCharOverlap(search, filename);

    return Math.max(wordScore * 0.7, charOverlap * 0.5);
  }

  /**
   * Calculate character overlap ratio
   */
  private calculateCharOverlap(a: string, b: string): number {
    const setA = new Set(a.toLowerCase());
    const setB = new Set(b.toLowerCase());

    let overlap = 0;
    for (const char of setA) {
      if (setB.has(char)) overlap++;
    }

    return overlap / Math.max(setA.size, setB.size);
  }

  /**
   * Get user's document inventory
   */
  async getInventory(userId: string): Promise<DocumentInventoryItem[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        folderId: true,
      },
    });

    // Get folder names for documents with folderId
    const folderIds = [...new Set(documents.filter(d => d.folderId).map(d => d.folderId as string))];
    const folders = folderIds.length > 0
      ? await this.prisma.folder.findMany({
          where: { id: { in: folderIds } },
          select: { id: true, name: true },
        })
      : [];

    const folderMap = new Map(folders.map(f => [f.id, f.name]));

    return documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mimeType || 'application/octet-stream',
      folderId: doc.folderId || undefined,
      folderPath: doc.folderId ? folderMap.get(doc.folderId) || '' : '',
    }));
  }
}

// Singleton instance
let instance: FileActionResolverService | null = null;

export function getFileActionResolver(prisma?: PrismaClient): FileActionResolverService {
  if (!instance) {
    instance = new FileActionResolverService(prisma);
  }
  return instance;
}
