/**
 * FILE SEARCH SERVICE
 *
 * Provides file search capabilities for the file_actions intent.
 * Enables queries like "where is file X", "find document named Y".
 */

import prisma from '../config/database';
import { createDocMarker } from './utils/markerUtils';
import { isContentQuestion } from './core/contentGuard.service';

// ============================================================================
// FAST AVAILABILITY: Document statuses that are usable in chat/search
// uploaded → available → enriching → ready
// ============================================================================
const USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed'];

// ============================================================================
// TYPES
// ============================================================================

export interface FileSearchResult {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  folderId: string | null;
  folderPath: string | null;
  createdAt: Date;
  status: string;
}

export type FileActionType =
  | 'SHOW_FILE'      // Preview/locate file (with optional location message)
  | 'OPEN_FILE'      // Open file immediately
  | 'SELECT_FILE'    // Multiple matches, user picks one
  | 'LIST_FOLDER'    // Show folder contents
  | 'NOT_FOUND';     // No match found

export interface FileActionResponse {
  type: 'file_action';
  action: FileActionType;
  message?: string;
  files: FileSearchResult[];
}

// ============================================================================
// SERVICE
// ============================================================================

class FileSearchService {
  /**
   * Search documents by filename pattern (fuzzy match)
   * Improved: Splits search term into words and matches any word
   */
  async searchByName(
    userId: string,
    searchTerm: string,
    options: { limit?: number; exactMatch?: boolean } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 10, exactMatch = false } = options;

    // Normalize search term
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      return [];
    }

    try {
      let documents: any[] = [];

      // Check if term contains OR operator (e.g., "Lone|LMR")
      const orTerms = term.includes('|') ? term.split('|').map(t => t.trim()).filter(t => t.length > 0) : null;

      if (exactMatch) {
        // Exact match mode
        documents = await prisma.document.findMany({
          where: {
            userId,
            status: { in: USABLE_STATUSES },
            filename: { equals: searchTerm, mode: 'insensitive' }
          },
          include: {
            folder: {
              select: { id: true, name: true, parentFolderId: true }
            }
          },
          take: limit,
          orderBy: [{ filename: 'asc' }]
        });
      } else if (orTerms && orTerms.length > 1) {
        // Handle OR search (e.g., "Lone|LMR" means search for files containing "Lone" OR "LMR")
        documents = await prisma.document.findMany({
          where: {
            userId,
            status: { in: USABLE_STATUSES },
            OR: orTerms.map(t => ({
              filename: { contains: t, mode: 'insensitive' as const }
            }))
          },
          include: {
            folder: {
              select: { id: true, name: true, parentFolderId: true }
            }
          },
          take: limit,
          orderBy: [{ filename: 'asc' }]
        });
      } else {
        // IMPROVED FUZZY SEARCH:
        // 1. First try exact substring match
        documents = await prisma.document.findMany({
          where: {
            userId,
            status: { in: USABLE_STATUSES },
            filename: { contains: term, mode: 'insensitive' }
          },
          include: {
            folder: {
              select: { id: true, name: true, parentFolderId: true }
            }
          },
          take: limit,
          orderBy: [{ filename: 'asc' }]
        });

        // 2. If no exact match, try word-by-word matching with enhanced normalization
        if (documents.length === 0) {
          // P0-3: Normalize function to strip extensions, special chars, version numbers
          const normalizeForMatch = (text: string): string => {
            return text
              .toLowerCase()
              .replace(/\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|gif)$/i, '') // strip extension
              .replace(/\s*v\d+(\.\d+)*\s*/gi, ' ') // strip version numbers like "v3" or "v2.1"
              .replace(/[-_]/g, ' ') // convert dashes/underscores to spaces
              .replace(/[^a-z0-9\s]/gi, '') // remove special chars
              .replace(/\s+/g, ' ') // normalize whitespace
              .trim();
          };

          // Extract meaningful words (remove common stop words)
          const stopWords = ['the', 'a', 'an', 'is', 'are', 'in', 'on', 'at', 'to', 'for',
                            'of', 'and', 'or', 'my', 'your', 'this', 'that', 'it',
                            'file', 'document', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'pptx'];
          const normalizedTerm = normalizeForMatch(term);
          const words = normalizedTerm.split(/\s+/)
            .filter(w => w.length >= 2 && !stopWords.includes(w));

          if (words.length > 0) {
            // Search for documents containing any of the meaningful words
            // Use OR conditions with contains for each word
            const allDocs = await prisma.document.findMany({
              where: {
                userId,
                status: { in: USABLE_STATUSES }
              },
              include: {
                folder: {
                  select: { id: true, name: true, parentFolderId: true }
                }
              },
              orderBy: [{ filename: 'asc' }]
            });

            // Score documents by how many words match (using normalized filename)
            const scoredDocs = allDocs.map(doc => {
              const normalizedFilename = normalizeForMatch(doc.filename);
              let matchScore = 0;
              let matchedWords = 0;
              for (const word of words) {
                if (normalizedFilename.includes(word)) {
                  matchScore += word.length; // Longer matches score higher
                  matchedWords++;
                }
              }
              // Bonus: If ALL words match, boost score significantly
              if (matchedWords === words.length && words.length > 1) {
                matchScore += 100;
              }
              return { doc, matchScore, matchedWords };
            }).filter(d => d.matchedWords > 0)  // Only keep docs with at least one word match
              .sort((a, b) => {
                // Sort by matched words first, then by score
                if (b.matchedWords !== a.matchedWords) return b.matchedWords - a.matchedWords;
                return b.matchScore - a.matchScore;
              });

            documents = scoredDocs.slice(0, limit).map(d => d.doc);
          }
        }
      }

      // Build results with folder paths
      const results: FileSearchResult[] = [];

      for (const doc of documents) {
        const folderPath = doc.folder
          ? await this.buildFolderPath(userId, doc.folder)
          : null;

        results.push({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          folderId: doc.folderId,
          folderPath,
          createdAt: doc.createdAt,
          status: doc.status
        });
      }

      return results;
    } catch (error) {
      console.error('[FileSearchService] Search error:', error);
      return [];
    }
  }

  /**
   * Build full folder path (e.g., "Legal/Contracts/2024")
   */
  async buildFolderPath(
    userId: string,
    folder: { id: string; name: string; parentFolderId: string | null }
  ): Promise<string> {
    const pathParts: string[] = [folder.name];
    let currentParentId = folder.parentFolderId;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loops

    while (currentParentId && depth < maxDepth) {
      const parent = await prisma.folder.findFirst({
        where: { id: currentParentId, userId },
        select: { id: true, name: true, parentFolderId: true }
      });

      if (!parent) break;

      pathParts.unshift(parent.name);
      currentParentId = parent.parentFolderId;
      depth++;
    }

    return pathParts.join(' / ');
  }

  /**
   * Get single document by ID
   */
  async getDocumentById(userId: string, documentId: string): Promise<FileSearchResult | null> {
    try {
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        }
      });

      if (!doc) return null;

      const folderPath = doc.folder
        ? await this.buildFolderPath(userId, doc.folder)
        : null;

      return {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        folderId: doc.folderId,
        folderPath,
        createdAt: doc.createdAt,
        status: doc.status
      };
    } catch (error) {
      console.error('[FileSearchService] getDocumentById error:', error);
      return null;
    }
  }

  /**
   * List documents in a specific folder
   */
  async listFolderContents(
    userId: string,
    folderId: string | null,
    options: { limit?: number } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 20 } = options;

    try {
      // Search ALL user documents when folderId is null (not just root folder)
      // Use USABLE_STATUSES to include available, enriching, ready, and completed documents
      const whereClause = folderId !== null
        ? { userId, folderId, status: { in: USABLE_STATUSES } }
        : { userId, status: { in: USABLE_STATUSES } }; // No folder filter = search ALL files

      const documents = await prisma.document.findMany({
        where: whereClause,
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        },
        take: limit,
        orderBy: { filename: 'asc' }
      });

      const results: FileSearchResult[] = [];

      for (const doc of documents) {
        const folderPath = doc.folder
          ? await this.buildFolderPath(userId, doc.folder)
          : null;

        results.push({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          folderId: doc.folderId,
          folderPath,
          createdAt: doc.createdAt,
          status: doc.status
        });
      }

      return results;
    } catch (error) {
      console.error('[FileSearchService] listFolderContents error:', error);
      return [];
    }
  }

  /**
   * Find folder by name pattern
   */
  async findFolderByName(userId: string, folderName: string): Promise<{
    id: string;
    name: string;
    path: string;
  } | null> {
    try {
      const folder = await prisma.folder.findFirst({
        where: {
          userId,
          name: { contains: folderName, mode: 'insensitive' }
        },
        select: { id: true, name: true, parentFolderId: true }
      });

      if (!folder) return null;

      const path = await this.buildFolderPath(userId, folder);

      return {
        id: folder.id,
        name: folder.name,
        path
      };
    } catch (error) {
      console.error('[FileSearchService] findFolderByName error:', error);
      return null;
    }
  }

  /**
   * Get files in a specific folder (alias for listFolderContents)
   */
  async getFilesInFolder(userId: string, folderId: string): Promise<FileSearchResult[]> {
    return this.listFolderContents(userId, folderId);
  }

  // ============================================================================
  // INVENTORY METHODS - For metadata/filter queries (NOT RAG)
  // These methods handle queries like "show only PDFs", "largest file", etc.
  // ============================================================================

  /**
   * Filter documents by file extension(s)
   * Handles queries like "show only PDFs", "list PPTX and PNG files"
   * @param extensions - Array of extensions WITHOUT dots, e.g. ['pdf', 'docx']
   */
  async filterByExtension(
    userId: string,
    extensions: string[],
    options: { limit?: number; sortBy?: 'name' | 'size' | 'date' } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 50, sortBy = 'name' } = options;

    if (!extensions || extensions.length === 0) {
      return [];
    }

    try {
      // Normalize extensions (remove dots, lowercase)
      const normalizedExts = extensions.map(e =>
        e.toLowerCase().replace(/^\./, '')
      );

      // Build MIME type patterns for each extension
      const mimePatterns = this.extensionsToMimeTypes(normalizedExts);

      // Build orderBy based on sortBy
      const orderBy = this.buildOrderBy(sortBy);

      const documents = await prisma.document.findMany({
        where: {
          userId,
          status: { in: USABLE_STATUSES },
          OR: [
            // Match by MIME type
            ...(mimePatterns.length > 0
              ? [{ mimeType: { in: mimePatterns } }]
              : []),
            // Also match by filename extension (fallback for unknown MIME types)
            ...normalizedExts.map(ext => ({
              filename: { endsWith: `.${ext}`, mode: 'insensitive' as const }
            }))
          ]
        },
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        },
        take: limit,
        orderBy
      });

      return this.mapToResults(userId, documents);
    } catch (error) {
      console.error('[FileSearchService] filterByExtension error:', error);
      return [];
    }
  }

  /**
   * Get largest file(s)
   * Handles queries like "what's my largest file", "biggest document"
   */
  async getLargestFiles(
    userId: string,
    options: { limit?: number; extensions?: string[] } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 5, extensions } = options;

    try {
      const whereClause: any = {
        userId,
        status: { in: USABLE_STATUSES }
      };

      // Optionally filter by extension
      if (extensions && extensions.length > 0) {
        const normalizedExts = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
        const mimePatterns = this.extensionsToMimeTypes(normalizedExts);
        whereClause.OR = [
          ...(mimePatterns.length > 0 ? [{ mimeType: { in: mimePatterns } }] : []),
          ...normalizedExts.map(ext => ({
            filename: { endsWith: `.${ext}`, mode: 'insensitive' as const }
          }))
        ];
      }

      const documents = await prisma.document.findMany({
        where: whereClause,
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        },
        take: limit,
        orderBy: { fileSize: 'desc' }
      });

      return this.mapToResults(userId, documents);
    } catch (error) {
      console.error('[FileSearchService] getLargestFiles error:', error);
      return [];
    }
  }

  /**
   * Get most recent files
   * Handles queries like "my latest upload", "most recent documents"
   */
  async getMostRecentFiles(
    userId: string,
    options: { limit?: number; extensions?: string[] } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 5, extensions } = options;

    try {
      const whereClause: any = {
        userId,
        status: { in: USABLE_STATUSES }
      };

      if (extensions && extensions.length > 0) {
        const normalizedExts = extensions.map(e => e.toLowerCase().replace(/^\./, ''));
        const mimePatterns = this.extensionsToMimeTypes(normalizedExts);
        whereClause.OR = [
          ...(mimePatterns.length > 0 ? [{ mimeType: { in: mimePatterns } }] : []),
          ...normalizedExts.map(ext => ({
            filename: { endsWith: `.${ext}`, mode: 'insensitive' as const }
          }))
        ];
      }

      const documents = await prisma.document.findMany({
        where: whereClause,
        include: {
          folder: {
            select: { id: true, name: true, parentFolderId: true }
          }
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      return this.mapToResults(userId, documents);
    } catch (error) {
      console.error('[FileSearchService] getMostRecentFiles error:', error);
      return [];
    }
  }

  /**
   * Group documents by folder
   * Handles queries like "organize files by folder", "what's in each folder"
   *
   * OPTIMIZED: Pre-fetches all folders in 1 query to avoid N+1 problem
   * Target: <100ms for any number of documents
   */
  async groupByFolder(
    userId: string,
    options: { includeRootFiles?: boolean } = {}
  ): Promise<Map<string, FileSearchResult[]>> {
    const { includeRootFiles = true } = options;
    const perfStart = performance.now();

    try {
      // OPTIMIZATION: Parallel fetch of documents and all folders
      const [documents, allFolders] = await Promise.all([
        prisma.document.findMany({
          where: {
            userId,
            status: { in: USABLE_STATUSES }
          },
          include: {
            folder: {
              select: { id: true, name: true, parentFolderId: true }
            }
          },
          orderBy: { filename: 'asc' }
        }),
        prisma.folder.findMany({
          where: { userId },
          select: { id: true, name: true, parentFolderId: true }
        })
      ]);

      // Build folder ID -> folder map for O(1) lookups
      const folderMap = new Map<string, { id: string; name: string; parentFolderId: string | null }>();
      for (const folder of allFolders) {
        folderMap.set(folder.id, folder);
      }

      // Build folder path cache (compute each path only once)
      const pathCache = new Map<string, string>();
      const buildPathFromCache = (folderId: string): string => {
        if (pathCache.has(folderId)) {
          return pathCache.get(folderId)!;
        }

        const pathParts: string[] = [];
        let currentId: string | null = folderId;
        let depth = 0;
        const maxDepth = 10;

        while (currentId && depth < maxDepth) {
          const folder = folderMap.get(currentId);
          if (!folder) break;
          pathParts.unshift(folder.name);
          currentId = folder.parentFolderId;
          depth++;
        }

        const path = pathParts.join(' / ');
        pathCache.set(folderId, path);
        return path;
      };

      // Group documents using cached paths (no DB queries in loop)
      const grouped = new Map<string, FileSearchResult[]>();

      for (const doc of documents) {
        const folderPath = doc.folder
          ? buildPathFromCache(doc.folder.id)
          : (includeRootFiles ? '(Root)' : null);

        if (folderPath === null) continue;

        if (!grouped.has(folderPath)) {
          grouped.set(folderPath, []);
        }

        grouped.get(folderPath)!.push({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          folderId: doc.folderId,
          folderPath,
          createdAt: doc.createdAt,
          status: doc.status
        });
      }

      const perfMs = performance.now() - perfStart;
      console.log(`[PERF] groupByFolder: ${perfMs.toFixed(0)}ms (${documents.length} docs, ${allFolders.length} folders)`);

      return grouped;
    } catch (error) {
      console.error('[FileSearchService] groupByFolder error:', error);
      return new Map();
    }
  }

  /**
   * Get file count by extension
   * Useful for queries like "how many PDFs do I have"
   */
  async getCountByExtension(userId: string): Promise<Map<string, number>> {
    try {
      const documents = await prisma.document.findMany({
        where: {
          userId,
          status: { in: USABLE_STATUSES }
        },
        select: { filename: true }
      });

      const counts = new Map<string, number>();

      for (const doc of documents) {
        const ext = this.getExtension(doc.filename);
        counts.set(ext, (counts.get(ext) || 0) + 1);
      }

      return counts;
    } catch (error) {
      console.error('[FileSearchService] getCountByExtension error:', error);
      return new Map();
    }
  }

  /**
   * Get total document stats
   * Useful for inventory overview queries
   */
  async getDocumentStats(userId: string): Promise<{
    totalCount: number;
    totalSize: number;
    byExtension: Record<string, number>;
    byFolder: Record<string, number>;
  }> {
    try {
      const documents = await prisma.document.findMany({
        where: {
          userId,
          status: { in: USABLE_STATUSES }
        },
        include: {
          folder: { select: { name: true } }
        }
      });

      const byExtension: Record<string, number> = {};
      const byFolder: Record<string, number> = {};
      let totalSize = 0;

      for (const doc of documents as any[]) {
        // Extension count
        const ext = this.getExtension(doc.filename);
        byExtension[ext] = (byExtension[ext] || 0) + 1;

        // Folder count
        const folderName = doc.folder?.name || '(Root)';
        byFolder[folderName] = (byFolder[folderName] || 0) + 1;

        // Total size
        totalSize += doc.fileSize || 0;
      }

      return {
        totalCount: documents.length,
        totalSize,
        byExtension,
        byFolder
      };
    } catch (error) {
      console.error('[FileSearchService] getDocumentStats error:', error);
      return { totalCount: 0, totalSize: 0, byExtension: {}, byFolder: {} };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Convert file extensions to MIME types
   */
  private extensionsToMimeTypes(extensions: string[]): string[] {
    const mimeMap: Record<string, string[]> = {
      'pdf': ['application/pdf'],
      'doc': ['application/msword'],
      'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      'xls': ['application/vnd.ms-excel'],
      'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      'ppt': ['application/vnd.ms-powerpoint'],
      'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      'png': ['image/png'],
      'jpg': ['image/jpeg'],
      'jpeg': ['image/jpeg'],
      'gif': ['image/gif'],
      'txt': ['text/plain'],
      'csv': ['text/csv', 'application/csv'],
      'json': ['application/json'],
      'xml': ['application/xml', 'text/xml'],
      'md': ['text/markdown', 'text/x-markdown']
    };

    const mimes: string[] = [];
    for (const ext of extensions) {
      const mapped = mimeMap[ext];
      if (mapped) {
        mimes.push(...mapped);
      }
    }
    return mimes;
  }

  /**
   * Build orderBy clause based on sort preference
   */
  private buildOrderBy(sortBy: 'name' | 'size' | 'date'): any {
    switch (sortBy) {
      case 'size':
        return { fileSize: 'desc' };
      case 'date':
        return { createdAt: 'desc' };
      case 'name':
      default:
        return { filename: 'asc' };
    }
  }

  /**
   * Extract extension from filename
   */
  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'unknown';
  }

  /**
   * Map Prisma documents to FileSearchResult array
   */
  private async mapToResults(userId: string, documents: any[]): Promise<FileSearchResult[]> {
    const results: FileSearchResult[] = [];

    for (const doc of documents) {
      const folderPath = doc.folder
        ? await this.buildFolderPath(userId, doc.folder)
        : null;

      results.push({
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        folderId: doc.folderId,
        folderPath,
        createdAt: doc.createdAt,
        status: doc.status
      });
    }

    return results;
  }

  /**
   * Extract filename from user query
   * Handles patterns like:
   * - "where is contract.pdf"
   * - "find the annual report"
   * - "open invoice 2024"
   */
  extractFilenameFromQuery(query: string): string | null {
    const q = query.toLowerCase().trim();

    // Pattern 1: Explicit file extension (e.g., "contract.pdf", "report.docx")
    const extensionMatch = q.match(/\b([\w\-_\s]+\.(pdf|docx?|xlsx?|pptx?|txt|csv|json|xml|md))\b/i);
    if (extensionMatch) {
      return extensionMatch[1].trim();
    }

    // Pattern 2: "file X" or "document X" or "the X"
    const fileMatch = q.match(/(?:file|document|the)\s+([\w\-_\s]+?)(?:\s+(?:file|document|pdf|in|from|at|to)|$)/i);
    if (fileMatch) {
      return fileMatch[1].trim();
    }

    // Pattern 3: After action verbs (open, show, find, locate, where is)
    const actionMatch = q.match(/(?:open|show|find|locate|where\s+is|where's)\s+(?:me\s+)?(?:the\s+)?(?:file\s+)?(?:document\s+)?([\w\-_\s]+?)(?:\s+(?:file|document|pdf|in|from)|[?.!]|$)/i);
    if (actionMatch) {
      const extracted = actionMatch[1].trim();
      // Filter out common false positives
      if (!['it', 'my', 'a', 'an', 'the', 'this', 'that'].includes(extracted)) {
        return extracted;
      }
    }

    return null;
  }

  // ============================================================================
  // QUERY PARSING METHODS - Extract filter/sort from natural language
  // ============================================================================

  /**
   * Parse a query to detect inventory intent and extract filters
   * Returns null if not an inventory query (should go to RAG instead)
   */
  parseInventoryQuery(query: string): {
    type: 'filter_extension' | 'largest' | 'smallest' | 'most_recent' | 'count' | 'stats' | 'folder_path' | 'list_folder' | 'group_by_folder' | 'name_contains' | 'table' | 'list_all' | 'top_n_ambiguous' | null;
    extensions?: string[];
    folderName?: string;
    searchTerm?: string;
    limit?: number;
    topN?: number;
  } {
    const q = query.toLowerCase().trim();

    // ════════════════════════════════════════════════════════════════════════
    // TRUST_HARDENING: CONTENT QUESTION GUARD - MUST BE FIRST CHECK
    // Uses SHARED contentGuard.service.ts - SINGLE SOURCE OF TRUTH for all intercepts
    // If user is asking about document CONTENT, skip inventory and go to RAG
    // ════════════════════════════════════════════════════════════════════════
    if (isContentQuestion(query)) {
      console.log(`[FileSearch] CONTENT_GUARD: Skipping inventory for content question: "${q.substring(0, 50)}..."`);
      return { type: null };  // Go to RAG
    }

    // ────────────────────────────────────────────────────────────────────────
    // LIST ALL FILES: "What files do I have?", "Show my files", "List documents"
    // PRIORITY: Check early to intercept generic file listing queries
    // NOTE: Must NOT match count queries ("count my documents") or group queries
    // ────────────────────────────────────────────────────────────────────────

    // First check if this is a count query (takes priority)
    // EN: "how many", "count" | PT: "quantos" | ES: "cuántos"
    const isCountKeyword = /\b(how\s+many|count|number\s+of|quantos?|cu[aá]ntos?)\b/i.test(q);
    // Check if this is a group/organize query (takes priority)
    // EN: "group by folder" | PT: "agrupar por pasta" | ES: "agrupar por carpeta"
    const isGroupKeyword = /\b(group|organize|sort|arrange|breakdown|agrupar|organizar)\s+.*\b(by\s+folder|por\s+pasta|por\s+carpeta)\b/i.test(q) ||
                           /\b(each\s+folder|by\s+folder|folder\s+breakdown|cada\s+pasta|por\s+pasta)\b/i.test(q);

    if (!isCountKeyword && !isGroupKeyword) {
      const listAllPatterns = [
        // ENGLISH patterns
        /\bwhat\s+(?:files?|documents?|pdfs?)\s+(?:do\s+)?i\s+have\b/i,
        /\bwhat\s+(?:are\s+)?(?:all\s+)?(?:my|the)\s+(?:files?|documents?)\b/i,
        /\b(?:show|list|display|get)\s+(?:me\s+)?(?:all\s+)?(?:my|the)?\s*(?:files?|documents?|uploads?)\b/i,
        /\bwhat(?:'s|s)?\s+(?:in\s+)?(?:my\s+)?(?:workspace|library|collection)\b/i,
        /\b(?:files?|documents?)\s+(?:do\s+)?i\s+have\s+(?:uploaded|stored|saved)?\b/i,
        /\blist\s+(?:all\s+)?(?:of\s+)?(?:my\s+)?(?:files?|documents?|uploads?)\b/i,
        /\bshow\s+(?:all\s+)?(?:my\s+)?(?:uploaded\s+)?(?:files?|documents?)\b/i,
        /\bwhat\s+have\s+i\s+uploaded\b/i,
        /\bmy\s+(?:files?|documents?)\s*\??\s*$/i,
        // PORTUGUESE patterns - PT INVENTORY QUERIES
        /\b(?:liste|listar|mostrar|mostre|exibir)\s+(?:todos?\s+)?(?:os?\s+)?(?:meus?\s+)?(?:documentos?|arquivos?)\b/i,
        /\bquais?\s+(?:s[aã]o\s+)?(?:os?\s+)?(?:meus?\s+)?(?:documentos?|arquivos?)\b/i,
        /\b(?:meus?\s+)?(?:documentos?|arquivos?)\s*\??\s*$/i,
        /\bque\s+(?:documentos?|arquivos?)\s+(?:eu\s+)?tenho\b/i,
        /\bo\s+que\s+(?:eu\s+)?tenho\s+(?:salvo|enviado|uploaded)\b/i,
        // SPANISH patterns - ES INVENTORY QUERIES
        /\b(?:listar|mostrar|muestre|ver)\s+(?:todos?\s+)?(?:mis\s+)?(?:documentos?|archivos?)\b/i,
        /\bcu[aá]les?\s+(?:son\s+)?(?:mis\s+)?(?:documentos?|archivos?)\b/i,
        /\b(?:mis\s+)?(?:documentos?|archivos?)\s*\??\s*$/i,
        /\bqu[eé]\s+(?:documentos?|archivos?)\s+tengo\b/i,
      ];

      // CONTENT LOCATION BLOCKERS - these indicate content queries, NOT file listing
      // EN: "in the document", "in the file", "appear", "mentioned", "discussed", "key metrics"
      // PT: "no documento", "no contrato", "na planilha", "aparecem", "mencionado", "métricas"
      // ES: "en el documento", "en el archivo", "aparecen", "mencionado"
      const isContentQuery = /\b(in\s+the\s+(?:document|file|pdf|report|contract|spreadsheet)|appear(?:s|ed)?|mention(?:s|ed)?|discuss(?:ed)?|describ(?:ed)?|list(?:ed)?\s+in|key\s+metrics|stakeholders|topics?\s+in)\b/i.test(q) ||
                             /\b(no\s+(?:documento|contrato|relat[oó]rio|arquivo|pdf)|na\s+(?:planilha|apresenta[cç][aã]o)|aparece[mn]?|mencionad[oa]s?|discutid[oa]s?|descrit[oa]s?|listad[oa]s?|m[eé]tricas|stakeholders|t[oó]picos?\s+no)\b/i.test(q) ||
                             /\b(en\s+el\s+(?:documento|contrato|archivo|informe)|aparece[n]?|mencionad[oa]s?|discutid[oa]s?|descrit[oa]s?|m[eé]tricas|temas?\s+en)\b/i.test(q);

      for (const pattern of listAllPatterns) {
        if (pattern.test(q)) {
          // Make sure it's not a filter query (e.g., "show only PDFs", "mostre apenas PDFs", "mostrar solo PDFs")
          // EN: only/just | PT: apenas/somente | ES: solo/solamente
          if (!/\b(only|just|specific|particular|apenas|somente|s[oó]lo|solamente)\b/i.test(q) && !isContentQuery) {
            console.log(`[FileSearch] LIST_ALL type detected for: "${q.substring(0, 50)}..."`);
            return { type: 'list_all' };
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // TABLE FORMAT: "create a table", "table with columns"
    // Prioritize this check before others as it's a specific output format request
    // ────────────────────────────────────────────────────────────────────────
    const isTable = /\b(create|make|build|show|generate)\s+(a\s+)?(clean\s+)?table\b/i.test(q) ||
        /\btable\s+with\s+columns?\b/i.test(q) ||
        /\bcolumns?:\s*(file|name|type|folder|size)/i.test(q);
    if (isTable) {
      console.log(`[FileSearch] TABLE type detected for: "${q.substring(0, 50)}..."`);
      return { type: 'table' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // FILTER BY EXTENSION: "show only PPTX", "list PDF files", "PNG and JPG"
    // ────────────────────────────────────────────────────────────────────────
    const extensionFilterPatterns = [
      /\b(?:show|list|display|filter|get|find)\s+(?:only|just|all)?\s*(?:the\s+)?(.+?)(?:\s+files?)?$/i,
      /\b(?:only|just)\s+(?:show|list|get)?\s*(?:the\s+)?(.+?)(?:\s+files?)?$/i,
      /\bwhat\s+(.+?)\s+(?:files?|documents?)\s+(?:do\s+i\s+have|are\s+there)\b/i
    ];

    // ────────────────────────────────────────────────────────────────────────
    // NAME CONTAINS: Check FIRST to avoid false positives from "the word X"
    // "find files containing X", "files with Lone in name", "contains 'X'"
    // ────────────────────────────────────────────────────────────────────────

    // First check for multiple quoted terms (e.g., "'Lone' or 'LMR'")
    const multiTermMatch = q.match(/["\']([^"']+)["\'](?:\s+or\s+["\']([^"']+)["\'])+/i);
    if (multiTermMatch && /\b(contains?|find|file\s*name)\b/i.test(q)) {
      const allTerms = q.match(/["\']([^"']+)["\'](?=\s|$|,|\)|or)/gi);
      if (allTerms && allTerms.length > 0) {
        const terms = allTerms.map(t => t.replace(/['"]/g, '').trim()).filter(t => t.length > 0);
        return { type: 'name_contains', searchTerm: terms.join('|') };
      }
    }

    const nameContainsPatterns = [
      /\bfile\s*name\s+(?:that\s+)?contains?\s+(?:the\s+word\s+)?["\']([^"']+)["\']?/i,
      /\bcontains?\s+["\']([^"']+)["\']?/i,
      /\bthat\s+contains?\s+(?:the\s+word\s+)?["\']([^"']+)["\']?/i,
      /\b(?:find|search|look\s+for|get|show)\s+(?:files?|documents?)\s+(?:that\s+)?(?:contain|with|containing|having)\s+["\']?([^"'\s]+(?:\s+[^"'\s]+)?)["\']?/i,
      /\bfiles?\s+(?:named?|called)\s+["\']?([^"'\s]+(?:\s+[^"'\s]+)?)["\']?/i,
      /\b(?:file\s+)?name\s+(?:contains?|with|having)\s+["\']?([^"'\s]+)["\']?/i,
    ];
    for (const pattern of nameContainsPatterns) {
      const match = q.match(pattern);
      if (match && match[1]) {
        const term = match[1].trim();
        if (term && !['that', 'the', 'word', 'contains', 'containing'].includes(term.toLowerCase())) {
          return { type: 'name_contains', searchTerm: term };
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // EXTENSION HELPER: Map natural language to actual file extensions
    // ────────────────────────────────────────────────────────────────────────

    // Common file extension names (includes both abbreviations and full names)
    const extensionNames: Record<string, string> = {
      'pdf': 'pdf', 'pdfs': 'pdf',
      'doc': 'doc', 'docx': 'docx', 'docs': 'docx', 'word': 'docx',  // Added 'word' → docx
      'excel': 'xlsx', 'xls': 'xls', 'xlsx': 'xlsx', 'spreadsheet': 'xlsx', 'spreadsheets': 'xlsx',
      'powerpoint': 'pptx', 'ppt': 'ppt', 'pptx': 'pptx', 'presentation': 'pptx', 'presentations': 'pptx', 'slides': 'pptx',
      'image': 'png', 'images': 'png', 'photo': 'jpg', 'photos': 'jpg', 'picture': 'jpg', 'pictures': 'jpg',
      'png': 'png', 'pngs': 'png',
      'jpg': 'jpg', 'jpeg': 'jpeg', 'jpgs': 'jpg',
      'gif': 'gif', 'gifs': 'gif',
      'text': 'txt', 'txt': 'txt',
      'csv': 'csv', 'csvs': 'csv',
      'json': 'json',
      'xml': 'xml',
      'markdown': 'md', 'md': 'md'
    };

    // Extract file extensions from query (includes natural language like "images")
    // EXPANSION MAP: Keywords that should map to MULTIPLE extensions
    const extensionExpansions: Record<string, string[]> = {
      'spreadsheet': ['xlsx', 'xls', 'csv'],
      'spreadsheets': ['xlsx', 'xls', 'csv'],
      'excel': ['xlsx', 'xls'],
      'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
      'images': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
      'photo': ['jpg', 'jpeg', 'png', 'heic'],
      'photos': ['jpg', 'jpeg', 'png', 'heic'],
      'picture': ['jpg', 'jpeg', 'png', 'gif'],
      'pictures': ['jpg', 'jpeg', 'png', 'gif'],
      'presentation': ['pptx', 'ppt'],
      'presentations': ['pptx', 'ppt'],
      'slides': ['pptx', 'ppt'],
      'document': ['pdf', 'docx', 'doc'],
      'documents': ['pdf', 'docx', 'doc'],
    };

    const extractExtensions = (text: string): string[] => {
      const found: string[] = [];
      const words = text.toLowerCase().split(/[\s,]+/).filter(w => w.length > 0);

      for (const word of words) {
        // Remove common words that shouldn't be treated as extensions
        const cleaned = word.replace(/^(and|or|the|only|just|all|my|files?|word|contains?|name)$/, '');
        if (!cleaned) continue;

        // First check expansion map (returns multiple extensions)
        if (extensionExpansions[cleaned]) {
          found.push(...extensionExpansions[cleaned]);
        } else if (extensionNames[cleaned]) {
          // Fall back to single extension
          found.push(extensionNames[cleaned]);
        }
      }
      return [...new Set(found)]; // dedupe
    };

    // ────────────────────────────────────────────────────────────────────────
    // LARGEST FILE: "largest file", "biggest document", "what's my biggest"
    // PRIORITY: Check BEFORE filter_extension to avoid "largest PDF" → filter_extension
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(largest|biggest|heaviest|most\s+space)\b/i.test(q) &&
        /\b(file|document|pdf|upload|what('s|s)?)\b/i.test(q)) {
      // Check if there's an extension filter too
      const extMatch = q.match(/\b(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|txt|csv)s?\b/gi);
      const extensions = extMatch
        ? extMatch.map(e => extensionNames[e.toLowerCase()] || e.toLowerCase())
        : undefined;
      return { type: 'largest', extensions: extensions ? [...new Set(extensions)] : undefined };
    }

    // ────────────────────────────────────────────────────────────────────────
    // SMALLEST FILE: "smallest file", "tiniest document", "least space"
    // PRIORITY: Check BEFORE filter_extension
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(smallest|tiniest|lightest|least\s+space)\b/i.test(q) &&
        /\b(file|document|pdf|upload|what('s|s)?)\b/i.test(q)) {
      const extMatch = q.match(/\b(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|txt|csv)s?\b/gi);
      const extensions = extMatch
        ? extMatch.map(e => extensionNames[e.toLowerCase()] || e.toLowerCase())
        : undefined;
      return { type: 'smallest', extensions: extensions ? [...new Set(extensions)] : undefined };
    }

    // ────────────────────────────────────────────────────────────────────────
    // MOST RECENT: "latest upload", "most recent file", "newest document"
    // Also matches: "newest spreadsheet", "latest PDF", "most recent image"
    // PRIORITY: Check BEFORE filter_extension to avoid "newest PDF" → filter_extension
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(latest|newest|most\s+recent|recently\s+uploaded|recent\s+uploads?|last\s+uploaded)\b/i.test(q) &&
        /\b(files?|documents?|pdfs?|uploads?|what('s|s)?|spreadsheets?|excels?|presentations?|images?|photos?)\b/i.test(q)) {
      const extMatch = q.match(/\b(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|txt|csv|spreadsheet|excel|presentation|image|photo)s?\b/gi);
      const extensions = extMatch
        ? extMatch.map(e => extensionNames[e.toLowerCase()] || e.toLowerCase())
        : undefined;
      return { type: 'most_recent', extensions: extensions ? [...new Set(extensions)] : undefined };
    }

    // ────────────────────────────────────────────────────────────────────────
    // TOP N WITHOUT RANKING: "top 5 items", "top 10 documents" without "largest/newest"
    // TRUST_HARDENING: Must clarify what ranking to use (size vs date vs relevance)
    // NOTE: Runs AFTER largest/smallest/most_recent to allow "top 5 largest" to work
    // ────────────────────────────────────────────────────────────────────────
    const topNMatch = q.match(/\btop\s+(\d+)\s*(files?|documents?|items?|uploads?)?\b/i);
    if (topNMatch) {
      // Check if there's a ranking term already - if so, those checks above should have caught it
      const hasRankingTerm = /\b(largest|biggest|smallest|tiniest|newest|latest|oldest|most\s+recent|recently|by\s+size|by\s+date)\b/i.test(q);
      if (!hasRankingTerm) {
        const n = parseInt(topNMatch[1], 10);
        console.log(`[FileSearch] TOP_N_AMBIGUOUS detected: top ${n} without ranking term for: "${q.substring(0, 50)}..."`);
        return { type: 'top_n_ambiguous', topN: n };
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // EXTENSION FILTER: "show only PDFs", "list Excel files", "show images"
    // NOTE: Runs AFTER size/recency checks to avoid false positives
    // ────────────────────────────────────────────────────────────────────────

    // Check extension filter patterns
    for (const pattern of extensionFilterPatterns) {
      const match = q.match(pattern);
      if (match) {
        const extensions = extractExtensions(match[1]);
        if (extensions.length > 0) {
          return { type: 'filter_extension', extensions };
        }
      }
    }

    // Direct extension or natural language mention like "pptx and png files" or "images"
    // Regex includes natural language: images, photos, pictures, spreadsheets, presentations, word (for Word documents)
    // NOTE: 'word' is included but name_contains patterns check FIRST, so "contains the word X" won't false positive
    const directExtMatch = q.match(/\b(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|txt|csv|json|xml|md|images?|photos?|pictures?|spreadsheets?|presentations?|slides?|word)s?\b/gi);
    // MULTILINGUAL: Include PT/ES keywords for filter detection
    // EN: show, list, filter, only, just, what, which
    // PT: mostrar, listar, quais, meus, apenas, somente
    // ES: mostrar, listar, cuáles, mis, solo, solamente
    const hasFilterKeyword = /\b(show|list|filter|only|just|what|which|mostrar|listar|quais|meus|minha|apenas|somente|cu[aá]les|mis|solo|solamente)\b/i.test(q);
    if (directExtMatch && directExtMatch.length > 0 && hasFilterKeyword) {
      const extensions = directExtMatch.map(e => extensionNames[e.toLowerCase()] || e.toLowerCase());
      // Filter out non-extension words that might have slipped through
      const validExts = extensions.filter(ext => ext && ext.length <= 5);
      if (validExts.length > 0) {
        console.log(`[FileSearch] FILTER_EXTENSION detected for: "${q.substring(0, 50)}..." (extensions: ${validExts.join(',')})`);
        return { type: 'filter_extension', extensions: [...new Set(validExts)] };
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // COUNT: "how many PDFs", "count my files", "number of documents"
    // P1-2 FIX: Also matches "how many files and how many of each type?"
    // NOTE: Must NOT match content queries like "total revenue in that document"
    // ────────────────────────────────────────────────────────────────────────
    const isCountQuery = /\b(how\s+many|count|number\s+of)\b/i.test(q) &&
        /\b(files?|documents?|pdfs?|uploads?)\b/i.test(q);
    const isTotalFilesQuery = /\btotal\s+(files?|documents?|pdfs?|uploads?)\b/i.test(q);
    // P1-2 FIX: Match "each type" / "by type" breakdown queries
    const isTypeBreakdownQuery = /\b(each\s+type|by\s+type|of\s+each|per\s+type|breakdown)\b/i.test(q) &&
        /\b(how\s+many|count|files?|documents?)\b/i.test(q);
    // Exclude content queries: "in that document", "in the document"
    const isContentQuery = /\b(in\s+that|in\s+the|in\s+this)\s+(document|file)\b/i.test(q);

    if ((isCountQuery || isTotalFilesQuery || isTypeBreakdownQuery) && !isContentQuery) {
      return { type: 'count' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // STATS: "file overview", "document statistics", "storage usage", "file types"
    // Includes: "What file types do I have?", "What kinds of files?", "file breakdown"
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(overview|statistics|stats|storage\s+usage|summary\s+of\s+(my\s+)?files)\b/i.test(q) ||
        /\b(what|which)\s+(file\s+)?types?\s+(do\s+i\s+have|are\s+there)\b/i.test(q) ||
        /\bwhat\s+kinds?\s+of\s+(files?|documents?)\b/i.test(q) ||
        /\b(file|document)\s+(type\s+)?(breakdown|distribution|mix)\b/i.test(q)) {
      console.log(`[FileSearch] STATS type detected for: "${q.substring(0, 50)}..."`);
      return { type: 'stats' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // FOLDER PATH: "which folder is X in", "where is X located"
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(which|what)\s+folder\s+(is|has|contains)\b/i.test(q) ||
        /\bwhere\s+(is|are).+\b(located|stored)\b/i.test(q)) {
      return { type: 'folder_path' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // GROUP BY FOLDER: "organize by folder", "files by folder", "folder breakdown"
    // MUST come BEFORE list_folder to avoid "each folder" being treated as folder name
    // Pattern uses (?:\w+\s+)* to match MULTIPLE words like "my files by folder"
    // ────────────────────────────────────────────────────────────────────────
    if (/\b(group|organize|sort|arrange|breakdown)\s+(?:\w+\s+)*by\s+folder\b/i.test(q) ||
        /\bfiles?\s+(?:in\s+)?each\s+folder\b/i.test(q) ||
        /\bfolder\s+(?:structure|breakdown|organization)\b/i.test(q) ||
        /\bby\s+folder\b.*\b(numbered|list|show)\b/i.test(q) ||
        /\b(group|organize)\s+(?:my\s+)?files?\s+by\s+folder\b/i.test(q)) {
      return { type: 'group_by_folder' };
    }

    // ────────────────────────────────────────────────────────────────────────
    // LIST FOLDER: "files in Legal folder", "what's in Contracts"
    // NOTE: Excludes conversation context words to avoid matching "files in this conversation"
    // ────────────────────────────────────────────────────────────────────────
    const conversationWords = /\b(conversation|chat|discussion|talked|discussed|session)\b/i;
    const folderListMatch = q.match(
      /\b(?:files?|documents?|what'?s?)\s+(?:in|inside|under)\s+(?:the\s+)?(?:folder\s+)?["\']?([^"'\s]+(?:\s+[^"'\s]+)*?)["\']?\s*(?:folder)?\s*$/i
    );
    if (folderListMatch && !conversationWords.test(folderListMatch[1])) {
      return { type: 'list_folder', folderName: folderListMatch[1].trim() };
    }

    // Not an inventory query (name_contains is checked earlier in this function)
    return { type: null };
  }

  /**
   * Get smallest files by size
   */
  async getSmallestFiles(
    userId: string,
    options: { limit?: number; extensions?: string[] } = {}
  ): Promise<FileSearchResult[]> {
    const { limit = 5, extensions } = options;

    const where: any = {
      userId,
      status: { in: ['available', 'enriching', 'ready', 'completed'] },
    };

    if (extensions && extensions.length > 0) {
      where.mimeType = {
        in: extensions.flatMap(ext => this.extensionsToMimeTypes([ext])),
      };
    }

    const docs = await prisma.document.findMany({
      where,
      orderBy: { fileSize: 'asc' },
      take: limit,
      select: {
        id: true,
        filename: true,
        fileSize: true,
        mimeType: true,
        status: true,
        createdAt: true,
        folder: {
          select: { name: true, id: true },
        },
      },
    });

    return docs.map(d => ({
      id: d.id,
      filename: d.filename,
      fileSize: d.fileSize || 0,
      mimeType: d.mimeType || '',
      folderPath: d.folder?.name || 'Root',
      folderId: d.folder?.id || null,
      createdAt: d.createdAt,
      status: d.status,
    }));
  }

  /**
   * Find files by topic/domain (e.g., "finance", "legal", "marketing")
   * Uses keyword-based heuristic matching
   */
  async findByTopic(userId: string, topic: string): Promise<FileSearchResult[]> {
    const topicKeywords: Record<string, string[]> = {
      'finance': ['p&l', 'pnl', 'profit', 'loss', 'revenue', 'budget', 'financial', 'income', 'expense', 'balance', 'sheet', 'cash', 'flow', 'investment', 'fund', 'portfolio', 'fiscal', 'quarter', 'annual', 'forecast'],
      'legal': ['contract', 'agreement', 'terms', 'conditions', 'legal', 'law', 'attorney', 'compliance', 'regulation', 'policy', 'liability', 'patent', 'trademark', 'copyright', 'nda', 'settlement'],
      'marketing': ['marketing', 'campaign', 'brand', 'advertising', 'social', 'media', 'content', 'seo', 'analytics', 'customer', 'engagement', 'conversion', 'funnel'],
      'engineering': ['technical', 'design', 'architecture', 'system', 'specification', 'diagram', 'schematic', 'code', 'api', 'database', 'infrastructure'],
      'hr': ['employee', 'hiring', 'recruitment', 'onboarding', 'performance', 'review', 'benefits', 'payroll', 'handbook', 'policy'],
    };

    const keywords = topicKeywords[topic.toLowerCase()] || [];
    if (keywords.length === 0) {
      // Fallback to using topic word itself
      keywords.push(topic.toLowerCase());
    }

    // Get all documents
    const allDocs = await prisma.document.findMany({
      where: { userId, status: { in: USABLE_STATUSES } },
      include: { folder: { select: { id: true, name: true, parentFolderId: true } } },
    });

    // Score each document by keyword matches in filename
    const scored = allDocs.map(doc => {
      const filenameLower = doc.filename.toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (filenameLower.includes(keyword)) {
          score += keyword.length; // Longer matches score higher
        }
      }
      return { doc, score };
    }).filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score);

    // Return top matches
    const results: FileSearchResult[] = [];
    for (const { doc } of scored.slice(0, 5)) {
      const folderPath = doc.folder
        ? await this.buildFolderPath(userId, doc.folder)
        : null;
      results.push({
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        folderId: doc.folderId,
        folderPath,
        createdAt: doc.createdAt,
        status: doc.status,
      });
    }

    return results;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  /**
   * Format results as markdown table
   * Handles queries like "create a table with columns: File, Type, Folder, Size"
   */
  formatResultsAsTable(files: FileSearchResult[], options: {
    showType?: boolean;
    showFolder?: boolean;
    showSize?: boolean;
    showDate?: boolean;
  } = {}): string {
    const { showType = true, showFolder = true, showSize = true, showDate = false } = options;

    if (files.length === 0) {
      return 'No files found.';
    }

    // Build header row
    const headers = ['File'];
    if (showType) headers.push('Type');
    if (showFolder) headers.push('Folder');
    if (showSize) headers.push('Size');
    if (showDate) headers.push('Modified');

    // Build separator row
    const separator = headers.map(() => '---').join(' | ');

    // Build data rows
    // NOTE: Using plain filenames (not DOC markers) to preserve table structure
    // DOC markers would be processed by frontend before markdown rendering, breaking tables
    const rows = files.map(f => {
      const cols = [f.filename];
      if (showType) cols.push(this.getExtension(f.filename).toUpperCase());
      if (showFolder) cols.push(f.folderPath || 'Root');
      if (showSize) cols.push(this.formatFileSize(f.fileSize || 0));
      if (showDate) cols.push(f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '-');
      return cols.join(' | ');
    });

    return `| ${headers.join(' | ')} |\n| ${separator} |\n| ${rows.join(' |\n| ')} |`;
  }

  /**
   * @deprecated Use AnswerComposer with 'attachment' shape instead.
   * This method is kept for backward compatibility but should not be used.
   * All file list formatting should go through the centralized Answer Composer.
   *
   * Format results as markdown list for chat response
   * P0-4 FIX: Added withDocMarkers option to make files clickable
   */
  formatResultsAsMarkdown(files: FileSearchResult[], options: {
    showSize?: boolean;
    showFolder?: boolean;
    showDate?: boolean;
    numbered?: boolean;  // Use numbered list (default true for Koda style)
    withDocMarkers?: boolean; // Add clickable DOC markers (default true)
  } = {}): string {
    const { showSize = false, showFolder = false, showDate = false, numbered = true, withDocMarkers = true } = options;

    if (files.length === 0) {
      return 'No matching files found.';
    }

    const lines = files.map((f, index) => {
      // Koda style: numbered list (1. 2. 3.) instead of bullet points
      const prefix = numbered ? `${index + 1}. ` : '- ';

      // P0-4: Use DOC markers for clickable file buttons
      let filename: string;
      if (withDocMarkers) {
        filename = createDocMarker({ id: f.id, name: f.filename, ctx: 'list' });
      } else {
        filename = `**${f.filename}**`;
      }

      let line = `${prefix}${filename}`;
      const details: string[] = [];

      if (showSize && f.fileSize) {
        details.push(this.formatFileSize(f.fileSize));
      }
      if (showFolder && f.folderPath) {
        // No emoji for Koda style
        details.push(f.folderPath);
      }
      if (showDate) {
        details.push(f.createdAt.toLocaleDateString());
      }

      if (details.length > 0) {
        line += ` (${details.join(' | ')})`;
      }
      return line;
    });

    return lines.join('\n');
  }
}

export const fileSearchService = new FileSearchService();
