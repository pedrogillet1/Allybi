import prisma from "../../config/database";
import { logger } from "../../utils/logger";

/**
 * Hard-delete sessions that have been inactive/expired for over 30 days.
 * Intended to run daily via cron.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { isActive: false, revokedAt: { lt: cutoff } },
        { expiresAt: { lt: cutoff } },
      ],
    },
  });

  logger.info(`[SessionCleanup] Deleted ${result.count} expired sessions`);

  // Also clean admin sessions
  const adminResult = await prisma.adminSession.deleteMany({
    where: {
      OR: [
        { isActive: false },
        { expiresAt: { lt: cutoff } },
      ],
    },
  });

  logger.info(`[SessionCleanup] Deleted ${adminResult.count} expired admin sessions`);

  return result.count + adminResult.count;
}
