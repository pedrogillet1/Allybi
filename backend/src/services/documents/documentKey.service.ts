import type { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";

/**
 * Per document:
 * - generate a document key (DK)
 * - wrap DK with tenant key (TK)
 * - store wrapped DK in Document.dataKeyEncrypted
 */
export class DocumentKeyService {
  constructor(
    private prisma: PrismaClient,
    private enc: EncryptionService,
    private tenantKeys: TenantKeyService,
    private envelopes: EnvelopeService,
  ) {}

  async getDocumentKey(userId: string, documentId: string): Promise<Buffer> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, userId: true, dataKeyEncrypted: true, dataKeyMeta: true },
    });
    if (!doc || doc.userId !== userId) throw new Error("Document not found");

    const tk = await this.tenantKeys.getTenantKey(userId);

    if (!doc.dataKeyEncrypted) {
      const dk = this.enc.randomKey32();
      const wrapped = this.envelopes.wrapRecordKey(dk, tk, `wrap:document:${documentId}`);

      await this.prisma.document.update({
        where: { id: documentId },
        data: { dataKeyEncrypted: wrapped, dataKeyMeta: { v: 1 } },
      });

      return dk;
    }

    return this.envelopes.unwrapRecordKey(
      doc.dataKeyEncrypted,
      tk,
      `wrap:document:${documentId}`,
    );
  }
}
