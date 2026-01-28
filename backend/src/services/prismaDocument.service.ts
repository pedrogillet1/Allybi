/**
 * Prisma-based DocumentService implementation.
 * Implements the interface expected by DocumentController.
 */

import prisma from '../config/database';
import { downloadFile, getSignedUrl } from '../config/storage';
import type {
  DocumentService,
  DocumentRecord,
  DocumentPreview,
  UploadInput,
} from '../controllers/document.controller';

function extractFilename(doc: any): string {
  if (doc.filename) return doc.filename;
  // Encryption-at-rest may null out filename; recover from S3 path
  // Path format: users/.../docs/.../Capitulo_8.pdf → last segment
  if (doc.encryptedFilename) {
    const segments = doc.encryptedFilename.split('/');
    return segments[segments.length - 1] || 'unknown';
  }
  return 'unknown';
}

function toRecord(doc: any): DocumentRecord {
  const filename = extractFilename(doc);
  const uploadedAt = doc.createdAt?.toISOString?.() ?? doc.createdAt;
  const sizeBytes = doc.fileSize ?? 0;
  return {
    id: doc.id,
    title: doc.displayTitle || filename,
    filename,
    mimeType: doc.mimeType,
    folderId: doc.folderId ?? null,
    folderPath: doc.folder?.path ?? null,
    sizeBytes,
    fileSize: sizeBytes,
    uploadedAt,
    createdAt: uploadedAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
    status: doc.status === 'ready' ? 'ready' : doc.status === 'failed' ? 'failed' : 'processing',
  };
}

export class PrismaDocumentService implements DocumentService {
  async list(input: {
    userId: string;
    limit?: number;
    cursor?: string;
    folderId?: string;
    q?: string;
    docTypes?: string[];
  }): Promise<{ items: DocumentRecord[]; nextCursor?: string }> {
    const limit = Math.min(input.limit ?? 50, 200);
    const where: any = { userId: input.userId };

    if (input.folderId) where.folderId = input.folderId;
    if (input.q) {
      where.OR = [
        { filename: { contains: input.q, mode: 'insensitive' } },
        { displayTitle: { contains: input.q, mode: 'insensitive' } },
      ];
    }

    const docs = await prisma.document.findMany({
      where,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: 'desc' },
      include: { folder: { select: { path: true } } },
    });

    const hasMore = docs.length > limit;
    const items = (hasMore ? docs.slice(0, limit) : docs).map(toRecord);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor };
  }

  async get(input: { userId: string; documentId: string }): Promise<DocumentRecord | null> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      include: { folder: { select: { path: true } } },
    });
    return doc ? toRecord(doc) : null;
  }

  async upload(input: { userId: string; data: UploadInput }): Promise<DocumentRecord> {
    const doc = await prisma.document.create({
      data: {
        userId: input.userId,
        filename: input.data.filename,
        encryptedFilename: input.data.filename,
        mimeType: input.data.mimeType,
        fileSize: input.data.sizeBytes ?? 0,
        fileHash: '',
        folderId: input.data.folderId ?? null,
        status: 'uploaded',
      },
      include: { folder: { select: { path: true } } },
    });
    return toRecord(doc);
  }

  async delete(input: { userId: string; documentId: string }): Promise<{ deleted: true }> {
    await prisma.document.deleteMany({
      where: { id: input.documentId, userId: input.userId },
    });
    return { deleted: true };
  }

  async preview(input: {
    userId: string;
    documentId: string;
    mode?: 'auto' | 'text' | 'html' | 'thumbs';
    page?: number;
  }): Promise<DocumentPreview> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { previewText: true, renderableContent: true },
    });
    return {
      kind: 'text',
      content: doc?.renderableContent || doc?.previewText || '(No preview available)',
    };
  }

  async streamFile(input: {
    userId: string;
    documentId: string;
  }): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { encryptedFilename: true, mimeType: true, filename: true },
    });
    if (!doc) throw new Error('Document not found');

    const storageKey = doc.encryptedFilename;
    if (!storageKey) throw new Error('Document has no storage key');

    const buffer = await downloadFile(storageKey);
    return {
      buffer,
      mimeType: doc.mimeType || 'application/octet-stream',
      filename: doc.filename ?? 'unknown',
    };
  }

  async getDownloadUrl(input: {
    userId: string;
    documentId: string;
  }): Promise<{ url: string; filename: string }> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { encryptedFilename: true, filename: true },
    });
    if (!doc) throw new Error('Document not found');

    const storageKey = doc.encryptedFilename;
    if (!storageKey) throw new Error('Document has no storage key');

    const url = await getSignedUrl(storageKey, 3600);
    return { url, filename: doc.filename ?? 'unknown' };
  }
}
