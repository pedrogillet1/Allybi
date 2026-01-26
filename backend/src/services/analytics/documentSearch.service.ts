/**
 * Document Search Service
 * Provides fast document search for SEARCH/ANALYTICS intents
 */

import prisma from '../../config/database';
import {
  DocumentSearchParams,
  DocumentSearchResult,
  DocumentSearchItem,
} from '../../types/ragV3.types';

/**
 * Service for searching documents by various criteria
 */
export class DocumentSearchService {
  /**
   * Search documents by userId and optional query with filters.
   * Returns paginated results sorted by the specified order.
   */
  public async search(params: DocumentSearchParams): Promise<DocumentSearchResult> {
    const { userId, limit = 20, offset = 0, filters, orderBy = 'recency', query } = params;

    try {
      // Build where clause
      const where: any = { userId };

      if (filters?.folderId) {
        where.folderId = filters.folderId;
      }

      if (filters?.fileType) {
        where.mimeType = filters.fileType;
      }

      if (filters?.status) {
        where.status = filters.status;
      }

      // Add text search if query provided
      if (query && query.trim()) {
        where.OR = [
          { filename: { contains: query, mode: 'insensitive' } },
        ];
      }

      // Build orderBy clause
      let orderByClause: any = { updatedAt: 'desc' };
      if (orderBy === 'name') {
        orderByClause = { filename: 'asc' };
      } else if (orderBy === 'size') {
        orderByClause = { fileSize: 'desc' };
      }

      // Execute query
      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: orderByClause,
          skip: offset,
          take: limit,
          select: {
            id: true,
            filename: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
            updatedAt: true,
            folderId: true,
            language: true,
            status: true,
            metadata: {
              select: {
                pageCount: true,
              },
            },
          },
        }),
        prisma.document.count({ where }),
      ]);

      // Map to DocumentSearchItem
      const mappedItems: DocumentSearchItem[] = items.map((doc: any) => ({
        documentId: doc.id,
        filename: doc.filename,
        normalizedFilename: undefined,
        fileType: doc.mimeType,
        sizeBytes: doc.fileSize,
        pageCount: doc.metadata?.pageCount ?? undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        folderId: doc.folderId ?? undefined,
        folderPath: undefined,
        tags: [],
        language: doc.language ?? undefined,
        status: doc.status as DocumentSearchItem['status'],
      }));

      return {
        items: mappedItems,
        total,
        hasMore: offset + items.length < total,
      };
    } catch (error) {
      console.error('[DocumentSearchService] Search error:', error);
      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  /**
   * Get document count by status for a user
   */
  public async getDocumentCounts(userId: string): Promise<{
    total: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const [total, processing, completed, failed] = await Promise.all([
        prisma.document.count({ where: { userId } }),
        prisma.document.count({ where: { userId, status: 'processing' } }),
        prisma.document.count({ where: { userId, status: 'completed' } }),
        prisma.document.count({ where: { userId, status: 'failed' } }),
      ]);

      return { total, processing, completed, failed };
    } catch (error) {
      console.error('[DocumentSearchService] Count error:', error);
      return { total: 0, processing: 0, completed: 0, failed: 0 };
    }
  }
}

// Export class for DI registration (instantiate in container.ts)
export default DocumentSearchService;
