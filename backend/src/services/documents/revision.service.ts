import * as crypto from "crypto";
import prisma from "../../config/database";
import { uploadFile } from "../../config/storage";
import { addDocumentJob } from "../../queues/document.queue";
import { logger } from "../../utils/logger";

export interface RevisionContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface CreateRevisionInput {
  userId: string;
  sourceDocumentId: string;
  contentBuffer: Buffer;
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
  enqueueReindex?: boolean;
  reason?: string;
  authorId?: string;
}

export interface RevisionRecord {
  id: string;
  rootDocumentId: string;
  sourceDocumentId: string;
  revisionNumber: number;
  filename: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

export interface ListRevisionsResult {
  rootDocumentId: string;
  revisions: RevisionRecord[];
}

export class RevisionServiceError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "RevisionServiceError";
    this.code = code;
  }
}

export function getRevisionMaxDepth(): number {
  const raw = Number(process.env.REVISION_MAX_DEPTH);
  if (Number.isFinite(raw) && raw >= 2 && raw <= 1000) return Math.floor(raw);
  return 20;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

function normalizeFilename(base: string): string {
  return base
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function toBaseName(filename: string): string {
  const normalized = normalizeFilename(filename);
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0) return normalized;
  return normalized.slice(0, dot);
}

function toExtension(filename: string): string {
  const normalized = normalizeFilename(filename);
  const dot = normalized.lastIndexOf(".");
  if (dot <= 0) return "";
  return normalized.slice(dot).toLowerCase();
}

function extensionForMime(mimeType: string): string {
  return MIME_EXTENSION_MAP[mimeType] ?? "";
}

function generateRevisionStorageKey(
  userId: string,
  rootDocumentId: string,
  extension: string,
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = crypto.randomBytes(8).toString("hex");
  const ext = extension.startsWith(".")
    ? extension
    : extension
      ? `.${extension}`
      : "";
  return `users/${userId}/revisions/${rootDocumentId}/${stamp}-${rand}${ext}`;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export class RevisionService {
  async createRevision(
    input: CreateRevisionInput,
    ctx?: RevisionContext,
  ): Promise<RevisionRecord> {
    const userId = input.userId.trim();
    const sourceDocumentId = input.sourceDocumentId.trim();

    if (!userId) {
      throw new RevisionServiceError("userId is required.", "INVALID_USER_ID");
    }

    if (!sourceDocumentId) {
      throw new RevisionServiceError(
        "sourceDocumentId is required.",
        "INVALID_SOURCE_DOCUMENT_ID",
      );
    }

    if (
      !Buffer.isBuffer(input.contentBuffer) ||
      input.contentBuffer.length === 0
    ) {
      throw new RevisionServiceError(
        "contentBuffer must contain bytes.",
        "INVALID_CONTENT_BUFFER",
      );
    }

    const source = await prisma.document.findFirst({
      where: { id: sourceDocumentId, userId },
      select: {
        id: true,
        userId: true,
        folderId: true,
        filename: true,
        encryptedFilename: true,
        mimeType: true,
        parentVersionId: true,
      },
    });

    if (!source) {
      throw new RevisionServiceError(
        "Source document not found.",
        "SOURCE_DOCUMENT_NOT_FOUND",
      );
    }

    const rootDocumentId = await this.resolveRootDocumentId(source.id);

    const mimeType = input.mimeType?.trim() || source.mimeType;
    const sourceFilename =
      input.filename?.trim() || source.filename || "document";
    const preferredExt =
      extensionForMime(mimeType) || toExtension(sourceFilename) || ".bin";
    const baseName = toBaseName(sourceFilename) || "document";

    // Upload file BEFORE the transaction — storageKey doesn't depend on revisionNumber
    const storageKey = generateRevisionStorageKey(
      userId,
      rootDocumentId,
      preferredExt,
    );
    await uploadFile(
      storageKey,
      input.contentBuffer,
      mimeType || "application/octet-stream",
    );

    const fileHash = sha256(input.contentBuffer);

    // Wrap count + create in a serializable transaction to prevent
    // concurrent revisions from getting the same revisionNumber
    const { revisionNumber, created, revisionFilename } = await prisma.$transaction(
      async (tx) => {
        const revNum = await tx.document.count({
          where: {
            userId,
            OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
          },
        });

        const revisionFilename = normalizeFilename(
          `${baseName} (rev ${revNum})${preferredExt}`,
        );

        const doc = await tx.document.create({
          data: {
            userId,
            folderId: source.folderId,
            filename: revisionFilename,
            encryptedFilename: storageKey,
            fileSize: input.contentBuffer.length,
            mimeType,
            fileHash,
            parentVersionId: rootDocumentId,
            status: "uploaded",
            indexingState: "pending",
            indexingUpdatedAt: new Date(),
            error: null,
          },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            fileSize: true,
            createdAt: true,
          },
        });

        await tx.documentLink.upsert({
          where: {
            sourceDocumentId_targetDocumentId_relationshipType: {
              sourceDocumentId: doc.id,
              targetDocumentId: rootDocumentId,
              relationshipType: "amends",
            },
          },
          update: {
            status: "active",
          },
          create: {
            sourceDocumentId: doc.id,
            targetDocumentId: rootDocumentId,
            relationshipType: "amends",
            status: "active",
          },
        });

        return { revisionNumber: revNum, created: doc, revisionFilename };
      },
      { isolationLevel: "Serializable" },
    );

    const shouldEnqueue = input.enqueueReindex !== false;
    if (shouldEnqueue) {
      await addDocumentJob({
        documentId: created.id,
        encryptedFilename: storageKey,
        filename: created.filename || revisionFilename,
        mimeType: created.mimeType,
        userId,
        thumbnailUrl: null,
      });
    }

    // Store author attribution in revision metadata
    const authorId = input.authorId || ctx?.userId || userId;
    if (authorId) {
      input.metadata = { ...(input.metadata || {}), authorId };
    }

    logger.info("[RevisionService] revision created", {
      documentId: created.id,
      sourceDocumentId: source.id,
      rootDocumentId,
      revisionNumber,
      correlationId: ctx?.correlationId,
      userId: ctx?.userId ?? userId,
      conversationId: ctx?.conversationId,
      clientMessageId: ctx?.clientMessageId,
      reason: input.reason,
      metadata: input.metadata,
      authorId,
      enqueued: shouldEnqueue,
    });

    return {
      id: created.id,
      rootDocumentId,
      sourceDocumentId: source.id,
      revisionNumber,
      filename: created.filename || revisionFilename,
      mimeType: created.mimeType,
      fileSize: created.fileSize,
      createdAt: created.createdAt,
    };
  }

  async listRevisions(
    userId: string,
    documentId: string,
  ): Promise<ListRevisionsResult> {
    const normalizedUserId = userId.trim();
    const normalizedDocId = documentId.trim();

    if (!normalizedUserId || !normalizedDocId) {
      throw new RevisionServiceError(
        "userId and documentId are required.",
        "INVALID_LIST_REVISIONS_INPUT",
      );
    }

    const source = await prisma.document.findFirst({
      where: { id: normalizedDocId, userId: normalizedUserId },
      select: { id: true },
    });

    if (!source) {
      throw new RevisionServiceError(
        "Document not found.",
        "DOCUMENT_NOT_FOUND",
      );
    }

    const rootDocumentId = await this.resolveRootDocumentId(source.id);

    const docs = await prisma.document.findMany({
      where: {
        userId: normalizedUserId,
        OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        createdAt: true,
      },
    });

    const revisions: RevisionRecord[] = docs.map((doc, index) => ({
      id: doc.id,
      rootDocumentId,
      sourceDocumentId: source.id,
      revisionNumber: index,
      filename: doc.filename || `revision-${index}`,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      createdAt: doc.createdAt,
    }));

    return {
      rootDocumentId,
      revisions,
    };
  }

  private async resolveRootDocumentId(documentId: string): Promise<string> {
    let currentId: string | null = documentId;
    let safety = 0;

    const maxDepth = getRevisionMaxDepth();
    const warnThreshold = Math.floor(maxDepth * 0.8);

    while (currentId && safety < maxDepth) {
      safety += 1;
      if (safety === warnThreshold) {
        logger.warn("[RevisionService] Approaching revision chain depth limit", {
          documentId,
          currentDepth: safety,
          maxDepth,
        });
      }
      const row: { id: string; parentVersionId: string | null } | null =
        await prisma.document.findUnique({
          where: { id: currentId },
          select: { id: true, parentVersionId: true },
        });

      if (!row) {
        throw new RevisionServiceError(
          `Revision chain broken for document ${documentId}.`,
          "REVISION_CHAIN_BROKEN",
        );
      }

      if (!row.parentVersionId) {
        return row.id;
      }

      currentId = row.parentVersionId;
    }

    throw new RevisionServiceError(
      `Revision chain exceeded safety depth (max: ${maxDepth}).`,
      "REVISION_CHAIN_DEPTH_EXCEEDED",
    );
  }
}

export default RevisionService;
