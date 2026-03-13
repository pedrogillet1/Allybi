import type { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../../../services/security/encryption.service";
import { EnvelopeService } from "../../../services/security/envelope.service";
import { TenantKeyService } from "../../../services/security/tenantKey.service";

/**
 * Per conversation:
 * - generate a conversation key (CK)
 * - wrap CK using tenant key (TK)
 * - store wrapped CK in Conversation.dataKeyEncrypted
 */
export class ConversationKeyService {
  constructor(
    private prisma: PrismaClient,
    private enc: EncryptionService,
    private tenantKeys: TenantKeyService,
    private envelopes: EnvelopeService,
  ) {}

  async getConversationKey(
    userId: string,
    conversationId: string,
  ): Promise<Buffer> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        userId: true,
        dataKeyEncrypted: true,
        dataKeyMeta: true,
      },
    });
    if (!convo || convo.userId !== userId)
      throw new Error("Conversation not found");

    const tk = await this.tenantKeys.getTenantKey(userId);

    if (!convo.dataKeyEncrypted) {
      // Optimistically generate and wrap a new conversation key.
      const ck = this.enc.randomKey32();
      const wrapped = this.envelopes.wrapRecordKey(
        ck,
        tk,
        `wrap:conversation:${conversationId}`,
      );

      // Atomic conditional write: only succeeds if dataKeyEncrypted is still null.
      // This eliminates the TOCTOU race where two concurrent callers both see
      // dataKeyEncrypted = null, both generate different keys, and the second
      // overwrites the first — making messages encrypted with the lost key
      // unrecoverable.
      const result = await this.prisma.conversation.updateMany({
        where: { id: conversationId, dataKeyEncrypted: null },
        data: { dataKeyEncrypted: wrapped, dataKeyMeta: { v: 1 } },
      });

      if (result.count === 1) {
        // We won the race — return our newly generated key.
        return ck;
      }

      // Another request won the race (count === 0). Re-read to get the
      // winner's wrapped key and unwrap it.
      const winner = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { dataKeyEncrypted: true },
      });

      if (!winner?.dataKeyEncrypted) {
        // Should never happen: the conditional update returned 0, meaning
        // another writer set the key, yet re-read found nothing. Defensive
        // guard against an impossible state.
        throw new Error(
          `Conversation key race: expected dataKeyEncrypted after losing race for ${conversationId}`,
        );
      }

      return this.envelopes.unwrapRecordKey(
        winner.dataKeyEncrypted,
        tk,
        `wrap:conversation:${conversationId}`,
      );
    }

    return this.envelopes.unwrapRecordKey(
      convo.dataKeyEncrypted,
      tk,
      `wrap:conversation:${conversationId}`,
    );
  }
}
