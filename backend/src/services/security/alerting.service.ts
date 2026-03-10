import { captureMessage } from "../../config/sentry.config";
import { logger } from "../../utils/logger";

interface AuthFailureEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Security alerting service.
 * Tracks suspicious patterns and fires alerts when thresholds are breached.
 */
class SecurityAlertingService {
  private authFailures = new Map<string, AuthFailureEntry>();

  private readonly AUTH_FAILURE_THRESHOLD = 10;
  private readonly AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Track an authentication failure by IP hash.
   * Alerts if threshold exceeded within window.
   */
  trackAuthFailure(ipHash: string, details?: Record<string, unknown>): void {
    const now = Date.now();
    const entry = this.authFailures.get(ipHash);

    if (entry && now - entry.firstSeen < this.AUTH_FAILURE_WINDOW_MS) {
      entry.count++;
      entry.lastSeen = now;
    } else {
      this.authFailures.set(ipHash, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }

    const current = this.authFailures.get(ipHash)!;
    if (current.count >= this.AUTH_FAILURE_THRESHOLD) {
      this.fireAlert("brute_force_detected", {
        ipHash,
        failureCount: current.count,
        windowMs: this.AUTH_FAILURE_WINDOW_MS,
        ...details,
      });
      // Reset counter after alert
      this.authFailures.delete(ipHash);
    }

    // Periodic cleanup of stale entries
    if (Math.random() < 0.01) this.cleanup();
  }

  /**
   * Alert on admin panel access.
   */
  trackAdminAccess(
    adminId: string,
    action: string,
    ipHash: string,
  ): void {
    logger.info("[SecurityAlert] Admin access", { adminId, action, ipHash });
    captureMessage(`Admin access: ${action}`, "info");
  }

  /**
   * Alert on key rotation events.
   */
  trackKeyEvent(event: string, details?: Record<string, unknown>): void {
    logger.info("[SecurityAlert] Key event", { event, ...details });
    captureMessage(`Key event: ${event}`, "warning");
  }

  /**
   * Alert on suspicious activity.
   */
  trackSuspiciousActivity(
    type: string,
    details: Record<string, unknown>,
  ): void {
    logger.warn("[SecurityAlert] Suspicious activity", { type, ...details });
    captureMessage(`Suspicious activity: ${type}`, "error");
  }

  /**
   * Fire a high-severity security alert.
   */
  private fireAlert(type: string, details: Record<string, unknown>): void {
    const message = `[SECURITY ALERT] ${type}: ${JSON.stringify(details)}`;
    logger.error(message);
    captureMessage(message, "fatal");
  }

  /**
   * Cleanup stale auth failure entries (older than window).
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.authFailures) {
      if (now - entry.firstSeen > this.AUTH_FAILURE_WINDOW_MS) {
        this.authFailures.delete(key);
      }
    }
  }
}

export const securityAlerting = new SecurityAlertingService();
