/**
 * Append-only audit log writer for GCS.
 * In production, writes to a GCS bucket with retention lock.
 * In development, writes to local filesystem as a fallback.
 */
import { Storage } from "@google-cloud/storage";
import { logger } from "../../utils/logger";

const AUDIT_BUCKET = process.env.KODA_AUDIT_BUCKET || "koda-audit-logs";

export interface AuditEntry {
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  ipHash: string;
  status: string;
  details: Record<string, unknown>;
}

export class AuditStoreService {
  private storage: Storage | null = null;

  private getStorage(): Storage {
    if (!this.storage) {
      this.storage = new Storage();
    }
    return this.storage;
  }

  async writeAuditEntry(entry: AuditEntry): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `audit/${date}/${entry.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;

    if (process.env.NODE_ENV === "production" && process.env.KODA_AUDIT_BUCKET) {
      try {
        const file = this.getStorage().bucket(AUDIT_BUCKET).file(filename);
        await file.save(JSON.stringify(entry), {
          contentType: "application/json",
          resumable: false,
        });
      } catch (err) {
        logger.error("[AuditStore] GCS write failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Always write to local audit log in structured format
    logger.info("[AuditStore]", entry);
  }
}

export const auditStore = new AuditStoreService();
