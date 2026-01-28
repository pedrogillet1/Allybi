import type { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";

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

  async getConversationKey(userId: string, conversationId: string): Promise<Buffer> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, dataKeyEncrypted: true, dataKeyMeta: true },
    });
    if (!convo || convo.userId !== userId) throw new Error("Conversation not found");

    const tk = await this.tenantKeys.getTenantKey(userId);

    if (!convo.dataKeyEncrypted) {
      const ck = this.enc.randomKey32();
      const wrapped = this.envelopes.wrapRecordKey(ck, tk, `wrap:conversation:${conversationId}`);

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { dataKeyEncrypted: wrapped, dataKeyMeta: { v: 1 } },
      });

      return ck;
    }

    return this.envelopes.unwrapRecordKey(
      convo.dataKeyEncrypted,
      tk,
      `wrap:conversation:${conversationId}`,
    );
  }
}
