/**
 * Prisma-based FolderService implementation.
 * Implements the interface expected by FolderController.
 */

import prisma from '../config/database';
import type {
  FolderService,
  FolderRecord,
  FolderTreeNode,
} from '../controllers/folder.controller';

function toRecord(f: any): FolderRecord {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentFolderId ?? null,
    path: f.path ?? null,
    createdAt: f.createdAt?.toISOString?.() ?? f.createdAt,
    updatedAt: f.updatedAt?.toISOString?.() ?? f.updatedAt,
    counts: {
      docs: f._count?.documents ?? 0,
      subfolders: f._count?.subfolders ?? 0,
    },
  };
}

export class PrismaFolderService implements FolderService {
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
    if (input.q) {
      where.name = { contains: input.q, mode: 'insensitive' };
    }

    const folders = await prisma.folder.findMany({
      where,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { name: 'asc' },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });

    const hasMore = folders.length > limit;
    const items = (hasMore ? folders.slice(0, limit) : folders).map(toRecord);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor };
  }

  async tree(input: { userId: string }): Promise<FolderTreeNode[]> {
    const folders = await prisma.folder.findMany({
      where: { userId: input.userId, isDeleted: false },
      orderBy: { name: 'asc' },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });

    const map = new Map<string, FolderTreeNode>();
    const roots: FolderTreeNode[] = [];

    for (const f of folders) {
      map.set(f.id, { ...toRecord(f), children: [] });
    }

    for (const f of folders) {
      const node = map.get(f.id)!;
      if (f.parentFolderId && map.has(f.parentFolderId)) {
        map.get(f.parentFolderId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async get(input: { userId: string; folderId: string }): Promise<FolderRecord | null> {
    const f = await prisma.folder.findFirst({
      where: { id: input.folderId, userId: input.userId, isDeleted: false },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });
    return f ? toRecord(f) : null;
  }

  async create(input: { userId: string; name: string; parentId?: string | null }): Promise<FolderRecord> {
    const f = await prisma.folder.create({
      data: {
        userId: input.userId,
        name: input.name,
        parentFolderId: input.parentId ?? null,
      },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });
    return toRecord(f);
  }

  async rename(input: { userId: string; folderId: string; name: string }): Promise<FolderRecord> {
    const f = await prisma.folder.update({
      where: { id: input.folderId },
      data: { name: input.name },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });
    return toRecord(f);
  }

  async move(input: { userId: string; folderId: string; newParentId?: string | null }): Promise<FolderRecord> {
    const f = await prisma.folder.update({
      where: { id: input.folderId },
      data: { parentFolderId: input.newParentId ?? null },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });
    return toRecord(f);
  }

  async delete(input: {
    userId: string;
    folderId: string;
    mode?: 'soft' | 'hard';
  }): Promise<{ deleted: true; movedDocs?: number; movedToFolderId?: string }> {
    if (input.mode === 'hard') {
      await prisma.folder.delete({ where: { id: input.folderId } });
    } else {
      await prisma.folder.update({
        where: { id: input.folderId },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }
    return { deleted: true };
  }
}
