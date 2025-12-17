/**
 * ============================================================================
 * DOCUMENT PROGRESS SERVICE - FIXED
 * ============================================================================
 * 
 * PURPOSE: Granular progress tracking for document processing
 * 
 * FIXES:
 * - ❌ Progress jumps 20% → 100% → ✅ Granular stages (0-100%)
 * - ⚠️ Missing 40-80% granularity → ✅ 12 distinct stages
 * - ❌ UI shows 100% before done → ✅ 100% only after verification
 * 
 * PROGRESS STAGES:
 * 0-20%:   Upload (handled by frontend/middleware)
 * 20-30%:  Text extraction
 * 30-40%:  Text cleaning & preprocessing
 * 40-50%:  Document analysis
 * 50-60%:  Chunking
 * 60-70%:  Embedding generation
 * 70-80%:  Vector storage
 * 80-90%:  Database records
 * 90-95%:  Search indexing
 * 95-99%:  Verification
 * 100%:    Complete (only after all verification passes)
 */

import uploadSessionService from './uploadSession.service';

export interface ProgressStage {
  name: string;
  progress: number;
  message: string;
  timestamp: Date;
}

export interface DocumentProgressOptions {
  documentId: string;
  userId: string;
  filename: string;
  sessionId?: string;
}

export class DocumentProgressService {
  
  /**
   * Progress stage definitions
   */
  private readonly STAGES = {
    // Upload stages (0-20%) - handled by upload middleware
    UPLOAD_START: { progress: 0, message: 'Starting upload...' },
    UPLOAD_PROGRESS: { progress: 10, message: 'Uploading file...' },
    UPLOAD_COMPLETE: { progress: 20, message: 'Upload complete' },
    
    // Processing stages (20-100%)
    EXTRACTION_START: { progress: 22, message: 'Extracting text from document...' },
    EXTRACTION_PROGRESS: { progress: 25, message: 'Processing document content...' },
    EXTRACTION_COMPLETE: { progress: 30, message: 'Text extraction complete' },
    
    CLEANING_START: { progress: 32, message: 'Cleaning and preprocessing text...' },
    CLEANING_COMPLETE: { progress: 40, message: 'Text preprocessing complete' },
    
    ANALYSIS_START: { progress: 42, message: 'Analyzing document...' },
    ANALYSIS_COMPLETE: { progress: 50, message: 'Document analysis complete' },
    
    CHUNKING_START: { progress: 52, message: 'Creating document chunks...' },
    CHUNKING_PROGRESS: { progress: 55, message: 'Optimizing chunk boundaries...' },
    CHUNKING_COMPLETE: { progress: 60, message: 'Chunking complete' },
    
    EMBEDDING_START: { progress: 62, message: 'Generating embeddings...' },
    EMBEDDING_BATCH_1: { progress: 65, message: 'Processing embedding batch 1...' },
    EMBEDDING_BATCH_2: { progress: 68, message: 'Processing embedding batch 2...' },
    EMBEDDING_COMPLETE: { progress: 70, message: 'Embeddings generated' },
    
    VECTOR_STORE_START: { progress: 72, message: 'Storing vectors...' },
    VECTOR_STORE_PROGRESS: { progress: 75, message: 'Upserting to vector database...' },
    VECTOR_STORE_COMPLETE: { progress: 80, message: 'Vectors stored' },
    
    DATABASE_START: { progress: 82, message: 'Creating database records...' },
    DATABASE_PROGRESS: { progress: 85, message: 'Saving metadata...' },
    DATABASE_COMPLETE: { progress: 90, message: 'Database records created' },
    
    INDEXING_START: { progress: 92, message: 'Creating search indexes...' },
    INDEXING_COMPLETE: { progress: 95, message: 'Indexing complete' },
    
    VERIFICATION_START: { progress: 96, message: 'Verifying embeddings...' },
    VERIFICATION_COMPLETE: { progress: 99, message: 'Verification complete' },
    
    COMPLETE: { progress: 100, message: 'Processing complete!' }
  };

  /**
   * Emit progress update
   */
  async emitProgress(
    stage: keyof typeof this.STAGES,
    options: DocumentProgressOptions,
    customMessage?: string
  ): Promise<void> {
    const stageInfo = this.STAGES[stage];
    const message = customMessage || stageInfo.message;

    try {
      const io = require('../server').io;
      
      if (io) {
        // Emit document-level progress
        io.to(`user:${options.userId}`).emit('document-processing-update', {
          documentId: options.documentId,
          filename: options.filename,
          stage: stage.toLowerCase(),
          progress: stageInfo.progress,
          message,
          status: stageInfo.progress === 100 ? 'completed' : 'processing',
          timestamp: new Date()
        });
      }

      // Update session if provided
      if (options.sessionId) {
        await uploadSessionService.updateFileProgress(
          options.sessionId,
          options.documentId,
          stageInfo.progress,
          stage.toLowerCase(),
          stageInfo.progress === 100 ? 'completed' : 'processing'
        );
      }

      console.log(`📊 [${options.filename}] ${stageInfo.progress}% - ${message}`);
      
    } catch (error) {
      console.error('Error emitting progress:', error);
    }
  }

  /**
   * Emit custom progress (for intermediate steps)
   */
  async emitCustomProgress(
    progress: number,
    message: string,
    options: DocumentProgressOptions
  ): Promise<void> {
    try {
      const io = require('../server').io;
      
      if (io) {
        io.to(`user:${options.userId}`).emit('document-processing-update', {
          documentId: options.documentId,
          filename: options.filename,
          stage: 'custom',
          progress,
          message,
          status: 'processing',
          timestamp: new Date()
        });
      }

      // Update session if provided
      if (options.sessionId) {
        await uploadSessionService.updateFileProgress(
          options.sessionId,
          options.documentId,
          progress,
          'custom'
        );
      }

      console.log(`📊 [${options.filename}] ${progress}% - ${message}`);
      
    } catch (error) {
      console.error('Error emitting custom progress:', error);
    }
  }

  /**
   * Emit error and mark as failed
   */
  async emitError(
    error: string,
    options: DocumentProgressOptions
  ): Promise<void> {
    try {
      const io = require('../server').io;
      
      if (io) {
        io.to(`user:${options.userId}`).emit('document-processing-update', {
          documentId: options.documentId,
          filename: options.filename,
          stage: 'failed',
          progress: 0,
          message: error,
          status: 'failed',
          error,
          timestamp: new Date()
        });
      }

      // Update session if provided
      if (options.sessionId) {
        await uploadSessionService.markFileFailed(
          options.sessionId,
          options.documentId,
          error
        );
      }

      console.error(`❌ [${options.filename}] Failed: ${error}`);
      
    } catch (err) {
      console.error('Error emitting error:', err);
    }
  }

  /**
   * Calculate embedding batch progress
   * For multiple batches, interpolate between 62% and 70%
   */
  calculateEmbeddingProgress(currentBatch: number, totalBatches: number): number {
    const startProgress = 62;
    const endProgress = 70;
    const range = endProgress - startProgress;
    
    const batchProgress = (currentBatch / totalBatches) * range;
    return Math.round(startProgress + batchProgress);
  }

  /**
   * Get all stage definitions (for documentation/debugging)
   */
  getStages() {
    return this.STAGES;
  }
}

// Infrastructure singleton - kept for backward compatibility
// Can also be accessed via container.getDocumentProgress()
export default new DocumentProgressService();
