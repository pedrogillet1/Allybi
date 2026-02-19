import type { PrismaClient } from "@prisma/client";
import { FolderKeyService } from "./folderKey.service";
import { FolderCryptoService } from "./folderCrypto.service";

/**
 * Encrypted Folder Repository
 *
 * DB operations for encrypted folder data.
 * - Stores nameEncrypted
 * - Leaves name NULL
 */
export class EncryptedFolderRepo {
  constructor(
    private prisma: PrismaClient,
    private folderKeys: FolderKeyService,
    private folderCrypto: FolderCryptoService,
  ) {}

  async setEncryptedName(
    userId: string,
    folderId: string,
    namePlain: string,
  ): Promise<void> {
    const fk = await this.folderKeys.getFolderKey(userId, folderId);
    const enc = this.folderCrypto.encryptName(userId, folderId, namePlain, fk);

    await this.prisma.folder.update({
      where: { id: folderId },
      data: {
        name: null,
        nameEncrypted: enc,
      },
    });
  }

  async getDecryptedName(
    userId: string,
    folderId: string,
  ): Promise<string | null> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: { name: true, nameEncrypted: true, userId: true },
    });
    if (!folder || folder.userId !== userId) return null;

    if (folder.nameEncrypted) {
      const fk = await this.folderKeys.getFolderKey(userId, folderId);
      return this.folderCrypto.decryptName(
        userId,
        folderId,
        folder.nameEncrypted,
        fk,
      );
    }
    return folder.name ?? null;
  }

  /**
   * Create folder with encrypted name
   */
  async createWithEncryptedName(
    userId: string,
    namePlain: string,
    parentFolderId: string | null,
  ): Promise<{ id: string }> {
    // First create with placeholder
    const folder = await this.prisma.folder.create({
      data: {
        userId,
        name: null, // Will be encrypted
        nameEncrypted: "", // Placeholder
        parentFolderId,
      },
      select: { id: true },
    });

    // Now encrypt with folder key
    const fk = await this.folderKeys.getFolderKey(userId, folder.id);
    const enc = this.folderCrypto.encryptName(userId, folder.id, namePlain, fk);

    await this.prisma.folder.update({
      where: { id: folder.id },
      data: { nameEncrypted: enc },
    });

    return folder;
  }

  /**
   * Rename folder with encrypted name
   */
  async renameEncrypted(
    userId: string,
    folderId: string,
    namePlain: string,
  ): Promise<void> {
    const fk = await this.folderKeys.getFolderKey(userId, folderId);
    const enc = this.folderCrypto.encryptName(userId, folderId, namePlain, fk);

    await this.prisma.folder.update({
      where: { id: folderId },
      data: {
        name: null,
        nameEncrypted: enc,
      },
    });
  }
}
