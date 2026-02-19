import type { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";

/**
 * Folder Key Service
 *
 * Per folder:
 * - generate a folder key (FK)
 * - wrap FK with tenant key (TK)
 * - store wrapped FK in Folder.dataKeyEncrypted
 */
export class FolderKeyService {
  constructor(
    private prisma: PrismaClient,
    private enc: EncryptionService,
    private tenantKeys: TenantKeyService,
    private envelopes: EnvelopeService,
  ) {}

  async getFolderKey(userId: string, folderId: string): Promise<Buffer> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        userId: true,
        dataKeyEncrypted: true,
        dataKeyMeta: true,
      },
    });
    if (!folder || folder.userId !== userId)
      throw new Error("Folder not found");

    const tk = await this.tenantKeys.getTenantKey(userId);

    if (!folder.dataKeyEncrypted) {
      const fk = this.enc.randomKey32();
      const wrapped = this.envelopes.wrapRecordKey(
        fk,
        tk,
        `wrap:folder:${folderId}`,
      );

      await this.prisma.folder.update({
        where: { id: folderId },
        data: { dataKeyEncrypted: wrapped, dataKeyMeta: { v: 1 } },
      });

      return fk;
    }

    return this.envelopes.unwrapRecordKey(
      folder.dataKeyEncrypted,
      tk,
      `wrap:folder:${folderId}`,
    );
  }
}
