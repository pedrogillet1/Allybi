/**
 * ============================================================================
 * UPLOAD SESSION SERVICE - NEW
 * ============================================================================
 * 
 * PURPOSE: Track batch uploads with unique session IDs
 * 
 * FIXES:
 * - ❌ No uploadId system → ✅ UUID-based session tracking
 * - ❌ No session tracking → ✅ Redis-based session storage
 * - ⚠️ Per-file progress only → ✅ Batch progress aggregation
 * 
 * FEATURES:
 * - Track multiple files in single upload session
 * - Aggregate progress across all files
 * - Real-time WebSocket updates
 * - Session expiry (24 hours)
 * - Error tracking per file
 */

import { v4 as uuidv4 } from 'uuid';
import cacheService from './cache.service';

export interface UploadSessionFile {
  documentId: string;
  filename: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStage: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface UploadSession {
  sessionId: string;
  userId: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  files: Map<string, UploadSessionFile>;
  overallProgress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'partial' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

class UploadSessionService {
  private readonly SESSION_PREFIX = 'upload:session:';
  private readonly SESSION_TTL = 86400; // 24 hours

  /**
   * Create new upload session
   */
  async createSession(userId: string, fileCount: number): Promise<string> {
    const sessionId = uuidv4();
    
    const session: UploadSession = {
      sessionId,
      userId,
      totalFiles: fileCount,
      completedFiles: 0,
      failedFiles: 0,
      files: new Map(),
      overallProgress: 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.saveSession(session);
    
    console.log(`✅ Created upload session ${sessionId} for ${fileCount} files`);
    
    return sessionId;
  }

  /**
   * Add file to session
   */
  async addFile(
    sessionId: string,
    documentId: string,
    filename: string,
    fileSize: number
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    const file: UploadSessionFile = {
      documentId,
      filename,
      fileSize,
      status: 'pending',
      progress: 0,
      currentStage: 'queued',
      startedAt: new Date()
    };

    session.files.set(documentId, file);
    session.updatedAt = new Date();

    await this.saveSession(session);
  }

  /**
   * Update file progress
   */
  async updateFileProgress(
    sessionId: string,
    documentId: string,
    progress: number,
    stage: string,
    status?: 'uploading' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found`);
      return;
    }

    const file = session.files.get(documentId);
    if (!file) {
      console.warn(`File ${documentId} not found in session ${sessionId}`);
      return;
    }

    // Update file
    file.progress = progress;
    file.currentStage = stage;
    if (status) {
      file.status = status;
    }

    if (status === 'completed') {
      file.completedAt = new Date();
      session.completedFiles++;
    } else if (status === 'failed') {
      file.completedAt = new Date();
      session.failedFiles++;
    }

    // Recalculate overall progress
    session.overallProgress = this.calculateOverallProgress(session);
    session.updatedAt = new Date();

    // Update session status
    if (session.completedFiles + session.failedFiles === session.totalFiles) {
      if (session.failedFiles === 0) {
        session.status = 'completed';
      } else if (session.completedFiles === 0) {
        session.status = 'failed';
      } else {
        session.status = 'partial';
      }
      session.completedAt = new Date();
    } else if (session.completedFiles > 0 || session.failedFiles > 0) {
      session.status = 'processing';
    }

    await this.saveSession(session);

    // Emit WebSocket update
    await this.emitSessionUpdate(session);
  }

  /**
   * Mark file as failed
   */
  async markFileFailed(
    sessionId: string,
    documentId: string,
    error: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const file = session.files.get(documentId);
    if (!file) return;

    file.status = 'failed';
    file.error = error;
    file.completedAt = new Date();
    file.progress = 0;

    session.failedFiles++;
    session.updatedAt = new Date();

    // Recalculate overall progress
    session.overallProgress = this.calculateOverallProgress(session);

    // Check if all files are done
    if (session.completedFiles + session.failedFiles === session.totalFiles) {
      if (session.failedFiles === session.totalFiles) {
        session.status = 'failed';
      } else {
        session.status = 'partial';
      }
      session.completedAt = new Date();
    }

    await this.saveSession(session);
    await this.emitSessionUpdate(session);
  }

  /**
   * Get session
   */
  async getSession(sessionId: string): Promise<UploadSession | null> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    const data = await cacheService.get<string>(key);

    if (!data) {
      return null;
    }

    // Parse and reconstruct Map
    const parsed = JSON.parse(data as string);
    parsed.files = new Map(Object.entries(parsed.files));
    parsed.createdAt = new Date(parsed.createdAt);
    parsed.updatedAt = new Date(parsed.updatedAt);
    if (parsed.completedAt) {
      parsed.completedAt = new Date(parsed.completedAt);
    }

    return parsed as UploadSession;
  }

  /**
   * Save session to Redis
   */
  private async saveSession(session: UploadSession): Promise<void> {
    const key = `${this.SESSION_PREFIX}${session.sessionId}`;
    
    // Convert Map to object for JSON serialization
    const serializable = {
      ...session,
      files: Object.fromEntries(session.files)
    };

    await cacheService.set(key, JSON.stringify(serializable), { ttl: this.SESSION_TTL });
  }

  /**
   * Calculate overall progress across all files
   */
  private calculateOverallProgress(session: UploadSession): number {
    if (session.totalFiles === 0) return 0;

    let totalProgress = 0;
    session.files.forEach(file => {
      totalProgress += file.progress;
    });

    return Math.round(totalProgress / session.totalFiles);
  }

  /**
   * Emit WebSocket update for session
   */
  private async emitSessionUpdate(session: UploadSession): Promise<void> {
    try {
      const io = require('../server').io;
      if (!io) return;

      // Convert Map to array for transmission
      const filesArray = Array.from(session.files.values());

      io.to(`user:${session.userId}`).emit('upload-session-update', {
        sessionId: session.sessionId,
        totalFiles: session.totalFiles,
        completedFiles: session.completedFiles,
        failedFiles: session.failedFiles,
        overallProgress: session.overallProgress,
        status: session.status,
        files: filesArray,
        updatedAt: session.updatedAt
      });
    } catch (error) {
      console.error('Error emitting session update:', error);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `${this.SESSION_PREFIX}${sessionId}`;
    await cacheService.del(key);
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId: string): Promise<UploadSession[]> {
    // This would require scanning Redis keys or maintaining a user→sessions index
    // For now, return empty array (can be enhanced later)
    return [];
  }
}

export default new UploadSessionService();
