// src/services/files/deletion.service.ts

import crypto from "crypto";

export type DeletionMode = "soft" | "hard";
export type DeletionJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface DeleteRequest {
  userId: string;
  documentIds: string[];
  mode: DeletionMode;
  reason?: string;
  requestedBy?: "user" | "system" | "admin";
  /**
   * If true, run immediately in-process (useful for dev/local or small batches).
   * If false/undefined, enqueue (preferred for production).
   */
  runInline?: boolean;
}

export interface DeletionJobProgress {
  total: number;
  done: number;
  currentDocumentId?: string;
  stage?:
    | "validating"
    | "marking"
    | "index_cleanup"
    | "storage_delete"
    | "metadata_delete"
    | "finalizing";
  message?: string;
}

export interface DeletionJob {
  id: string;
  userId: string;
  documentIds: string[];
  mode: DeletionMode;
  status: DeletionJobStatus;
  createdAt: string;
  updatedAt: string;
  requestedBy: "user" | "system" | "admin";
  reason?: string;

  progress: DeletionJobProgress;

  // Error info (if failed)
  error?: {
    code: string;
    message: string;
    detail?: any;
  };
}

/**
 * Minimal record for a document known to the system.
 * You can extend this to match your DB model.
 */
export interface DocumentRecord {
  id: string;
  ownerUserId: string;
  storageKey: string; // path/key to physical file
  derivedKeys?: string[]; // previews, thumbnails, extracted artifacts
  isDeleted?: boolean; // for soft delete
}

/**
 * Storage layer abstraction (S3/local/etc).
 * - deleteObject should be idempotent (deleting missing object must not throw).
 */
export interface FileStore {
  deleteObject(key: string): Promise<void>;
  deleteMany?(keys: string[]): Promise<void>;
}

/**
 * Search/index abstraction (embeddings/vector index/keyword index).
 * - removeDocument should be idempotent.
 */
export interface SearchIndex {
  removeDocument(docId: string): Promise<void>;
  removeMany?(docIds: string[]): Promise<void>;
}

/**
 * Metadata store abstraction (DB/prisma).
 * - must enforce ownership/access checks.
 */
export interface DocumentRepository {
  /** Fetch docs; must return only docs visible to userId (or include ownerUserId to validate). */
  getByIds(userId: string, docIds: string[]): Promise<DocumentRecord[]>;
  /** Mark as deleting or soft-deleted */
  markDeleting(userId: string, docIds: string[]): Promise<void>;
  softDelete(userId: string, docIds: string[]): Promise<void>;
  /** Hard delete metadata rows */
  hardDelete(userId: string, docIds: string[]): Promise<void>;
}

/**
 * Optional queue abstraction (BullMQ, SQS, etc).
 * If you have a worker (document-worker.ts), it should call deletionService.processJob(jobId).
 */
export interface JobQueue {
  enqueueDeletionJob(jobId: string): Promise<void>;
  cancelDeletionJob?(jobId: string): Promise<void>;
}

/**
 * Job store abstraction. In production, back this with DB.
 * In local/dev, in-memory is OK.
 */
export interface DeletionJobStore {
  create(job: DeletionJob): Promise<void>;
  get(jobId: string): Promise<DeletionJob | null>;
  update(jobId: string, patch: Partial<DeletionJob>): Promise<void>;
}

/**
 * Default in-memory job store (dev/local). Not suitable for multi-instance production.
 */
export class InMemoryDeletionJobStore implements DeletionJobStore {
  private readonly jobs = new Map<string, DeletionJob>();

  async create(job: DeletionJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async get(jobId: string): Promise<DeletionJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async update(jobId: string, patch: Partial<DeletionJob>): Promise<void> {
    const current = this.jobs.get(jobId);
    if (!current) return;
    const updated: DeletionJob = {
      ...current,
      ...patch,
      progress: patch.progress
        ? { ...current.progress, ...patch.progress }
        : current.progress,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
  }
}

export interface DeletionServiceDeps {
  repo: DocumentRepository;
  store: FileStore;
  index: SearchIndex;
  jobs: DeletionJobStore;
  queue?: JobQueue;
  logger?: Pick<Console, "info" | "warn" | "error">;
  /** If true, will try bulk operations when available (removeMany/deleteMany). */
  preferBulkOps?: boolean;
}

export class DeletionService {
  private readonly repo: DocumentRepository;
  private readonly store: FileStore;
  private readonly index: SearchIndex;
  private readonly jobs: DeletionJobStore;
  private readonly queue?: JobQueue;
  private readonly log: Pick<Console, "info" | "warn" | "error">;
  private readonly preferBulkOps: boolean;

  constructor(deps: DeletionServiceDeps) {
    this.repo = deps.repo;
    this.store = deps.store;
    this.index = deps.index;
    this.jobs = deps.jobs;
    this.queue = deps.queue;
    this.log = deps.logger ?? console;
    this.preferBulkOps = deps.preferBulkOps ?? true;
  }

  /**
   * Create a deletion job and either enqueue it or run inline.
   */
  async requestDeletion(req: DeleteRequest): Promise<DeletionJob> {
    if (!req.userId) throw new Error("DeleteRequest.userId is required");
    if (!Array.isArray(req.documentIds) || req.documentIds.length === 0) {
      throw new Error("DeleteRequest.documentIds must be a non-empty array");
    }
    if (req.mode !== "soft" && req.mode !== "hard") {
      throw new Error('DeleteRequest.mode must be "soft" or "hard"');
    }

    const now = new Date().toISOString();
    const jobId = this.makeJobId(req.userId);

    const job: DeletionJob = {
      id: jobId,
      userId: req.userId,
      documentIds: Array.from(new Set(req.documentIds)),
      mode: req.mode,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      requestedBy: req.requestedBy ?? "user",
      reason: req.reason,
      progress: {
        total: Array.from(new Set(req.documentIds)).length,
        done: 0,
        stage: "validating",
        message: "Queued",
      },
    };

    await this.jobs.create(job);

    // Inline execution (dev / tiny batch)
    if (req.runInline) {
      // Run and return final state
      await this.processJob(jobId);
      const updated = await this.jobs.get(jobId);
      return updated ?? job;
    }

    // Enqueue for worker
    if (!this.queue) {
      // If no queue is wired, fallback to inline to avoid "stuck" jobs in local.
      this.log.warn(
        "[DeletionService] No queue configured; running deletion inline",
      );
      await this.processJob(jobId);
      const updated = await this.jobs.get(jobId);
      return updated ?? job;
    }

    await this.queue.enqueueDeletionJob(jobId);
    return job;
  }

  async getJob(jobId: string): Promise<DeletionJob | null> {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel only works if:
   * - job is still queued OR
   * - your worker respects cancellation checks between docs
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.jobs.get(jobId);
    if (!job) return;

    if (job.status === "completed" || job.status === "failed") return;

    await this.jobs.update(jobId, {
      status: "canceled",
      progress: { total: 0, done: 0, stage: "finalizing", message: "Canceled" },
    });

    if (this.queue?.cancelDeletionJob) {
      try {
        await this.queue.cancelDeletionJob(jobId);
      } catch (e) {
        this.log.warn("[DeletionService] cancelDeletionJob failed:", e);
      }
    }
  }

  /**
   * Worker entrypoint: process a queued job.
   * Make sure your document-worker.ts calls this.
   */
  async processJob(jobId: string): Promise<void> {
    const job = await this.jobs.get(jobId);
    if (!job) throw new Error(`Deletion job not found: ${jobId}`);

    if (job.status === "canceled") return;
    if (job.status === "completed") return;

    await this.jobs.update(jobId, {
      status: "running",
      progress: {
        total: 0,
        done: 0,
        stage: "validating",
        message: "Validating docs…",
      },
    });

    try {
      // 1) Fetch docs and validate ownership/scope
      const docs = await this.repo.getByIds(job.userId, job.documentIds);

      const foundIds = new Set(docs.map((d) => d.id));
      const missing = job.documentIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        // This is a hard failure because the user asked to delete specific docs.
        throw this.makeError(
          "DOCS_NOT_FOUND",
          `Some documents were not found or not accessible`,
          { missing },
        );
      }

      // 2) Mark deleting (helps UI show progress + prevents retrieval race)
      await this.jobs.update(jobId, {
        progress: {
          total: 0,
          done: 0,
          stage: "marking",
          message: "Marking for deletion…",
        },
      });
      await this.repo.markDeleting(job.userId, job.documentIds);

      // 3) Soft delete shortcut
      if (job.mode === "soft") {
        await this.repo.softDelete(job.userId, job.documentIds);
        await this.jobs.update(jobId, {
          status: "completed",
          progress: {
            stage: "finalizing",
            done: job.progress.total,
            total: job.progress.total,
            message: "Soft-deleted",
          },
        });
        return;
      }

      // 4) Index cleanup (remove embeddings / search chunks)
      await this.jobs.update(jobId, {
        progress: {
          total: 0,
          done: 0,
          stage: "index_cleanup",
          message: "Removing from search index…",
        },
      });

      if (this.preferBulkOps && this.index.removeMany) {
        await this.index.removeMany(job.documentIds);
      } else {
        for (const docId of job.documentIds) {
          if (await this.isCanceled(jobId)) return;
          await this.index.removeDocument(docId);
        }
      }

      // 5) Storage deletes (raw + derived)
      await this.jobs.update(jobId, {
        progress: {
          total: 0,
          done: 0,
          stage: "storage_delete",
          message: "Deleting file data…",
        },
      });

      // Bulk delete if store supports it
      const rawKeys = docs.map((d) => d.storageKey).filter(Boolean);
      const derivedKeys = docs
        .flatMap((d) => d.derivedKeys ?? [])
        .filter(Boolean);
      const allKeys = Array.from(new Set([...rawKeys, ...derivedKeys]));

      if (this.preferBulkOps && this.store.deleteMany) {
        await this.store.deleteMany(allKeys);
      } else {
        // Delete in a stable order: derived first, then raw
        for (const key of derivedKeys) {
          if (await this.isCanceled(jobId)) return;
          await this.safeDeleteKey(key);
        }
        for (const key of rawKeys) {
          if (await this.isCanceled(jobId)) return;
          await this.safeDeleteKey(key);
        }
      }

      // 6) Hard delete metadata
      await this.jobs.update(jobId, {
        progress: {
          total: 0,
          done: 0,
          stage: "metadata_delete",
          message: "Removing metadata…",
        },
      });
      await this.repo.hardDelete(job.userId, job.documentIds);

      // 7) Finalize job
      await this.jobs.update(jobId, {
        status: "completed",
        progress: {
          total: job.documentIds.length,
          done: job.documentIds.length,
          stage: "finalizing",
          message: "Deleted",
        },
      });
    } catch (err: any) {
      const normalized = this.normalizeError(err);
      await this.jobs.update(jobId, {
        status: "failed",
        progress: { total: 0, done: 0, stage: "finalizing", message: "Failed" },
        error: normalized,
      });
      this.log.error("[DeletionService] Job failed:", jobId, normalized);
    }
  }

  // -----------------------
  // Helpers
  // -----------------------

  private makeJobId(userId: string): string {
    const rand = crypto.randomBytes(8).toString("hex");
    return `del_${userId.slice(0, 8)}_${Date.now()}_${rand}`;
  }

  private makeError(
    code: string,
    message: string,
    detail?: any,
  ): Error & { code: string; detail?: any } {
    const e: any = new Error(message);
    e.code = code;
    e.detail = detail;
    return e;
  }

  private normalizeError(err: any): {
    code: string;
    message: string;
    detail?: any;
  } {
    if (!err) return { code: "UNKNOWN", message: "Unknown error" };
    const code = err.code || err.name || "ERROR";
    const message = err.message || String(err);
    const detail = err.detail;
    return { code, message, ...(detail !== undefined ? { detail } : {}) };
  }

  private async safeDeleteKey(key: string): Promise<void> {
    try {
      await this.store.deleteObject(key);
    } catch (e) {
      // Idempotency: do not fail job for missing objects.
      // Only escalate if your store throws non-not-found errors.
      this.log.warn("[DeletionService] deleteObject warning:", key, e);
    }
  }

  private async isCanceled(jobId: string): Promise<boolean> {
    const job = await this.jobs.get(jobId);
    return job?.status === "canceled";
  }
}
