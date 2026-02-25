/**
 * Prisma-based DocumentService implementation.
 * Implements the interface expected by DocumentController.
 */

import { randomUUID } from "crypto";
import prisma from "../config/database";
import { downloadFile, getSignedUrl, uploadFile } from "../config/storage";
import { addDocumentJob } from "../queues/document.queue";
import { env } from "../config/env";
import {
  isPubSubAvailable,
  publishExtractJob,
} from "./jobs/pubsubPublisher.service";
import { documentContentVault } from "./documents/documentContentVault.service";
import type {
  DocumentService,
  DocumentRecord,
  DocumentPreview,
  UploadInput,
} from "../controllers/document.controller";

function extractFilename(doc: any): string {
  if (doc.filename) return doc.filename;
  // Encryption-at-rest may null out filename; recover from storage key path
  // Path format: users/.../docs/.../Capitulo_8.pdf → last segment
  if (doc.encryptedFilename) {
    const segments = doc.encryptedFilename.split("/");
    return segments[segments.length - 1] || "unknown";
  }
  return "unknown";
}

/**
 * Infer MIME type from filename extension when stored value is missing or generic.
 */
function inferMimeFromFilename(
  filename: string,
  storedMime?: string | null,
): string {
  if (storedMime && storedMime !== "application/octet-stream")
    return storedMime;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return storedMime || "application/octet-stream";

  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    rtf: "application/rtf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    heif: "image/heif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    mov: "video/quicktime",
    zip: "application/zip",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    epub: "application/epub+zip",
  };

  return map[ext] || storedMime || "application/octet-stream";
}

function toRecord(doc: any): DocumentRecord {
  const filename = extractFilename(doc);
  const uploadedAt = doc.createdAt?.toISOString?.() ?? doc.createdAt;
  const sizeBytes = doc.fileSize ?? 0;
  return {
    id: doc.id,
    title: doc.displayTitle || filename,
    filename,
    mimeType: inferMimeFromFilename(filename, doc.mimeType),
    folderId: doc.folderId ?? null,
    folderPath: doc.folder?.path ?? null,
    sizeBytes,
    fileSize: sizeBytes,
    uploadedAt,
    createdAt: uploadedAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
    status:
      doc.status === "ready"
        ? "ready"
        : doc.status === "failed"
          ? "failed"
          : "processing",
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
    const limit = Math.min(input.limit ?? 50, 10000);
    const where: any = {
      userId: input.userId,
      // Show documents in all states (processing/ready/failed) except "skipped".
      // This keeps the library stable while background indexing runs.
      status: { not: "skipped" },
      // Never show revision artifacts in the main library ("Recently Added").
      // Revisions are internal history and should only be reachable via explicit IDs/undo flows.
      parentVersionId: null,
      // Hide connector-ingested artifacts (emails/slack) from the user document library.
      encryptedFilename: { not: { contains: "/connectors/" } },
    };

    if (input.folderId) where.folderId = input.folderId;
    if (input.q) {
      where.OR = [
        { filename: { contains: input.q, mode: "insensitive" } },
        { displayTitle: { contains: input.q, mode: "insensitive" } },
      ];
    }

    const docs = await prisma.document.findMany({
      where,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { updatedAt: "desc" },
      include: { folder: { select: { path: true } } },
    });

    const hasMore = docs.length > limit;
    const items = (hasMore ? docs.slice(0, limit) : docs).map(toRecord);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    return { items, nextCursor };
  }

  async get(input: {
    userId: string;
    documentId: string;
  }): Promise<DocumentRecord | null> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      include: { folder: { select: { path: true } } },
    });
    return doc ? toRecord(doc) : null;
  }

  async upload(input: {
    userId: string;
    data: UploadInput;
  }): Promise<DocumentRecord> {
    const docId = randomUUID();
    const safeName = input.data.filename.replace(
      /[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF]/g,
      "_",
    );
    const storageKey = `users/${input.userId}/docs/${docId}/${safeName}`;

    // Upload buffer to storage (GCS/local) if provided
    if (input.data.buffer) {
      await uploadFile(storageKey, input.data.buffer, input.data.mimeType);
    }

    const fileSize = input.data.sizeBytes ?? 0;

    // Create document and update user storage in a transaction
    const doc = await prisma.$transaction(
      async (tx) => {
        // Create the document record
        const document = await tx.document.create({
          data: {
            id: docId,
            userId: input.userId,
            filename: input.data.filename,
            encryptedFilename: input.data.buffer
              ? storageKey
              : input.data.filename,
            mimeType: input.data.mimeType,
            fileSize,
            fileHash: "",
            folderId: input.data.folderId ?? null,
            status: "uploaded",
          },
          include: { folder: { select: { path: true } } },
        });

        // Update user's storage usage
        await tx.user.update({
          where: { id: input.userId },
          data: {
            storageUsedBytes: { increment: fileSize },
          },
        });

        return document;
      },
      { maxWait: 10000, timeout: 60000 },
    );

    // Enqueue for processing (text extraction → chunking → embedding)
    try {
      if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
        const key = doc.encryptedFilename || storageKey;
        await publishExtractJob(
          doc.id,
          input.userId,
          key,
          input.data.mimeType,
          input.data.filename,
        );
      } else {
        await addDocumentJob({
          documentId: doc.id,
          userId: input.userId,
          filename: input.data.filename,
          mimeType: input.data.mimeType,
          encryptedFilename: storageKey,
        });
      }
    } catch (e) {
      console.error(
        `[PrismaDocumentService] Failed to queue document ${doc.id}:`,
        e,
      );
    }

    return toRecord(doc);
  }

  async delete(input: {
    userId: string;
    documentId: string;
    source?: string;
  }): Promise<{ deleted: true }> {
    // Get document size before deleting to update user storage
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: { fileSize: true },
    });

    const deleteSource = input.source || "unknown";
    console.info("[DocumentDelete] Request received", {
      documentId: input.documentId,
      userId: input.userId,
      source: deleteSource,
      exists: !!doc,
    });

    let deletedCount = 0;
    await prisma.$transaction(
      async (tx) => {
        // Delete the document
        const deleted = await tx.document.deleteMany({
          where: { id: input.documentId, userId: input.userId },
        });
        deletedCount = deleted.count;

        // Decrement user's storage usage if document existed
        if (doc && doc.fileSize > 0) {
          await tx.user.update({
            where: { id: input.userId },
            data: {
              storageUsedBytes: { decrement: doc.fileSize },
            },
          });
        }
      },
      { maxWait: 10000, timeout: 60000 },
    );

    console.info("[DocumentDelete] Request completed", {
      documentId: input.documentId,
      userId: input.userId,
      source: deleteSource,
      deletedCount,
    });

    return { deleted: true };
  }

  async preview(input: {
    userId: string;
    documentId: string;
    mode?: "auto" | "text" | "html" | "thumbs";
    page?: number;
  }): Promise<DocumentPreview> {
    const doc = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: {
        rawText: true,
        previewText: true,
        renderableContent: true,
        extractedTextEncrypted: true,
        previewTextEncrypted: true,
        renderableContentEncrypted: true,
      },
    });

    const content = await documentContentVault.resolvePreviewText(
      input.userId,
      input.documentId,
      doc,
    );

    return {
      kind: "text",
      content: content || "(No preview available)",
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
    if (!doc) throw new Error("Document not found");

    const storageKey = doc.encryptedFilename;
    if (!storageKey) throw new Error("Document has no storage key");

    const buffer = await downloadFile(storageKey);
    return {
      buffer,
      mimeType: doc.mimeType || "application/octet-stream",
      filename: doc.filename ?? "unknown",
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
    if (!doc) throw new Error("Document not found");

    const storageKey = doc.encryptedFilename;
    if (!storageKey) throw new Error("Document has no storage key");

    const url = await getSignedUrl(storageKey, 3600);
    return { url, filename: doc.filename ?? "unknown" };
  }
}
