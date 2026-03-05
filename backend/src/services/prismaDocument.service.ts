/**
 * Prisma-based DocumentService implementation.
 * Implements the interface expected by DocumentController.
 */

import { createHash, randomUUID } from "crypto";
import prisma from "../config/database";
import {
  deleteFile,
  downloadFile,
  getSignedUrl,
  uploadFile,
} from "../config/storage";
import { addDocumentJob } from "../queues/document.queue";
import { documentQueue } from "../queues/queueConfig";
import { env } from "../config/env";
import {
  isPubSubAvailable,
  publishExtractJob,
} from "./jobs/pubsubPublisher.service";
import { documentContentVault } from "./documents/documentContentVault.service";
import { VISIBLE_DOCUMENT_FILTER } from "./documents/documentVisibilityFilter";
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

type DocumentCursor = { id: string; updatedAt: Date };

function assertValidUserStorageKey(userId: string, storageKey: string): void {
  const key = String(storageKey || "").trim();
  if (!key) throw new Error("storageKey is required");
  const expectedPrefix = `users/${userId}/docs/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error("Invalid storage key scope");
  }
  const segments = key.split("/");
  if (segments.some((seg) => seg === "." || seg === ".." || seg.length === 0)) {
    throw new Error("Invalid storage key path");
  }
}

function encodeDocumentCursor(row: {
  id: string;
  updatedAt: Date | string;
}): string {
  const payload = JSON.stringify({
    id: row.id,
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeDocumentCursor(raw: string): DocumentCursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { id?: unknown; updatedAt?: unknown };
    if (typeof parsed?.id !== "string") return null;
    if (typeof parsed?.updatedAt !== "string") return null;
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { id: parsed.id, updatedAt };
  } catch {
    return null;
  }
}

export class PrismaDocumentService implements DocumentService {
  private async assertOwnedFolder(
    userId: string,
    folderId?: string | null,
  ): Promise<void> {
    if (!folderId) return;
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!folder) throw new Error("Folder not found");
  }

  async list(input: {
    userId: string;
    limit?: number;
    cursor?: string;
    folderId?: string;
    q?: string;
    docTypes?: string[];
  }): Promise<{ items: DocumentRecord[]; nextCursor?: string }> {
    const limit = Math.min(input.limit ?? 50, 500);
    const filters: any[] = [
      {
        userId: input.userId,
        ...VISIBLE_DOCUMENT_FILTER,
      },
    ];

    if (input.folderId) filters.push({ folderId: input.folderId });
    if (input.q) {
      filters.push({
        OR: [
          { filename: { contains: input.q, mode: "insensitive" } },
          { displayTitle: { contains: input.q, mode: "insensitive" } },
        ],
      });
    }

    let decodedCursor = input.cursor ? decodeDocumentCursor(input.cursor) : null;
    if (input.cursor && !decodedCursor) {
      // Backward compatibility for legacy id-only cursors.
      const anchor = await prisma.document.findFirst({
        where: {
          AND: [...filters, { id: input.cursor }],
        },
        select: { id: true, updatedAt: true },
      });
      if (anchor) decodedCursor = { id: anchor.id, updatedAt: anchor.updatedAt };
    }
    if (decodedCursor) {
      filters.push({
        OR: [
          { updatedAt: { lt: decodedCursor.updatedAt } },
          {
            AND: [
              { updatedAt: decodedCursor.updatedAt },
              { id: { lt: decodedCursor.id } },
            ],
          },
        ],
      });
    }

    const where: any = { AND: filters };

    const docs = await prisma.document.findMany({
      where,
      take: limit + 1,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { folder: { select: { path: true } } },
    });

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const items = page.map(toRecord);
    const nextCursor =
      hasMore && page.length > 0 ? encodeDocumentCursor(page[page.length - 1]) : undefined;

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
    await this.assertOwnedFolder(input.userId, input.data.folderId ?? null);

    const docId = randomUUID();
    const safeName = input.data.filename.replace(
      /[^a-zA-Z0-9._\-\u00C0-\u024F\u1E00-\u1EFF]/g,
      "_",
    );
    const storageKey = `users/${input.userId}/docs/${docId}/${safeName}`;
    const persistedStorageKey = input.data.buffer
      ? storageKey
      : (() => {
          if (!input.data.storageKey) {
            throw new Error("storageKey is required when buffer is not provided");
          }
          assertValidUserStorageKey(input.userId, input.data.storageKey);
          return input.data.storageKey;
        })();

    let uploadedToStorage = false;

    // Upload buffer to storage (GCS/local) if provided
    if (input.data.buffer) {
      await uploadFile(storageKey, input.data.buffer, input.data.mimeType);
      uploadedToStorage = true;
    }

    const fileSize = input.data.sizeBytes ?? 0;
    const fileHash = input.data.buffer
      ? createHash("sha256").update(input.data.buffer).digest("hex")
      : `pending-${docId}`;

    // Create document and update user storage in a transaction
    let doc: any;
    try {
      doc = await prisma.$transaction(
        async (tx) => {
          // Create the document record
          const document = await tx.document.create({
            data: {
              id: docId,
              userId: input.userId,
              filename: input.data.filename,
              encryptedFilename: persistedStorageKey,
              mimeType: input.data.mimeType,
              fileSize,
              fileHash,
              folderId: input.data.folderId ?? null,
              status: "uploaded",
              indexingState: "pending",
              indexingUpdatedAt: new Date(),
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
    } catch (dbErr) {
      if (uploadedToStorage) {
        try {
          await deleteFile(storageKey);
        } catch (cleanupErr) {
          console.warn(
            `[PrismaDocumentService] Failed to cleanup uploaded blob after DB rollback for ${docId}:`,
            cleanupErr,
          );
        }
      }
      throw dbErr;
    }

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
          encryptedFilename: doc.encryptedFilename,
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
    const deleteSource = input.source || "unknown";
    console.info("[DocumentDelete] Request received", {
      documentId: input.documentId,
      userId: input.userId,
      source: deleteSource,
    });

    let deletedCount = 0;
    let deletedBytes = 0;
    await prisma.$transaction(
      async (tx) => {
        const doc = await tx.document.findFirst({
          where: { id: input.documentId, userId: input.userId },
          select: { fileSize: true },
        });
        if (!doc) {
          deletedCount = 0;
          deletedBytes = 0;
          return;
        }

        // Delete the document
        const deleted = await tx.document.deleteMany({
          where: { id: input.documentId, userId: input.userId },
        });
        deletedCount = deleted.count;
        deletedBytes = doc.fileSize;

        // Decrement user's storage usage if document existed
        if (deleted.count > 0 && doc.fileSize > 0) {
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

    // Cascade: synchronously delete Pinecone vectors after Postgres deletion
    if (deletedCount > 0) {
      try {
        const vectorEmbeddingRuntimeService = (
          await import("../services/retrieval/vectorEmbedding.runtime.service")
        ).default;
        await vectorEmbeddingRuntimeService.deleteDocumentEmbeddings(
          input.documentId,
        );
      } catch (pineconeErr: any) {
        // Non-fatal: Pinecone cleanup will be caught by orphan sweeper
        console.warn("[DocumentDelete] Pinecone cascade delete failed", {
          documentId: input.documentId,
          error: pineconeErr?.message,
        });
      }
    }

    console.info("[DocumentDelete] Request completed", {
      documentId: input.documentId,
      userId: input.userId,
      source: deleteSource,
      deletedCount,
      deletedBytes,
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

  async reindex(input: {
    userId: string;
    documentId: string;
  }): Promise<{ status: "queued" | "started" }> {
    const requested = await prisma.document.findFirst({
      where: { id: input.documentId, userId: input.userId },
      select: {
        id: true,
        parentVersionId: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
      },
    });
    if (!requested) throw new Error("Document not found");

    const rootDocumentId = requested.parentVersionId || requested.id;
    const latest = await prisma.document.findFirst({
      where: {
        userId: input.userId,
        OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
        status: {
          in: [
            "uploading",
            "uploaded",
            "enriching",
            "indexed",
            "ready",
            "failed",
            "skipped",
            "available",
            "completed",
          ],
        },
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    const target = latest || requested;
    if (!target.encryptedFilename) {
      throw new Error("Document has no storage key");
    }

    await prisma.document.update({
      where: { id: target.id },
      data: {
        status: "uploaded",
        indexingState: "pending",
        indexingOperationId: null,
        indexingError: null,
        indexingUpdatedAt: new Date(),
        embeddingsGenerated: false,
        chunksCount: 0,
        error: null,
      },
    });

    const filename = target.filename || "unknown";
    const mimeType = target.mimeType || "application/octet-stream";

    if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
      await publishExtractJob(
        target.id,
        input.userId,
        target.encryptedFilename,
        mimeType,
        filename,
      );
      return { status: "queued" };
    }

    await documentQueue.add(
      "process-document",
      {
        documentId: target.id,
        userId: input.userId,
        filename,
        mimeType,
        encryptedFilename: target.encryptedFilename,
      },
      {
        jobId: `doc-${target.id}-reindex-${Date.now()}`,
      },
    );

    return { status: "queued" };
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
    assertValidUserStorageKey(input.userId, storageKey);

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
    assertValidUserStorageKey(input.userId, storageKey);

    const url = await getSignedUrl(storageKey, 3600);
    return { url, filename: doc.filename ?? "unknown" };
  }
}
