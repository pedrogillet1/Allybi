import { logger } from "../../utils/logger";
import { reconcileRevisionAmendsLinks } from "./documentLink.service";

let timer: NodeJS.Timeout | null = null;
let running = false;

function parseIntervalMs(): number {
  const raw = Number(process.env.REVISION_LINK_RECONCILE_INTERVAL_MS || 3600000);
  if (!Number.isFinite(raw)) return 3600000;
  return Math.max(60000, Math.trunc(raw));
}

function isEnabled(): boolean {
  return (
    String(process.env.REVISION_LINK_RECONCILE_ENABLED || "")
      .trim()
      .toLowerCase() === "true"
  );
}

export async function runRevisionLinkReconciliationOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await reconcileRevisionAmendsLinks({
      limit: 1000,
    });
    if (result.missing > 0 || result.failed > 0) {
      logger.warn("[RevisionLinkReconciler] Reconciliation executed", result);
    } else {
      logger.debug("[RevisionLinkReconciler] Reconciliation executed", result);
    }
  } catch (error: any) {
    logger.error("[RevisionLinkReconciler] Reconciliation failed", {
      error: String(error?.message || error || "unknown_error"),
    });
  } finally {
    running = false;
  }
}

export function startRevisionLinkReconciler(): void {
  if (!isEnabled()) return;
  if (timer) return;
  const intervalMs = parseIntervalMs();
  timer = setInterval(() => {
    void runRevisionLinkReconciliationOnce();
  }, intervalMs);
  timer.unref?.();
  void runRevisionLinkReconciliationOnce();
  logger.info("[RevisionLinkReconciler] Started", { intervalMs });
}

export function stopRevisionLinkReconciler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  logger.info("[RevisionLinkReconciler] Stopped");
}
