import prisma from "../../config/database";
import { getKeyRotation } from "../../services/security/keyRotation.service";
import { logger } from "../../utils/logger";

/**
 * Re-encrypt all records to the current key version.
 * Processes in batches to avoid memory issues.
 */
export async function runKeyRotationBatch(
  batchSize = 100,
): Promise<{ processed: number; errors: number }> {
  const kr = getKeyRotation();
  const currentVersion = kr.getCurrentVersion();
  let processed = 0;
  let errors = 0;

  // Re-encrypt encrypted chat messages
  const messages = await prisma.message.findMany({
    where: {
      contentEncrypted: { not: null },
    },
    take: batchSize,
    select: { id: true, contentEncrypted: true, conversationId: true },
  });

  for (const msg of messages) {
    try {
      if (!msg.contentEncrypted) continue;

      const payload = JSON.parse(msg.contentEncrypted);
      if ((payload.kv ?? 0) === currentVersion) continue;

      const reEncrypted = kr.reEncryptPayload(
        msg.contentEncrypted,
        `msg:${msg.conversationId}:${msg.id}`,
      );

      await prisma.message.update({
        where: { id: msg.id },
        data: { contentEncrypted: reEncrypted },
      });
      processed++;
    } catch (err) {
      errors++;
      logger.error("[KeyRotation] Failed to re-encrypt message", {
        messageId: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(
    `[KeyRotation] Batch complete: ${processed} processed, ${errors} errors`,
  );
  return { processed, errors };
}
