import { EncryptionService } from "./encryption.service";
import { EnvelopeService } from "./envelope.service";

/**
 * Handles re-wrapping document keys when a tenant key is rotated.
 *
 * Flow:
 * 1. Decrypt document key with OLD tenant key
 * 2. Re-encrypt document key with NEW tenant key
 * 3. The document key itself does NOT change — only the wrapping changes.
 *    This means encrypted content remains readable without re-encryption.
 */
export class KeyRotationService {
  constructor(
    private enc: EncryptionService,
    private envelopes: EnvelopeService,
  ) {}

  /**
   * Re-wrap a single document key from old tenant key to new tenant key.
   * Returns the new wrapped key string.
   */
  rewrapDocumentKey(
    wrappedKey: string,
    oldTenantKey: Buffer,
    newTenantKey: Buffer,
    aad: string,
  ): string {
    const dk = this.envelopes.unwrapRecordKey(wrappedKey, oldTenantKey, aad);
    return this.envelopes.wrapRecordKey(dk, newTenantKey, aad);
  }

  /**
   * Batch re-wrap multiple document keys.
   * Returns array of { documentId, newWrappedKey } for each successful re-wrap,
   * and { documentId, error } for failures.
   */
  rewrapBatch(
    items: Array<{
      documentId: string;
      wrappedKey: string;
      aad: string;
    }>,
    oldTenantKey: Buffer,
    newTenantKey: Buffer,
  ): Array<{ documentId: string; newWrappedKey?: string; error?: string }> {
    return items.map((item) => {
      try {
        const newWrapped = this.rewrapDocumentKey(
          item.wrappedKey,
          oldTenantKey,
          newTenantKey,
          item.aad,
        );
        return { documentId: item.documentId, newWrappedKey: newWrapped };
      } catch (err: any) {
        return { documentId: item.documentId, error: err.message };
      }
    });
  }
}
