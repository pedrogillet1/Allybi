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
import { VISIBLE_DOCUMENT_FILTER } from "./documents/documentVisibilityFilter";

interface CryptoServices {
  folderKeys: FolderKeyService;
  folderCrypto: FolderCryptoService;
}

type FolderCursor = { id: string; createdAt: Date };

function encodeFolderCursor(row: {
  id: string;
  createdAt: Date | string;
}): string {
  const payload = JSON.stringify({
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeFolderCursor(raw: string): FolderCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { id?: unknown; createdAt?: unknown };
    if (typeof parsed?.id !== "string") return null;
    if (typeof parsed?.createdAt !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

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
      totalDocuments: docCount,
    },
  };
}

export class PrismaFolderService implements FolderService {
  private crypto?: CryptoServices;

  constructor(crypto?: CryptoServices) {
    this.crypto = crypto;
  }

  private async assertOwnedFolder(
    userId: string,
    folderId: string,
  ): Promise<void> {
    const owned = await prisma.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!owned) throw new Error("Folder not found");
  }

  private async listUserFolderRelations(
    userId: string,
  ): Promise<Array<{ id: string; parentFolderId: string | null }>> {
    const rows = await prisma.folder.findMany({
      where: { userId },
      select: { id: true, parentFolderId: true },
    });
    return rows.map((r) => ({
      id: String(r.id),
      parentFolderId: r.parentFolderId ?? null,
    }));
  }

  private async collectFolderFamilyIds(
    userId: string,
    rootFolderId: string,
  ): Promise<string[]> {
    const relations = await this.listUserFolderRelations(userId);
    const childrenByParent = new Map<string, string[]>();

    for (const row of relations) {
      const parent = row.parentFolderId;
      if (!parent) continue;
      const list = childrenByParent.get(parent) || [];
      list.push(row.id);
      childrenByParent.set(parent, list);
    }

    const ids: string[] = [];
    const visited = new Set<string>();
    const queue = [rootFolderId];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (visited.has(current)) continue;
      visited.add(current);
      ids.push(current);
      for (const childId of childrenByParent.get(current) || []) {
        if (!visited.has(childId)) queue.push(childId);
      }
    }

    return ids;
  }

  private async assertMoveDoesNotCreateCycle(
    userId: string,
    folderId: string,
    newParentId?: string | null,
  ): Promise<void> {
    if (!newParentId) return;
    if (newParentId === folderId) {
      throw new Error("Cannot move a folder into itself");
    }

    const relations = await this.listUserFolderRelations(userId);
    const parentById = new Map<string, string | null>();
    for (const row of relations) {
      parentById.set(row.id, row.parentFolderId);
    }

    let cursor: string | null = newParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === folderId) {
        throw new Error("Cannot move a folder into one of its descendants");
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
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
    const filters: any[] = [{ userId: input.userId, isDeleted: false }];

    if (input.parentId !== undefined) {
      filters.push({ parentFolderId: input.parentId });
    }

    // Note: search by name only works for unencrypted folders
    // For encrypted folders, search would need to be done client-side
    if (input.q) {
      filters.push({ name: { contains: input.q, mode: "insensitive" } });
    }

    let decodedCursor = input.cursor ? decodeFolderCursor(input.cursor) : null;
    if (input.cursor && !decodedCursor) {
      // Backward compatibility for legacy id-only cursors.
      const anchor = await prisma.folder.findFirst({
        where: {
          AND: [...filters, { id: input.cursor }],
        },
        select: { id: true, createdAt: true },
      });
      if (anchor) decodedCursor = { id: anchor.id, createdAt: anchor.createdAt };
    }
    if (decodedCursor) {
      filters.push({
        OR: [
          { createdAt: { lt: decodedCursor.createdAt } },
          {
            AND: [
              { createdAt: decodedCursor.createdAt },
              { id: { lt: decodedCursor.id } },
            ],
          },
        ],
      });
    }

    const folders = await prisma.folder.findMany({
      where: { AND: filters },
      take: limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
            subfolders: true,
          },
        },
      },
    });

    const hasMore = folders.length > limit;
    const sliced = hasMore ? folders.slice(0, limit) : folders;
    const items = await this.decryptFolders(input.userId, sliced);
    const nextCursor =
      hasMore && sliced.length > 0
        ? encodeFolderCursor(sliced[sliced.length - 1])
        : undefined;

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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
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
      return walkTotalInner(node, new Set<string>());
    }

    function walkTotalInner(node: FolderTreeNode, lineage: Set<string>): number {
      if (lineage.has(node.id)) {
        return node._count?.documents ?? node.counts?.docs ?? 0;
      }
      const nextLineage = new Set(lineage);
      nextLineage.add(node.id);
      const childTotal = (node.children || []).reduce(
        (sum, c) => sum + walkTotalInner(c, nextLineage),
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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
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
    path?: string | null;
    emoji?: string | null;
  }): Promise<FolderRecord> {
    if (input.parentId) {
      await this.assertOwnedFolder(input.userId, input.parentId);
    }

    if (this.crypto) {
      let createdFolderId: string | null = null;
      try {
        // Create first with no plaintext and no placeholder ciphertext.
        const f = await prisma.folder.create({
          data: {
            userId: input.userId,
            name: null,
            nameEncrypted: null,
            parentFolderId: input.parentId ?? null,
            path: input.path ?? null,
            emoji: input.emoji ?? null,
          },
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
                documents: { where: VISIBLE_DOCUMENT_FILTER },
                subfolders: true,
              },
            },
          },
        });
        createdFolderId = f.id;

        const fk = await this.crypto.folderKeys.getFolderKey(input.userId, f.id);
        const enc = this.crypto.folderCrypto.encryptName(
          input.userId,
          f.id,
          input.name,
          fk,
        );

        const updated = await prisma.folder.update({
          where: { id: f.id },
          data: { nameEncrypted: enc },
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
                documents: { where: VISIBLE_DOCUMENT_FILTER },
                subfolders: true,
              },
            },
          },
        });

        return toRecord(updated, input.name);
      } catch (error) {
        if (createdFolderId) {
          await prisma.folder
            .delete({ where: { id: createdFolderId } })
            .catch(() => undefined);
        }
        throw error;
      }
    }

    // SECURITY:PLAINTEXT_FALLBACK - Backward compat when crypto not configured
    const f = await prisma.folder.create({
      data: {
        userId: input.userId,
        name: input.name, // SECURITY:PLAINTEXT_FALLBACK
        parentFolderId: input.parentId ?? null,
        path: input.path ?? null,
        emoji: input.emoji ?? null,
      },
      include: {
        _count: {
          select: {
            documents: { where: VISIBLE_DOCUMENT_FILTER },
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
    await this.assertOwnedFolder(input.userId, input.folderId);

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
              documents: { where: VISIBLE_DOCUMENT_FILTER },
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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
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
    await this.assertOwnedFolder(input.userId, input.folderId);
    if (input.newParentId) {
      await this.assertOwnedFolder(input.userId, input.newParentId);
    }
    await this.assertMoveDoesNotCreateCycle(
      input.userId,
      input.folderId,
      input.newParentId,
    );

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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
            subfolders: true,
          },
        },
      },
    });

    const name = await this.decryptName(input.userId, f);
    return toRecord(f, name);
  }

  async setEmoji(input: {
    userId: string;
    folderId: string;
    emoji?: string | null;
  }): Promise<FolderRecord> {
    await this.assertOwnedFolder(input.userId, input.folderId);

    const f = await prisma.folder.update({
      where: { id: input.folderId },
      data: { emoji: input.emoji ?? null },
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
            documents: { where: VISIBLE_DOCUMENT_FILTER },
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
    await this.assertOwnedFolder(input.userId, input.folderId);

    const mode = input.mode || "cascade";

    if (mode === "folderOnly") {
      // Move documents out of the folder (and subfolders) to root level
      const folderFamilyIds = await this.collectFolderFamilyIds(
        input.userId,
        input.folderId,
      );
      const movedDocs = await prisma.document.updateMany({
        where: { folderId: { in: folderFamilyIds }, userId: input.userId },
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
