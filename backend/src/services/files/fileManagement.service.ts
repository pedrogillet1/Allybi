// src/services/files/fileManagement.service.ts

/**
 * FileManagementService
 * Owns write operations + lifecycle:
 * - validate → store → create DB record → enqueue ingestion/indexing
 * - rename/move/tag → update DB → emit events
 * - delete → soft-delete → enqueue purge → return job id
 *
 * NOTES
 * - Listing/search belongs to FileInventoryService.
 * - This service is PURE orchestration: it does not parse docs itself.
 */

import crypto from 'crypto';

export type StorageProvider = 'local' | 's3';

export interface UploadInput {
  originalName: string;       // e.g. "report.pdf"
  mimeType: string;           // e.g. "application/pdf"
  sizeBytes: number;
  buffer: Buffer;             // (or stream in your controller)
  folderPath?: string;        // optional
}

export interface FileRecord {
  id: string;
  ownerUserId: string;

  filename: string;
  extension: string;
  mimeType: string;

  storageKey: string;
  storageProvider: StorageProvider;

  folderPath?: string;

  sizeBytes?: number;

  createdAt: string;
  updatedAt: string;

  isDeleted?: boolean;
  isProcessing?: boolean;

  // optional indexing metadata
  indexedAt?: string | null;
  extractionStatus?: 'pending' | 'ok' | 'failed';
  extractionError?: string | null;

  tags?: string[];
  domainId?: string | null;
}

export interface FileRepo {
  create(file: FileRecord): Promise<FileRecord>;
  update(userId: string, fileId: string, patch: Partial<FileRecord>): Promise<FileRecord>;
  getById(userId: string, fileId: string): Promise<FileRecord | null>;
  softDelete(userId: string, fileId: string): Promise<FileRecord | null>;
  listByUser(userId: string): Promise<FileRecord[]>;
}

export interface StorageAdapter {
  provider: StorageProvider;

  putObject(params: {
    key: string;
    contentType: string;
    body: Buffer;
    metadata?: Record<string, string>;
  }): Promise<{ key: string }>;

  deleteObject(key: string): Promise<void>;

  // Optional: presigned urls if you want direct-to-s3 later
  // createPresignedPutUrl(...): Promise<string>;
}

export interface IngestionQueue {
  enqueueIngestJob(params: {
    userId: string;
    fileId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
    extension: string;
  }): Promise<{ jobId: string }>;

  enqueueDeleteJob(params: {
    userId: string;
    fileId: string;
    storageKey: string;
  }): Promise<{ jobId: string }>;
}

export interface FileValidator {
  validateUpload(input: UploadInput): {
    ok: boolean;
    reason?: string;
    normalized: {
      filename: string;
      extension: string;
      mimeType: string;
      sizeBytes: number;
    };
  };
}

export interface Clock {
  nowIso(): string;
}

export interface Logger {
  info(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}

export class FileManagementService {
  constructor(
    private readonly repo: FileRepo,
    private readonly storage: StorageAdapter,
    private readonly queue: IngestionQueue,
    private readonly validator: FileValidator,
    private readonly clock: Clock = { nowIso: () => new Date().toISOString() },
    private readonly logger: Logger = console
  ) {}

  // -----------------------------
  // Upload (create + ingest)
  // -----------------------------

  async upload(userId: string, input: UploadInput): Promise<{
    file: FileRecord;
    ingestJobId: string;
  }> {
    const validated = this.validator.validateUpload(input);
    if (!validated.ok) {
      throw new Error(validated.reason || 'Upload rejected');
    }

    const now = this.clock.nowIso();
    const fileId = this.makeId('doc');
    const storageKey = this.makeStorageKey(userId, fileId, validated.normalized.filename);

    // 1) Store raw
    await this.storage.putObject({
      key: storageKey,
      contentType: validated.normalized.mimeType,
      body: input.buffer,
      metadata: {
        ownerUserId: userId,
        fileId,
        filename: validated.normalized.filename,
      },
    });

    // 2) Create DB record
    const created = await this.repo.create({
      id: fileId,
      ownerUserId: userId,
      filename: validated.normalized.filename,
      extension: validated.normalized.extension,
      mimeType: validated.normalized.mimeType,
      storageKey,
      storageProvider: this.storage.provider,
      folderPath: input.folderPath,
      sizeBytes: validated.normalized.sizeBytes,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      isProcessing: true,
      indexedAt: null,
      extractionStatus: 'pending',
      extractionError: null,
      tags: [],
      domainId: null,
    });

    // 3) Enqueue ingestion/indexing
    const { jobId } = await this.queue.enqueueIngestJob({
      userId,
      fileId: created.id,
      storageKey: created.storageKey,
      filename: created.filename,
      mimeType: created.mimeType,
      extension: created.extension,
    });

    this.logger.info('[FileManagement] upload queued', {
      userId,
      fileId: created.id,
      jobId,
      filename: created.filename,
      storageProvider: created.storageProvider,
    });

    return { file: created, ingestJobId: jobId };
  }

  // -----------------------------
  // Update operations
  // -----------------------------

  async rename(userId: string, fileId: string, newFilename: string): Promise<FileRecord> {
    const now = this.clock.nowIso();

    // Keep extension consistent unless you explicitly want to allow changing it.
    const current = await this.repo.getById(userId, fileId);
    if (!current || current.isDeleted) throw new Error('File not found');

    const normalized = this.normalizeFilename(newFilename);
    const newExt = this.getExtension(normalized);

    // Disallow changing extension (prevents mismatch with extraction/index)
    if (newExt && newExt !== current.extension) {
      throw new Error(`Cannot change extension from .${current.extension} to .${newExt}`);
    }

    const updated = await this.repo.update(userId, fileId, {
      filename: normalized,
      updatedAt: now,
    });

    this.logger.info('[FileManagement] renamed', { userId, fileId, filename: normalized });
    return updated;
  }

  async move(userId: string, fileId: string, folderPath: string | null): Promise<FileRecord> {
    const now = this.clock.nowIso();
    const updated = await this.repo.update(userId, fileId, {
      folderPath: folderPath || undefined,
      updatedAt: now,
    });

    this.logger.info('[FileManagement] moved', { userId, fileId, folderPath });
    return updated;
  }

  async setTags(userId: string, fileId: string, tags: string[]): Promise<FileRecord> {
    const now = this.clock.nowIso();
    const clean = [...new Set((tags || []).map(t => t.trim()).filter(Boolean))].slice(0, 32);

    const updated = await this.repo.update(userId, fileId, {
      tags: clean,
      updatedAt: now,
    });

    this.logger.info('[FileManagement] tags updated', { userId, fileId, tagsCount: clean.length });
    return updated;
  }

  // Called by ingestion worker when indexing finishes
  async markIngested(userId: string, fileId: string, params: {
    extractionStatus: 'ok' | 'failed';
    extractionError?: string | null;
    domainId?: string | null;
    indexedAt?: string;
  }): Promise<FileRecord> {
    const now = this.clock.nowIso();
    return this.repo.update(userId, fileId, {
      isProcessing: false,
      extractionStatus: params.extractionStatus,
      extractionError: params.extractionError ?? null,
      domainId: params.domainId ?? null,
      indexedAt: params.indexedAt ?? now,
      updatedAt: now,
    });
  }

  // -----------------------------
  // Delete (soft delete + async purge)
  // -----------------------------

  async delete(userId: string, fileId: string): Promise<{
    deleted: boolean;
    deleteJobId?: string;
  }> {
    const file = await this.repo.getById(userId, fileId);
    if (!file || file.isDeleted) return { deleted: false };

    // 1) Soft delete
    const deleted = await this.repo.softDelete(userId, fileId);
    if (!deleted) return { deleted: false };

    // 2) Queue purge (storage + index cleanup)
    const { jobId } = await this.queue.enqueueDeleteJob({
      userId,
      fileId,
      storageKey: file.storageKey,
    });

    this.logger.info('[FileManagement] delete queued', { userId, fileId, jobId });
    return { deleted: true, deleteJobId: jobId };
  }

  // Optional: Hard purge (admin/tooling). Normally deletion worker does it.
  async purgeStorageOnly(userId: string, fileId: string): Promise<void> {
    const file = await this.repo.getById(userId, fileId);
    if (!file) return;
    await this.storage.deleteObject(file.storageKey);
    this.logger.warn('[FileManagement] storage purged', { userId, fileId });
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private makeId(prefix: string): string {
    const rand = crypto.randomBytes(10).toString('hex');
    return `${prefix}:${rand}`;
  }

  private makeStorageKey(userId: string, fileId: string, filename: string): string {
    const safeName = filename.replace(/[^\w.\-() ]+/g, '_').trim();
    return `users/${userId}/docs/${fileId}/${safeName}`;
  }

  private normalizeFilename(name: string): string {
    const base = (name || '').split('/').pop()?.split('\\').pop() || '';
    return base.replace(/\s+/g, ' ').trim();
  }

  private getExtension(filename: string): string {
    const m = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    return m ? m[1] : '';
  }
}
