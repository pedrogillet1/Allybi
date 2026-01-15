/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UploadProgressStore - CANONICAL PROGRESS TRACKING WITH HARD INVARIANTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the SINGLE SOURCE OF TRUTH for all upload progress tracking.
 *
 * NON-NEGOTIABLE INVARIANTS:
 * A) Progress must be MONOTONIC per file and per batch: NEVER decreases
 * B) Progress must be CLAMPED to [0, 100] always
 * C) Batch progress must be computed from BYTES, not file count
 * D) Size shown during upload must always use local File.size (never 0)
 * E) UI cannot reset progress when switching phases
 * F) Upload must remain smooth: throttled updates but never "stuck then jump"
 *
 * USAGE:
 *   const store = new UploadProgressStore();
 *   store.initSession(sessionId, files);
 *   store.updateFileProgress(fileKey, bytesUploaded);
 *   const progress = store.getProgress();
 *   store.cleanup();
 *
 * DEBUG: Set window.DEBUG_UPLOAD = true in console to enable verbose logging
 */

// Generate stable file key that won't collide
export function generateFileKey(file) {
  const path = file.webkitRelativePath || file.name;
  const size = file.size;
  const lastModified = file.lastModified || 0;
  return `${path}::${size}::${lastModified}`;
}

/**
 * Single file progress state
 */
class FileProgressState {
  constructor(file, fileKey) {
    this.fileKey = fileKey;
    this.name = file.name;
    this.size = file.size; // ALWAYS from local File object, never 0
    this.bytesUploaded = 0;
    this.percent = 0;
    this.status = 'pending'; // pending | uploading | completed | failed
    this.lastUpdateTime = Date.now();
  }

  /**
   * Update bytes uploaded with MONOTONIC enforcement
   * Returns true if update was applied, false if rejected (non-monotonic)
   */
  update(bytesUploaded) {
    // INVARIANT A: Monotonic - never decrease
    if (bytesUploaded < this.bytesUploaded) {
      if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
        console.warn(`[ProgressStore] REJECTED non-monotonic update for ${this.name}: ${this.bytesUploaded} → ${bytesUploaded}`);
      }
      return false;
    }

    // INVARIANT D: Size must always be positive
    if (this.size <= 0) {
      console.error(`[ProgressStore] Invalid file size for ${this.name}: ${this.size}`);
      return false;
    }

    // INVARIANT B: Clamp bytes to file size (prevents > 100%)
    const clampedBytes = Math.min(bytesUploaded, this.size);

    // Calculate percent with bounds
    const rawPercent = (clampedBytes / this.size) * 100;
    const clampedPercent = Math.max(0, Math.min(100, rawPercent));

    // Only apply if actually changed
    if (clampedBytes === this.bytesUploaded && clampedPercent === this.percent) {
      return false;
    }

    const oldBytes = this.bytesUploaded;
    const oldPercent = this.percent;

    this.bytesUploaded = clampedBytes;
    this.percent = clampedPercent;
    this.lastUpdateTime = Date.now();

    if (this.bytesUploaded >= this.size) {
      this.status = 'completed';
    } else if (this.bytesUploaded > 0) {
      this.status = 'uploading';
    }

    if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
      console.log(`[ProgressStore] ${this.name}: ${oldBytes}→${clampedBytes} bytes (${oldPercent.toFixed(1)}→${clampedPercent.toFixed(1)}%)`);
    }

    return true;
  }

  markFailed() {
    this.status = 'failed';
  }

  markCompleted() {
    this.bytesUploaded = this.size;
    this.percent = 100;
    this.status = 'completed';
  }
}

/**
 * Upload Session State - tracks all files in a batch upload
 */
class UploadSessionState {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.files = new Map(); // fileKey → FileProgressState
    this.phase = 'preparing'; // preparing | presign | uploading | finalizing | reconciling | complete | error
    this.batchTotalBytes = 0;
    this.lastEmittedPercent = 0;
    this.lastEmitTime = 0;
    this.createdAt = Date.now();
    this.throughputSamples = [];
    this.lastThroughputSample = { time: Date.now(), bytes: 0 };
  }

  /**
   * Add files to track
   */
  addFiles(files) {
    for (const file of files) {
      const key = generateFileKey(file);
      if (!this.files.has(key)) {
        this.files.set(key, new FileProgressState(file, key));
        this.batchTotalBytes += file.size;
      }
    }

    if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
      console.log(`[ProgressStore] Session ${this.sessionId.slice(0,8)}: Added ${files.length} files, total ${this.formatSize(this.batchTotalBytes)}`);
    }
  }

  /**
   * Update progress for a specific file
   */
  updateFileProgress(fileKey, bytesUploaded) {
    const fileState = this.files.get(fileKey);
    if (!fileState) {
      if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
        console.warn(`[ProgressStore] Unknown file key: ${fileKey.slice(0, 50)}...`);
      }
      return false;
    }
    return fileState.update(bytesUploaded);
  }

  /**
   * Mark a file as completed (100%)
   */
  markFileCompleted(fileKey) {
    const fileState = this.files.get(fileKey);
    if (fileState) {
      fileState.markCompleted();
    }
  }

  /**
   * Mark a file as failed
   */
  markFileFailed(fileKey) {
    const fileState = this.files.get(fileKey);
    if (fileState) {
      fileState.markFailed();
    }
  }

  /**
   * Set current phase (does NOT reset progress)
   */
  setPhase(phase) {
    const oldPhase = this.phase;
    this.phase = phase;

    if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
      console.log(`[ProgressStore] Session ${this.sessionId.slice(0,8)}: Phase ${oldPhase} → ${phase}`);
    }
  }

  /**
   * Calculate batch progress from bytes (INVARIANT C)
   * Returns normalized progress object
   */
  getProgress() {
    // Sum up all bytes uploaded across files
    let batchBytesUploaded = 0;
    let completedFiles = 0;
    let failedFiles = 0;

    for (const fileState of this.files.values()) {
      batchBytesUploaded += fileState.bytesUploaded;
      if (fileState.status === 'completed') completedFiles++;
      if (fileState.status === 'failed') failedFiles++;
    }

    // INVARIANT C: Progress from bytes, not file count
    // INVARIANT B: Clamp to [0, 100]
    let batchPercent = 0;
    if (this.batchTotalBytes > 0) {
      // Clamp bytes to prevent > 100%
      const clampedBytes = Math.min(batchBytesUploaded, this.batchTotalBytes);
      batchPercent = (clampedBytes / this.batchTotalBytes) * 100;
    }

    // INVARIANT A: Monotonic - never decrease (except error)
    if (this.phase !== 'error' && batchPercent < this.lastEmittedPercent) {
      batchPercent = this.lastEmittedPercent;
    }

    // INVARIANT B: Final clamp
    batchPercent = Math.max(0, Math.min(100, batchPercent));

    // Sample throughput (every 500ms)
    const now = Date.now();
    if (now - this.lastThroughputSample.time >= 500) {
      const bytesDelta = batchBytesUploaded - this.lastThroughputSample.bytes;
      const timeDelta = (now - this.lastThroughputSample.time) / 1000;
      const throughputBps = bytesDelta / timeDelta;
      const throughputMbps = (throughputBps * 8) / (1024 * 1024);

      this.throughputSamples.push({ time: now, throughputMbps });
      if (this.throughputSamples.length > 20) {
        this.throughputSamples.shift();
      }

      this.lastThroughputSample = { time: now, bytes: batchBytesUploaded };
    }

    // Calculate smoothed throughput (EWMA)
    let smoothedThroughput = 0;
    if (this.throughputSamples.length > 0) {
      const alpha = 0.3;
      for (const sample of this.throughputSamples) {
        smoothedThroughput = alpha * sample.throughputMbps + (1 - alpha) * smoothedThroughput;
      }
    }

    // Calculate ETA
    let etaSeconds = null;
    const remainingBytes = this.batchTotalBytes - batchBytesUploaded;
    if (smoothedThroughput > 0 && remainingBytes > 0) {
      const bytesPerSecond = (smoothedThroughput * 1024 * 1024) / 8;
      etaSeconds = Math.ceil(remainingBytes / bytesPerSecond);
    }

    // Update last emitted (for monotonicity check)
    this.lastEmittedPercent = batchPercent;
    this.lastEmitTime = now;

    return {
      sessionId: this.sessionId,
      phase: this.phase,
      percentage: batchPercent,
      bytesUploaded: batchBytesUploaded,
      totalBytes: this.batchTotalBytes, // INVARIANT D: Always positive from files
      throughputMbps: smoothedThroughput,
      etaSeconds,
      completedFiles,
      failedFiles,
      totalFiles: this.files.size,
      // Include timestamp for debugging
      _timestamp: now,
      _lastEmittedPercent: this.lastEmittedPercent
    };
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

/**
 * Global Upload Progress Store - manages all upload sessions
 */
class UploadProgressStore {
  constructor() {
    this.sessions = new Map(); // sessionId → UploadSessionState
    this.activeSessionId = null;
  }

  /**
   * Initialize a new upload session with files
   */
  initSession(sessionId, files) {
    if (this.sessions.has(sessionId)) {
      console.warn(`[ProgressStore] Session ${sessionId} already exists, reusing`);
      return this.sessions.get(sessionId);
    }

    const session = new UploadSessionState(sessionId);
    session.addFiles(files);
    this.sessions.set(sessionId, session);
    this.activeSessionId = sessionId;

    if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
      console.log(`[ProgressStore] Created session ${sessionId.slice(0,8)} with ${files.length} files`);
    }

    return session;
  }

  /**
   * Get or create session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session
   */
  getActiveSession() {
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * Update file progress by fileKey
   */
  updateFileProgress(sessionId, fileKey, bytesUploaded) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[ProgressStore] No session found: ${sessionId}`);
      return false;
    }
    return session.updateFileProgress(fileKey, bytesUploaded);
  }

  /**
   * Update file progress using file object (generates key internally)
   */
  updateFileProgressByFile(sessionId, file, bytesUploaded) {
    const fileKey = generateFileKey(file);
    return this.updateFileProgress(sessionId, fileKey, bytesUploaded);
  }

  /**
   * Set session phase
   */
  setPhase(sessionId, phase) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.setPhase(phase);
    }
  }

  /**
   * Mark file completed
   */
  markFileCompleted(sessionId, fileKey) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.markFileCompleted(fileKey);
    }
  }

  /**
   * Mark file failed
   */
  markFileFailed(sessionId, fileKey) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.markFileFailed(fileKey);
    }
  }

  /**
   * Get normalized progress for session
   */
  getProgress(sessionId) {
    const session = this.sessions.get(sessionId || this.activeSessionId);
    if (!session) {
      return {
        percentage: 0,
        bytesUploaded: 0,
        totalBytes: 0,
        phase: 'unknown'
      };
    }
    return session.getProgress();
  }

  /**
   * Cleanup session
   */
  cleanup(sessionId) {
    const id = sessionId || this.activeSessionId;
    if (this.sessions.has(id)) {
      this.sessions.delete(id);
      if (this.activeSessionId === id) {
        this.activeSessionId = null;
      }
      if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
        console.log(`[ProgressStore] Cleaned up session ${id.slice(0,8)}`);
      }
    }
  }

  /**
   * Cleanup all sessions
   */
  cleanupAll() {
    this.sessions.clear();
    this.activeSessionId = null;
  }
}

// Singleton instance
const uploadProgressStore = new UploadProgressStore();

export default uploadProgressStore;
export { UploadProgressStore, UploadSessionState, FileProgressState, generateFileKey as createFileKey };
