/**
 * Encryption Step Service
 *
 * Handles encrypting extracted text and filename during the pipeline.
 * BLOCKING — encryption must complete before doc is marked as indexed.
 *
 * Behavior:
 * - If INDEXING_ENCRYPTED_CHUNKS_ONLY=true and encryption fails → throws (prevents
 *   unencrypted doc from being marked indexed).
 * - If INDEXING_ENCRYPTED_CHUNKS_ONLY=false → warns and continues (backward compat
 *   for plaintext mode).
 */

import prisma from "../../../config/database";
import { logger } from "../../../utils/logger";
import { EncryptionService } from "../../security/encryption.service";
import { EnvelopeService } from "../../security/envelope.service";
import { TenantKeyService } from "../../security/tenantKey.service";
import { DocumentKeyService } from "../../documents/documentKey.service";
import { DocumentCryptoService } from "../../documents/documentCrypto.service";
import { EncryptedDocumentRepo } from "../../documents/encryptedDocumentRepo.service";

/**
 * Encrypt extracted text and filename, storing them in the DB.
 * This is now BLOCKING — awaited before the doc is marked indexed.
 */
export async function runEncryptionStep(params: {
  userId: string;
  documentId: string;
  fullText: string;
  filename: string;
}): Promise<void> {
  const { userId, documentId, fullText, filename } = params;
  const hasEncryptionKey = !!process.env.KODA_MASTER_KEY_BASE64;

  if (!hasEncryptionKey || (!fullText && !filename)) return;

  const encryptedOnly =
    String(process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY || "")
      .trim()
      .toLowerCase() === "true";

  try {
    const enc = new EncryptionService();
    const envelope = new EnvelopeService(enc);
    const tenantKeys = new TenantKeyService(prisma, enc);
    const docKeys = new DocumentKeyService(
      prisma,
      enc,
      tenantKeys,
      envelope,
    );
    const docCrypto = new DocumentCryptoService(enc);
    const encDocRepo = new EncryptedDocumentRepo(
      prisma,
      docKeys,
      docCrypto,
    );

    await Promise.all([
      fullText
        ? encDocRepo.storeEncryptedExtractedText(userId, documentId, fullText)
        : Promise.resolve(),
      filename
        ? encDocRepo.setEncryptedFilename(userId, documentId, filename)
        : Promise.resolve(),
    ]);

    logger.info("[Pipeline] Encrypted extracted text stored", { documentId });
  } catch (encErr: any) {
    if (encryptedOnly) {
      // In encrypted-only mode, encryption failure is fatal
      logger.error("[Pipeline] Encryption failed in encrypted-only mode", {
        documentId,
        error: encErr.message,
      });
      throw new Error(
        `Encryption failed for document ${documentId}: ${encErr.message}`,
      );
    }

    // In plaintext mode, encryption failure is non-fatal
    logger.warn("[Pipeline] Encryption failed (non-fatal, plaintext mode)", {
      documentId,
      error: encErr.message,
    });
  }
}
