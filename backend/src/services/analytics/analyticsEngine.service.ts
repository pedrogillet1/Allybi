/**
 * Analytics Engine Service - MVP Implementation
 *
 * Runs analytics queries on documents (count, breakdown by type, etc.)
 * MVP: Basic Prisma queries
 */

import prisma from '../../config/database';

export interface AnalyticsResult {
  query: string;
  result: any;
  timestamp: Date;
}

export interface DocumentStats {
  total: number;
  byType: Record<string, number>;
  byFolder: Record<string, number>;
  recentUploads: number;
}

export class AnalyticsEngineService {
  /**
   * Get document count for a user
   */
  async getDocumentCount(userId: string): Promise<number> {
    try {
      return await prisma.document.count({
        where: { userId },
      });
    } catch {
      return 0;
    }
  }

  /**
   * Get comprehensive document statistics
   */
  async getDocumentStats(userId: string): Promise<DocumentStats> {
    try {
      const [total, documents] = await Promise.all([
        prisma.document.count({ where: { userId } }),
        prisma.document.findMany({
          where: { userId },
          include: {
            folder: true,
          },
        }),
      ]);

      // Group by type (using mimeType)
      const byType: Record<string, number> = {};
      documents.forEach(doc => {
        const type = doc.mimeType || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
      });

      // Group by folder
      const byFolder: Record<string, number> = {};
      documents.forEach(doc => {
        const folder = doc.folder?.name || 'Root';
        byFolder[folder] = (byFolder[folder] || 0) + 1;
      });

      // Recent uploads (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentUploads = documents.filter(d => d.createdAt > weekAgo).length;

      return { total, byType, byFolder, recentUploads };
    } catch {
      return { total: 0, byType: {}, byFolder: {}, recentUploads: 0 };
    }
  }

  /**
   * Run a custom analytics query
   */
  async runQuery(userId: string, query: string): Promise<AnalyticsResult> {
    // MVP: Parse simple query patterns
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('count') || lowerQuery.includes('how many')) {
      const count = await this.getDocumentCount(userId);
      return {
        query,
        result: { count, message: `You have ${count} document(s).` },
        timestamp: new Date(),
      };
    }

    if (lowerQuery.includes('stats') || lowerQuery.includes('breakdown')) {
      const stats = await this.getDocumentStats(userId);
      return {
        query,
        result: stats,
        timestamp: new Date(),
      };
    }

    // Default: return basic stats
    const stats = await this.getDocumentStats(userId);
    return {
      query,
      result: stats,
      timestamp: new Date(),
    };
  }
}

// Singleton removed - use container.getAnalyticsEngine() instead
export default AnalyticsEngineService;
