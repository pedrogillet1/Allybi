/**
 * Chunking Service - Centralized text chunking logic
 *
 * Consolidates chunking logic from multiple services into one place
 * Supports semantic chunking with overlap for better retrieval
 */

interface ChunkOptions {
  maxChunkSize: number;
  overlap: number;
  splitOn?: string[];
}

interface ChunkWithMetadata {
  chunkIndex: number;
  content: string;
  startChar: number;
  endChar: number;
  metadata?: any;
}

interface DocumentChunkingOptions {
  text: string;
  documentId: string;
  mimeType: string;
  maxChunkSize?: number;
  overlap?: number;
}

export class ChunkingService {
  private readonly DEFAULT_MAX_SIZE = 1000; // ~600 tokens (optimal for embeddings)
  private readonly DEFAULT_OVERLAP = 200; // 20% overlap for context
  private readonly DEFAULT_SPLIT_ON = ['\n\n', '\n', '. ', '! ', '? ', ', '];

  /**
   * Chunk text with overlap for improved retrieval
   * Uses smart boundary detection for cleaner chunks
   */
  chunkTextWithOverlap(
    text: string,
    options: Partial<ChunkOptions> = {}
  ): ChunkWithMetadata[] {
    const {
      maxChunkSize = this.DEFAULT_MAX_SIZE,
      overlap = this.DEFAULT_OVERLAP,
      splitOn = this.DEFAULT_SPLIT_ON,
    } = options;

    const chunks: ChunkWithMetadata[] = [];
    let currentPos = 0;
    let chunkIndex = 0;

    while (currentPos < text.length) {
      let endPos = Math.min(currentPos + maxChunkSize, text.length);

      // Try to find a good break point
      if (endPos < text.length) {
        let bestBreak = endPos;

        for (const delimiter of splitOn) {
          const lastIndex = text.lastIndexOf(delimiter, endPos);
          if (lastIndex > currentPos && lastIndex > bestBreak - 100) {
            bestBreak = lastIndex + delimiter.length;
            break;
          }
        }

        endPos = bestBreak;
      }

      const content = text.substring(currentPos, endPos).trim();

      if (content.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content,
          startChar: currentPos,
          endChar: endPos,
        });
      }

      // Move forward, accounting for overlap
      const prevStartChar = chunks[chunks.length - 1]?.startChar ?? -1;
      currentPos = endPos - overlap;

      // Ensure we make progress
      if (currentPos <= prevStartChar) {
        currentPos = endPos;
      }
    }

    return chunks;
  }

  /**
   * Chunk document with document-type-specific logic
   */
  async chunkDocument(
    options: DocumentChunkingOptions
  ): Promise<ChunkWithMetadata[]> {
    const {
      text,
      documentId,
      mimeType,
      maxChunkSize = this.DEFAULT_MAX_SIZE,
      overlap = this.DEFAULT_OVERLAP,
    } = options;

    console.log(`[Chunking] Chunking document ${documentId} (${text.length} chars)...`);

    // Determine chunking strategy based on document type
    const chunks = this.chunkTextWithOverlap(text, {
      maxChunkSize,
      overlap,
      splitOn: this.getSplitDelimiters(mimeType),
    });

    console.log(`[Chunking] Created ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Get split delimiters based on document type
   */
  private getSplitDelimiters(mimeType: string): string[] {
    // PDF documents: prioritize paragraph breaks
    if (mimeType.includes('pdf')) {
      return ['\n\n\n', '\n\n', '\n', '. ', '! ', '? '];
    }

    // Word documents: similar to PDF
    if (mimeType.includes('word') || mimeType.includes('docx')) {
      return ['\n\n', '\n', '. ', '! ', '? ', ', '];
    }

    // Spreadsheets: prioritize row breaks
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return ['\n', ', ', '; '];
    }

    // Presentations: prioritize slide breaks
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      return ['\n\n\n', '\n\n', '\n', '. '];
    }

    // Default: standard text splitting
    return this.DEFAULT_SPLIT_ON;
  }

  /**
   * Validate chunk quality
   */
  validateChunk(chunk: ChunkWithMetadata): boolean {
    // Too short
    if (chunk.content.length < 50) {
      return false;
    }

    // Too much whitespace
    const whitespaceRatio = (chunk.content.match(/\s/g) || []).length / chunk.content.length;
    if (whitespaceRatio > 0.5) {
      return false;
    }

    return true;
  }

  /**
   * Filter low-quality chunks
   */
  filterChunks(chunks: ChunkWithMetadata[]): ChunkWithMetadata[] {
    return chunks.filter(chunk => this.validateChunk(chunk));
  }
}

// Infrastructure singleton - kept for backward compatibility
// Can also be accessed via container.getChunking()
export default new ChunkingService();
