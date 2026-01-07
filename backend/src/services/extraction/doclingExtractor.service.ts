/**
 * Docling Extractor Service
 * High-level integration of Docling for document extraction and indexing.
 * Falls back to standard extractors on failure.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import defaultLogger from '../../utils/logger';
import { DoclingBridge, DoclingExtractedDocument, isDoclingAvailable } from './doclingBridge.service';
import { indexDocumentChunks, SemanticSearchService } from '../retrieval/semanticSearch.service';
import * as textExtractionService from '../textExtraction.service';

const logger = {
  info: (msg: string, ...args: any[]) => defaultLogger.info(`[DoclingExtractor] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => defaultLogger.warn(`[DoclingExtractor] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => defaultLogger.error(`[DoclingExtractor] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => defaultLogger.debug(`[DoclingExtractor] ${msg}`, ...args),
};

// ============================================================================
// Types
// ============================================================================

export interface DoclingExtractionResult {
  success: boolean;
  usedDocling: boolean;
  text: string;
  markdown: string | null;
  chunks: Array<{
    chunkId: string;
    text: string;
    meta: any;
  }>;
  chunkCount: number;
  totalChars: number;
  pageCount: number | null;
  wordCount: number | null;
  confidence: number | null;
  error?: string;
}

// Supported file types for Docling
const DOCLING_SUPPORTED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/html',
  'text/markdown',
];

// ============================================================================
// Configuration
// ============================================================================

const DOCLING_ENABLED = process.env.DOCLING_ENABLED !== 'false';
const DOCLING_STORAGE_DIR = process.env.DOCLING_STORAGE_DIR || path.resolve(process.cwd(), 'storage/docling');

// Ensure storage directory exists
fs.mkdirSync(DOCLING_STORAGE_DIR, { recursive: true });

// ============================================================================
// Helper Functions
// ============================================================================

function isSupportedByDocling(mimeType: string): boolean {
  return DOCLING_SUPPORTED_MIMETYPES.includes(mimeType);
}

function getDoclingOutputDir(documentId: string): string {
  return path.join(DOCLING_STORAGE_DIR, documentId);
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'text/html': '.html',
    'text/markdown': '.md',
    'text/plain': '.txt',
  };
  return mimeToExt[mimeType] || '.bin';
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract document content using Docling (with fallback to standard extractors).
 *
 * @param fileBuffer - The file buffer to extract
 * @param mimeType - MIME type of the file
 * @param filename - Original filename
 * @param documentId - Document ID for storage and indexing
 * @param options - Additional options
 * @returns Extraction result with text, markdown, and chunks
 */
export async function extractWithDocling(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  documentId: string,
  options: {
    indexChunks?: boolean;  // Whether to index chunks for semantic search
    documentName?: string;  // Display name for the document
  } = {}
): Promise<DoclingExtractionResult> {
  const { indexChunks = true, documentName = filename } = options;
  const startTime = Date.now();

  // Check if Docling is available and file type is supported
  const canUseDocling = DOCLING_ENABLED && isDoclingAvailable() && isSupportedByDocling(mimeType);

  if (canUseDocling) {
    logger.info(`[DoclingExtractor] Attempting Docling extraction for ${filename}`);

    try {
      // Save file to temp location for Docling
      const tempDir = os.tmpdir();
      const tempFilename = `docling-${crypto.randomUUID()}${getExtensionFromMimeType(mimeType)}`;
      const tempFilePath = path.join(tempDir, tempFilename);
      fs.writeFileSync(tempFilePath, fileBuffer);

      // Create output directory for Docling
      const outDir = getDoclingOutputDir(documentId);
      fs.mkdirSync(outDir, { recursive: true });

      // Run Docling extraction
      const doclingResult = await DoclingBridge.extractAndLoad(tempFilePath, outDir);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }

      if (doclingResult) {
        const elapsed = Date.now() - startTime;
        logger.info(`[DoclingExtractor] Docling succeeded: ${doclingResult.chunkCount} chunks in ${elapsed}ms`);

        // Index chunks for semantic search if requested
        if (indexChunks && doclingResult.chunks.length > 0) {
          try {
            await indexDocumentChunks(
              documentId,
              documentName,
              doclingResult.chunks.map(c => ({
                chunkId: c.chunk_id,
                text: c.text,
                meta: c.meta,
              }))
            );
            logger.info(`[DoclingExtractor] Indexed ${doclingResult.chunks.length} chunks for semantic search`);
          } catch (indexError: any) {
            logger.warn(`[DoclingExtractor] Failed to index chunks: ${indexError.message}`);
            // Continue without indexing - extraction still succeeded
          }
        }

        // Calculate word count from markdown
        const wordCount = doclingResult.markdown.split(/\s+/).filter(w => w.length > 0).length;

        return {
          success: true,
          usedDocling: true,
          text: doclingResult.markdown, // Use markdown as primary text
          markdown: doclingResult.markdown,
          chunks: doclingResult.chunks.map(c => ({
            chunkId: c.chunk_id,
            text: c.text,
            meta: c.meta,
          })),
          chunkCount: doclingResult.chunkCount,
          totalChars: doclingResult.totalChars,
          pageCount: null, // Docling doesn't always provide this
          wordCount,
          confidence: 0.98, // High confidence for Docling
        };
      }
    } catch (doclingError: any) {
      logger.error(`[DoclingExtractor] Docling failed: ${doclingError.message}`);
      // Fall through to standard extraction
    }
  }

  // Fallback to standard extraction
  logger.info(`[DoclingExtractor] Using standard extraction for ${filename}`);

  try {
    const result = await textExtractionService.extractText(fileBuffer, mimeType);
    const elapsed = Date.now() - startTime;

    // Create simple chunks from extracted text (fallback chunking)
    const chunks = createSimpleChunks(result.text, documentId);

    // Index chunks if requested
    if (indexChunks && chunks.length > 0) {
      try {
        await indexDocumentChunks(documentId, documentName, chunks);
        logger.info(`[DoclingExtractor] Indexed ${chunks.length} fallback chunks`);
      } catch (indexError: any) {
        logger.warn(`[DoclingExtractor] Failed to index fallback chunks: ${indexError.message}`);
      }
    }

    logger.info(`[DoclingExtractor] Standard extraction succeeded in ${elapsed}ms`);

    return {
      success: true,
      usedDocling: false,
      text: result.text,
      markdown: null, // Standard extraction doesn't produce markdown
      chunks,
      chunkCount: chunks.length,
      totalChars: result.text.length,
      pageCount: result.pageCount || null,
      wordCount: result.wordCount || null,
      confidence: result.confidence || null,
    };
  } catch (extractError: any) {
    logger.error(`[DoclingExtractor] All extraction methods failed: ${extractError.message}`);

    return {
      success: false,
      usedDocling: false,
      text: '',
      markdown: null,
      chunks: [],
      chunkCount: 0,
      totalChars: 0,
      pageCount: null,
      wordCount: null,
      confidence: null,
      error: extractError.message,
    };
  }
}

/**
 * Create simple overlapping chunks from text (fallback when Docling not available).
 */
function createSimpleChunks(
  text: string,
  documentId: string,
  maxChunkSize: number = 1000,
  overlap: number = 200
): Array<{ chunkId: string; text: string; meta: any }> {
  const chunks: Array<{ chunkId: string; text: string; meta: any }> = [];

  if (!text || text.length === 0) {
    return chunks;
  }

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkId = crypto.createHash('sha1').update(`${documentId}-${chunkIndex}`).digest('hex').substring(0, 16);
      chunks.push({
        chunkId,
        text: currentChunk.trim(),
        meta: { chunkIndex, charCount: currentChunk.length },
      });

      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5)); // Approximate word count for overlap
      currentChunk = overlapWords.join(' ') + '\n\n' + para;
      chunkIndex++;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    const chunkId = crypto.createHash('sha1').update(`${documentId}-${chunkIndex}`).digest('hex').substring(0, 16);
    chunks.push({
      chunkId,
      text: currentChunk.trim(),
      meta: { chunkIndex, charCount: currentChunk.length },
    });
  }

  return chunks;
}

// ============================================================================
// Exports
// ============================================================================

export const DoclingExtractor = {
  extract: extractWithDocling,
  isSupported: isSupportedByDocling,
  isAvailable: () => DOCLING_ENABLED && isDoclingAvailable(),
  config: {
    enabled: DOCLING_ENABLED,
    storageDir: DOCLING_STORAGE_DIR,
    supportedMimeTypes: DOCLING_SUPPORTED_MIMETYPES,
  },
};

export default DoclingExtractor;
