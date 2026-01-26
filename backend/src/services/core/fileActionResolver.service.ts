/**
 * FileActionResolver Service
 *
 * Resolves file action queries to structured requests with document IDs.
 * Never returns empty filename - always resolves to docId, candidates, or browse pill.
 */

import { PrismaClient } from '@prisma/client';

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

// Operator detection patterns (bank-driven approach)
const OPERATOR_PATTERNS: Record<string, { en: RegExp[]; pt: RegExp[]; es: RegExp[] }> = {
  open: {
    en: [
      /\b(open|launch|start|run)\s+(the\s+)?(file|document|spreadsheet|presentation|pdf)?\s*/i,
      /\bopen\s+(?:it|this|that)\b/i,
      /\bopen\s+(.+?)(?:\.(?:pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg|jpeg))\b/i,
    ],
    pt: [
      /\b(abrir|abra|abre)\s+(o\s+)?(arquivo|documento|planilha|apresentação)?\s*/i,
      /\babr(?:ir|a|e)\s+(?:ele|ela|isso|este|esta|esse|essa)\b/i,
    ],
    es: [
      /\b(abrir|abre|abra)\s+(el\s+)?(archivo|documento|hoja|presentación)?\s*/i,
    ],
  },
  locate_file: {
    en: [
      /\bwhere\s+(?:is|are)\s+(the\s+)?(.+?)(?:\?|$)/i,
      /\b(?:find|locate|search\s+for)\s+(the\s+)?(?:file|document)?\s*(.+)/i,
      /\bwhich\s+folder\s+(?:has|contains|is)\s+(.+)/i,
      /\blocate\s+(.+)/i,
    ],
    pt: [
      /\bonde\s+(?:está|fica|estão)\s+(o\s+|a\s+)?(.+?)(?:\?|$)/i,
      /\bcadê\s+(o\s+|a\s+)?(.+?)(?:\?|$)/i,
      /\bem\s+que\s+pasta\s+(?:está|fica)\s+(.+)/i,
      /\bqual\s+pasta\s+(?:tem|contém|está)\s+(.+)/i,
      /\blocalizar\s+(.+)/i,
      /\bencontrar\s+(.+)/i,
    ],
    es: [
      /\bdónde\s+está\s+(el\s+|la\s+)?(.+?)(?:\?|$)/i,
      /\ben\s+qué\s+carpeta\s+está\s+(.+)/i,
    ],
  },
  again: {
    en: [
      /\b(?:show|open|display)\s+(?:it|that|this)\s+again\b/i,
      /\bagain\b/i,
      /\bshow\s+(?:it|that|this)\b/i,
      /\bopen\s+(?:it|that|this)\b/i,
    ],
    pt: [
      /\b(?:mostrar|abrir|exibir)\s+(?:de\s+novo|novamente|outra\s+vez)\b/i,
      /\bde\s+novo\b/i,
      /\boutra\s+vez\b/i,
      /\bmostrar?\s+(?:ele|ela|isso|este|esta)\b/i,
      /\babr(?:ir|a|e)\s+(?:ele|ela|isso)\b/i,
    ],
    es: [
      /\b(?:mostrar|abrir)\s+(?:de\s+nuevo|otra\s+vez)\b/i,
    ],
  },
  preview: {
    en: [
      /\b(?:preview|show\s+me|display)\s+(the\s+)?(.+)/i,
      /\blet\s+me\s+see\s+(.+)/i,
    ],
    pt: [
      /\b(?:mostrar?|exibir?|visualizar?)\s+(o\s+|a\s+)?(.+)/i,
      /\bme\s+mostr(?:a|e)\s+(.+)/i,
    ],
    es: [
      /\b(?:mostrar|ver)\s+(el\s+|la\s+)?(.+)/i,
    ],
  },
  list: {
    en: [
      /\blist\s+(?:my\s+)?(?:files|documents|all)/i,
      /\bshow\s+(?:me\s+)?(?:my\s+)?(?:all\s+)?(?:files|documents)/i,
    ],
    pt: [
      /\blistar?\s+(?:meus?\s+)?(?:arquivos|documentos)/i,
      /\bmostrar?\s+(?:todos?\s+)?(?:meus?\s+)?(?:arquivos|documentos)/i,
    ],
    es: [
      /\blistar?\s+(?:mis\s+)?(?:archivos|documentos)/i,
    ],
  },
  filter: {
    en: [
      /\b(?:show|list|filter)\s+(?:only\s+)?(?:my\s+)?(\w+)\s+files/i,
      /\bfilter\s+by\s+(.+)/i,
    ],
    pt: [
      /\b(?:mostrar?|listar?|filtrar?)\s+(?:só\s+|apenas\s+)?(?:meus?\s+)?(?:arquivos\s+)?(\w+)/i,
    ],
    es: [
      /\bfiltrar?\s+por\s+(.+)/i,
    ],
  },
};

// Filename extraction patterns
const FILENAME_PATTERNS: RegExp[] = [
  // Explicit filename with extension
  /([A-Za-z0-9_\-\s]+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt|png|jpg|jpeg|md))/gi,
  // Quoted filename
  /["']([^"']+)["']/g,
  // After "file" or "document" keywords
  /(?:file|document|arquivo|documento)\s+(?:called\s+|named\s+|chamado\s+)?([A-Za-z0-9_\-\s]+)/gi,
];

// Follow-up indicators (references to previous file)
const FOLLOWUP_INDICATORS: Record<string, RegExp[]> = {
  en: [
    /\b(?:it|this|that|the\s+same|this\s+one|that\s+one)\b/i,
    /\bagain\b/i,
  ],
  pt: [
    /\b(?:ele|ela|isso|isto|este|esta|esse|essa|o\s+mesmo|a\s+mesma)\b/i,
    /\bde\s+novo\b/i,
    /\boutra\s+vez\b/i,
  ],
  es: [
    /\b(?:lo|la|esto|eso|el\s+mismo|la\s+misma)\b/i,
    /\bde\s+nuevo\b/i,
  ],
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
  private detectOperator(query: string, lang: 'en' | 'pt' | 'es'): FileActionOperator | null {
    const normalizedQuery = query.toLowerCase().trim();

    // Check each operator's patterns
    for (const [op, patterns] of Object.entries(OPERATOR_PATTERNS)) {
      const langPatterns = patterns[lang] || patterns.en;
      for (const pattern of langPatterns) {
        if (pattern.test(normalizedQuery)) {
          return op as FileActionOperator;
        }
      }
    }

    return null;
  }

  /**
   * Check if query is a follow-up reference to a previous file
   */
  private isFollowUpReference(query: string, lang: 'en' | 'pt' | 'es'): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const indicators = FOLLOWUP_INDICATORS[lang] || FOLLOWUP_INDICATORS.en;

    // Check for follow-up indicators
    for (const pattern of indicators) {
      if (pattern.test(normalizedQuery)) {
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
   */
  private normalizeFilename(filename: string): string {
    return filename
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['"]/g, '');
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
   */
  private calculateMatchScore(search: string, filename: string): number {
    // Exact match
    if (filename === search) return 1.0;

    // Contains exact search term
    if (filename.includes(search)) return 0.9;

    // Search term contains filename (partial)
    if (search.includes(filename.replace(/\.[^.]+$/, ''))) return 0.85;

    // Starts with search term
    if (filename.startsWith(search)) return 0.8;

    // Word-level matching
    const searchWords = search.split(/\s+/);
    const filenameWords = filename.replace(/\.[^.]+$/, '').split(/\s+/);

    let matchedWords = 0;
    for (const sw of searchWords) {
      if (filenameWords.some(fw => fw.includes(sw) || sw.includes(fw))) {
        matchedWords++;
      }
    }

    const wordScore = matchedWords / Math.max(searchWords.length, 1);

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
