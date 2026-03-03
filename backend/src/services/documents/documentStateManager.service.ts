/**
 * Document State Manager
 *
 * Centralizes all Document.status + Document.indexingState writes through one
 * service with:
 * - Explicit state machine transitions (validated map of allowed from → to)
 * - Auto-sync of indexingState when status changes
 * - Atomic CAS via updateMany with where on current status
 * - Structured logging of every transition
 */

import prisma from "../../config/database";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// State machine definition
// ---------------------------------------------------------------------------

type DocumentStatus =
  | "uploading"
  | "uploaded"
  | "enriching"
  | "indexed"
  | "ready"
  | "skipped"
  | "failed";

type IndexingState = "pending" | "running" | "indexed" | "failed";

/** Allowed status transitions: from → Set<to> */
const ALLOWED_TRANSITIONS = new Map<DocumentStatus, Set<DocumentStatus>>([
  ["uploading", new Set(["uploaded", "failed"])],
  ["uploaded", new Set(["enriching", "failed"])],
  ["enriching", new Set(["indexed", "skipped", "ready", "failed", "uploaded"])],
  ["indexed", new Set(["ready", "failed"])],
  ["ready", new Set(["enriching", "uploaded", "failed"])],
  ["skipped", new Set(["uploaded", "failed"])],
  ["failed", new Set(["uploaded"])],
]);

/** Derive indexingState from document status */
function deriveIndexingState(status: DocumentStatus): IndexingState {
  switch (status) {
    case "uploading":
    case "uploaded":
      return "pending";
    case "enriching":
      return "running";
    case "indexed":
    case "ready":
      return "indexed";
    case "skipped":
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// Transition options
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  /** Error message for failed/skipped statuses */
  error?: string;
  /** Number of chunks created (for indexed status) */
  chunksCount?: number;
  /** Skip CAS check — only use for initial creation or sweeper resets */
  force?: boolean;
}

export interface TransitionResult {
  success: boolean;
  documentId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class DocumentStateManagerService {
  /**
   * Transition a document's status with validation and atomic CAS.
   *
   * @param documentId - The document to transition
   * @param fromStatus - Expected current status (used for CAS)
   * @param toStatus - Target status
   * @param opts - Additional data for the transition
   */
  async transition(
    documentId: string,
    fromStatus: DocumentStatus,
    toStatus: DocumentStatus,
    opts: TransitionOptions = {},
  ): Promise<TransitionResult> {
    // Validate the transition is allowed
    const allowed = ALLOWED_TRANSITIONS.get(fromStatus);
    if (!allowed || !allowed.has(toStatus)) {
      logger.warn("[DocumentStateManager] Invalid transition attempted", {
        documentId,
        fromStatus,
        toStatus,
      });
      return {
        success: false,
        documentId,
        fromStatus,
        toStatus,
        reason: `Transition ${fromStatus} → ${toStatus} is not allowed`,
      };
    }

    const indexingState = deriveIndexingState(toStatus);
    const now = new Date();

    const data: Record<string, unknown> = {
      status: toStatus,
      indexingState,
      indexingUpdatedAt: now,
    };

    // Clear error on success transitions
    if (toStatus === "indexed" || toStatus === "ready") {
      data.indexingError = null;
      data.error = null;
    }

    // Set error on failure transitions
    if (
      (toStatus === "failed" || toStatus === "skipped") &&
      opts.error
    ) {
      data.indexingError = opts.error.slice(0, 500);
      data.error = opts.error.slice(0, 500);
    }

    // Set chunks count when transitioning to indexed
    if (opts.chunksCount !== undefined) {
      data.chunksCount = opts.chunksCount;
    }

    // Atomic CAS: only update if current status matches fromStatus
    if (opts.force) {
      await prisma.document.update({
        where: { id: documentId },
        data,
      });
    } else {
      const updated = await prisma.document.updateMany({
        where: { id: documentId, status: fromStatus },
        data,
      });

      if (updated.count === 0) {
        logger.info("[DocumentStateManager] CAS failed, status may have changed", {
          documentId,
          expectedStatus: fromStatus,
          targetStatus: toStatus,
        });
        return {
          success: false,
          documentId,
          fromStatus,
          toStatus,
          reason: `CAS failed: document no longer in ${fromStatus} status`,
        };
      }
    }

    logger.info("[DocumentStateManager] Transition complete", {
      documentId,
      fromStatus,
      toStatus,
      indexingState,
    });

    return {
      success: true,
      documentId,
      fromStatus,
      toStatus,
    };
  }

  /**
   * Convenience: transition to "enriching" from "uploaded".
   * Sets indexingState=running, clears errors.
   */
  async claimForEnrichment(documentId: string): Promise<TransitionResult> {
    return this.transition(documentId, "uploaded", "enriching");
  }

  /**
   * Convenience: mark as indexed with chunk count.
   */
  async markIndexed(
    documentId: string,
    chunksCount: number,
  ): Promise<TransitionResult> {
    return this.transition(documentId, "enriching", "indexed", { chunksCount });
  }

  /**
   * Convenience: mark as ready (final state).
   */
  async markReady(documentId: string): Promise<TransitionResult> {
    return this.transition(documentId, "indexed", "ready");
  }

  /**
   * Convenience: mark as failed with error message.
   */
  async markFailed(
    documentId: string,
    fromStatus: DocumentStatus,
    error: string,
  ): Promise<TransitionResult> {
    return this.transition(documentId, fromStatus, "failed", { error });
  }

  /**
   * Convenience: mark as skipped (no extractable content).
   */
  async markSkipped(
    documentId: string,
    error?: string,
  ): Promise<TransitionResult> {
    return this.transition(documentId, "enriching", "skipped", { error });
  }

  /**
   * Reset an enriching document back to uploaded (for stuck doc sweeper).
   */
  async resetToUploaded(documentId: string): Promise<TransitionResult> {
    return this.transition(documentId, "enriching", "uploaded");
  }
}

export const documentStateManager = new DocumentStateManagerService();
export default documentStateManager;
