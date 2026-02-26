/**
 * Prisma-based FolderService implementation.
 * Implements the interface expected by FolderController.
 *
 * Supports encrypted folder names when crypto services are provided.
 */

import prisma from "../config/database";
import type {
  FolderService,
  FolderRecord,
  FolderTreeNode,
} from "../controllers/folder.controller";
import type { FolderKeyService } from "./folders/folderKey.service";
import type { FolderCryptoService } from "./folders/folderCrypto.service";

interface CryptoServices {
  folderKeys: FolderKeyService;
  folderCrypto: FolderCryptoService;
}

/**
 * Shared filter for counting documents inside folders.
 * Must stay in sync with the document list API (prismaDocument.service.ts list()).
 * Excludes: skipped docs, revision artifacts, connector-ingested artifacts.
 */
const VISIBLE_DOC_FILTER = {
  status: { not: "skipped" },
  parentVersionId: null,
  encryptedFilename: { not: { contains: "/connectors/" } },
} as const;

function toRecord(f: any, decryptedName?: string): FolderRecord {
  const parentId = f.parentFolderId ?? null;
  const docCount = f._count?.documents ?? 0;
  const subfolderCount = f._count?.subfolders ?? 0;
  return {
    id: f.id,
    name: decryptedName ?? f.name ?? "Unnamed",
    parentId,
    parentFolderId: parentId, // backward-compat alias used by frontend
    path: f.path ?? null,
    emoji: f.emoji ?? null,
    createdAt: f.createdAt?.toISOString?.() ?? f.createdAt,
    updatedAt: f.updatedAt?.toISOString?.() ?? f.updatedAt,
    counts: {
      docs: docCount,
      subfolders: subfolderCount,
    },
    _count: {
      documents: docCount,
      subfolders: subfolderCount,
      totalDocuments: docCount, // overwritten by recursive calc in list()/tree()
    },
  };
}

/** Compute recursive totalDocuments for a flat list of folders (bottom-up). */
function computeRecursiveTotals(items: FolderRecord[]): void {
  const byId = new Map<string, FolderRecord>();
  for (const f of items) byId.set(f.id, f);

  // Build children map
  const children = new Map<string, string[]>();
  for (const f of items) {
    const pid = f.parentId ?? f.parentFolderId ?? null;
    if (pid && byId.has(pid)) {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid)!.push(f.id);
    }
  }

  // Memoised recursive sum
  const cache = new Map<string, number>();
  function total(id: string): number {
    if (cache.has(id)) return cache.get(id)!;
    const f = byId.get(id);
    if (!f) return 0;
    const own = f._count?.documents ?? f.counts?.docs ?? 0;
    const childSum = (children.get(id) || []).reduce(
      (s, cid) => s + total(cid),
      0,
    );
    const t = own + childSum;
    cache.set(id, t);
    return t;
  }

  for (const f of items) {
    const t = total(f.id);
    if (f._count) f._count.totalDocuments = t;
  }
}

export class PrismaFolderService implements FolderService {
  private crypto?: CryptoServices;

  constructor(crypto?: CryptoServices) {
    this.crypto = crypto;
  }

  /**
   * Decrypt folder name if encrypted, otherwise return plaintext name
   */
  private async decryptName(
    userId: string,
    folder: { id: string; name: string | null; nameEncrypted: string | null },
  ): Promise<string> {
    if (folder.nameEncrypted && this.crypto) {
      try {
        const fk = await this.crypto.folderKeys.getFolderKey(userId, folder.id);
        return this.crypto.folderCrypto.decryptName(
          userId,
          folder.id,
          folder.nameEncrypted,
          fk,
        );
      } catch {
        // Fallback to plaintext if decryption fails
        return folder.name ?? "Unnamed";
      }
    }
    return folder.name ?? "Unnamed";
  }

  /**
   * Decrypt names for multiple folders
   */
  private async decryptFolders(
    userId: string,
    folders: any[],
  ): Promise<FolderRecord[]> {
    const results: FolderRecord[] = [];
    for (const f of folders) {
      const name = await this.decryptName(userId, f);
      results.push(toRecord(f, name));
    }
    return results;
  }

  async list(input: {
    userId: string;
    parentId?: string | null;
    q?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: FolderRecord[]; nextCursor?: string }> {
    const limit = Math.min(input.limit ?? 50, 200);
    const where: any = { userId: input.userId, isDeleted: false };

    if (input.parentId !== undefined) where.parentFolderId = input.parentId;

    // Note: search by name only works for unencrypted folders
    // For encrypted folders, search would need to be done client-side
    if (input.q) {
      where.name = { contains: input.q, mode: "insensitive" };
    }

    const folders = await prisma.folder.findMany({
      where,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: "desc" }, // Order by creation date since encrypted names can't be sorted
      select: {
        id: true,
        userId: true,
        name: true,
        nameEncrypted: true,
        parentFolderId: true,
        path: true,
        emoji: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });

    const hasMore = folders.length > limit;
    const sliced = hasMore ? folders.slice(0, limit) : folders;
    const items = await this.decryptFolders(input.userId, sliced);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    // Compute recursive totalDocuments for each folder
    computeRecursiveTotals(items);

    return { items, nextCursor };
  }

  async tree(input: { userId: string }): Promise<FolderTreeNode[]> {
    const folders = await prisma.folder.findMany({
      where: { userId: input.userId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        name: true,
        nameEncrypted: true,
        parentFolderId: true,
        path: true,
        emoji: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });

    // Decrypt all folder names
    const decrypted = await this.decryptFolders(input.userId, folders);

    const map = new Map<string, FolderTreeNode>();
    const roots: FolderTreeNode[] = [];

    for (let i = 0; i < folders.length; i++) {
      map.set(folders[i].id, { ...decrypted[i], children: [] });
    }

    for (const f of folders) {
      const node = map.get(f.id)!;
      if (f.parentFolderId && map.has(f.parentFolderId)) {
        map.get(f.parentFolderId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    // Walk tree bottom-up to compute recursive totalDocuments
    function walkTotal(node: FolderTreeNode): number {
      const childTotal = (node.children || []).reduce(
        (sum, c) => sum + walkTotal(c),
        0,
      );
      const own = node._count?.documents ?? node.counts?.docs ?? 0;
      const total = own + childTotal;
      if (node._count) node._count.totalDocuments = total;
      return total;
    }
    for (const root of roots) walkTotal(root);

    return roots;
  }

  async get(input: {
    userId: string;
    folderId: string;
  }): Promise<FolderRecord | null> {
    const f = await prisma.folder.findFirst({
      where: { id: input.folderId, userId: input.userId, isDeleted: false },
      select: {
        id: true,
        userId: true,
        name: true,
        nameEncrypted: true,
        parentFolderId: true,
        path: true,
        emoji: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });
    if (!f) return null;

    const name = await this.decryptName(input.userId, f);
    return toRecord(f, name);
  }

  async create(input: {
    userId: string;
    name: string;
    parentId?: string | null;
  }): Promise<FolderRecord> {
    if (this.crypto) {
      // Create with encrypted name
      const f = await prisma.folder.create({
        data: {
          userId: input.userId,
          name: null, // Encrypted - no plaintext
          nameEncrypted: "", // Placeholder, will update after getting key
          parentFolderId: input.parentId ?? null,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          nameEncrypted: true,
          parentFolderId: true,
          path: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              documents: { where: VISIBLE_DOC_FILTER },
              subfolders: true,
            },
          },
        },
      });

      // Now encrypt with folder key
      const fk = await this.crypto.folderKeys.getFolderKey(input.userId, f.id);
      const enc = this.crypto.folderCrypto.encryptName(
        input.userId,
        f.id,
        input.name,
        fk,
      );

      await prisma.folder.update({
        where: { id: f.id },
        data: { nameEncrypted: enc },
      });

      return toRecord(f, input.name);
    }

    // SECURITY:PLAINTEXT_FALLBACK - Backward compat when crypto not configured
    const f = await prisma.folder.create({
      data: {
        userId: input.userId,
        name: input.name, // SECURITY:PLAINTEXT_FALLBACK
        parentFolderId: input.parentId ?? null,
      },
      include: {
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });
    return toRecord(f);
  }

  async rename(input: {
    userId: string;
    folderId: string;
    name: string;
  }): Promise<FolderRecord> {
    if (this.crypto) {
      // Encrypt the new name
      const fk = await this.crypto.folderKeys.getFolderKey(
        input.userId,
        input.folderId,
      );
      const enc = this.crypto.folderCrypto.encryptName(
        input.userId,
        input.folderId,
        input.name,
        fk,
      );

      const f = await prisma.folder.update({
        where: { id: input.folderId },
        data: {
          name: null, // Clear plaintext
          nameEncrypted: enc,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          nameEncrypted: true,
          parentFolderId: true,
          path: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              documents: { where: VISIBLE_DOC_FILTER },
              subfolders: true,
            },
          },
        },
      });
      return toRecord(f, input.name);
    }

    // SECURITY:PLAINTEXT_FALLBACK - Backward compat when crypto not configured
    const f = await prisma.folder.update({
      where: { id: input.folderId },
      data: { name: input.name }, // SECURITY:PLAINTEXT_FALLBACK
      include: {
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });
    return toRecord(f);
  }

  async move(input: {
    userId: string;
    folderId: string;
    newParentId?: string | null;
  }): Promise<FolderRecord> {
    const f = await prisma.folder.update({
      where: { id: input.folderId },
      data: { parentFolderId: input.newParentId ?? null },
      select: {
        id: true,
        userId: true,
        name: true,
        nameEncrypted: true,
        parentFolderId: true,
        path: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: { where: VISIBLE_DOC_FILTER },
            subfolders: true,
          },
        },
      },
    });

    const name = await this.decryptName(input.userId, f);
    return toRecord(f, name);
  }

  async delete(input: {
    userId: string;
    folderId: string;
    mode?: "soft" | "hard" | "cascade" | "folderOnly";
  }): Promise<{ deleted: true; movedDocs?: number; movedToFolderId?: string }> {
    const mode = input.mode || "cascade";

    if (mode === "folderOnly") {
      // Move documents out of the folder (and subfolders) to root level
      const movedDocs = await prisma.document.updateMany({
        where: { folderId: input.folderId, userId: input.userId },
        data: { folderId: null },
      });
      // Hard-delete the folder (cascades to subfolders, but docs are already moved)
      await prisma.folder.delete({ where: { id: input.folderId } });
      return { deleted: true, movedDocs: movedDocs.count };
    }

    if (mode === "hard" || mode === "cascade") {
      // Hard delete — DB cascade automatically deletes documents and subfolders
      await prisma.folder.delete({ where: { id: input.folderId } });
    } else {
      // Soft delete (legacy)
      await prisma.folder.update({
        where: { id: input.folderId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }
    return { deleted: true };
  }
}
