/**
 * Chunk Relevance Logger Service
 * Logs retrieval results for debugging and analytics
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { IntentClassificationV3, RetrievedChunk } from '../../types/ragV3.types';

/**
 * Interface representing a single chunk relevance log entry input.
 */
export interface ChunkRelevanceLogEntry {
  userId: string;
  conversationId?: string;
  query: string;
  intent: IntentClassificationV3;
  chunks: RetrievedChunk[];         // ranked list of retrieved chunks
  selectedChunks: RetrievedChunk[]; // subset chosen for context
  timestamp: Date;
}

/**
 * Interface representing a single chunk log record to be stored.
 */
interface ChunkLogRecord {
  userId: string;
  conversationId?: string | null;
  query: string;
  intentJson: string;
  documentId: string;
  chunkId: string;
  score: number;
  pageNumber?: number | null;
  rankIndex: number;
  selected: boolean;
  timestamp: Date;
}

/**
 * Service responsible for logging chunk retrieval results for debugging and analytics.
 * Stores detailed chunk-level logs including ranking and selection status.
 */
export class ChunkRelevanceLoggerService {
  /**
   * Logs the retrieval results of chunks for a given query and intent.
   * Stores one record per chunk with metadata including rank and selection.
   *
   * @param entry - ChunkRelevanceLogEntry containing user, query, intent, chunks, and timestamp.
   * @returns Promise<void>
   */
  public async log(entry: ChunkRelevanceLogEntry): Promise<void> {
    // Skip if no chunks to log
    if (!entry.chunks || entry.chunks.length === 0) {
      return;
    }

    try {
      // Build a Set for quick lookup of selected chunk IDs
      const selectedChunkIds = new Set(entry.selectedChunks.map(c => c.chunkId));

      // Prepare chunk log records with rank and selection flag
      const chunkLogRecords: ChunkLogRecord[] = entry.chunks.map((chunk, index) => ({
        userId: entry.userId,
        conversationId: entry.conversationId ?? null,
        query: entry.query,
        intentJson: JSON.stringify(entry.intent),
        documentId: chunk.documentId,
        chunkId: chunk.chunkId,
        score: chunk.score,
        pageNumber: chunk.pageNumber ?? null,
        rankIndex: index,
        selected: selectedChunkIds.has(chunk.chunkId),
        timestamp: entry.timestamp,
      }));

      // Try to insert logs - if table doesn't exist, silently skip
      // This makes the logger non-blocking for the main RAG flow
      try {
        await (prisma as any).ragChunkLog.createMany({
          data: chunkLogRecords.map(record => ({
            userId: record.userId,
            conversationId: record.conversationId,
            query: record.query,
            intentJson: record.intentJson,
            documentId: record.documentId,
            chunkId: record.chunkId,
            score: record.score,
            pageNumber: record.pageNumber,
            rankIndex: record.rankIndex,
            selected: record.selected,
            timestamp: record.timestamp,
          })),
          skipDuplicates: true,
        });
      } catch (dbError: any) {
        // If table doesn't exist, log warning but don't fail
        if (dbError?.code === 'P2021' || dbError?.message?.includes('does not exist')) {
          console.warn('[ChunkRelevanceLogger] Table not found, skipping logging');
          return;
        }
        throw dbError;
      }
    } catch (error) {
      // Log error but don't fail the RAG pipeline
      console.error('[ChunkRelevanceLogger] Failed to log chunk relevance:', error);
    }
  }

  /**
   * Query logged chunks for analytics
   */
  public async getRecentLogs(userId: string, limit: number = 100): Promise<any[]> {
    try {
      return await (prisma as any).ragChunkLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
    } catch (error) {
      console.error('[ChunkRelevanceLogger] Failed to query logs:', error);
      return [];
    }
  }
}

// Singleton removed - use container.getChunkRelevanceLogger() instead

