import prisma from "../../platform/db/prismaClient";

export interface UploadingDocumentInput {
  id: string;
  userId: string;
  folderId?: string | null;
  filename: string;
  encryptedFilename: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  uploadSessionId?: string | null;
}

export interface UploadTransitionBatchInput {
  userId: string;
  documentIds: string[];
  at?: Date;
  touchUpdatedAt?: boolean;
}

export interface UpdateDocumentFieldsInput {
  userId: string;
  documentId: string;
  folderId?: string | null;
  filename?: string;
  displayTitle?: string | null;
}

class DocumentUploadWriteService {
  private async assertOwnedFolder(
    userId: string,
    folderId: string | null | undefined,
  ): Promise<void> {
    if (!folderId) return;
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!folder) throw new Error("Folder not found");
  }

  private async assertOwnedFolders(
    userId: string,
    folderIds: Array<string | null | undefined>,
  ): Promise<void> {
    const uniqueIds = Array.from(
      new Set(
        folderIds
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .map((id) => id.trim()),
      ),
    );
    if (uniqueIds.length === 0) return;

    const owned = await prisma.folder.findMany({
      where: { id: { in: uniqueIds }, userId, isDeleted: false },
      select: { id: true },
    });
    if (owned.length !== uniqueIds.length) throw new Error("Folder not found");
  }

  async createUploadingDocument(input: UploadingDocumentInput): Promise<void> {
    await this.assertOwnedFolder(input.userId, input.folderId);
    await prisma.document.create({
      data: {
        id: input.id,
        userId: input.userId,
        folderId: input.folderId ?? null,
        filename: input.filename,
        encryptedFilename: input.encryptedFilename,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        fileHash: input.fileHash,
        status: "uploading",
        uploadSessionId: input.uploadSessionId ?? null,
        indexingState: "pending",
        indexingError: null,
        indexingUpdatedAt: new Date(),
      },
    });
  }

  async createUploadingDocumentsBulk(
    userId: string,
    docs: Array<{
      id: string;
      folderId: string | null;
      filename: string;
      encryptedFilename: string;
      fileSize: number;
      mimeType: string;
      fileHash: string;
    }>,
    uploadSessionId?: string | null,
  ): Promise<number> {
    if (docs.length === 0) return 0;
    await this.assertOwnedFolders(
      userId,
      docs.map((doc) => doc.folderId),
    );
    const result = await prisma.document.createMany({
      data: docs.map((doc) => ({
        id: doc.id,
        userId,
        folderId: doc.folderId,
        filename: doc.filename,
        encryptedFilename: doc.encryptedFilename,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        fileHash: doc.fileHash,
        status: "uploading",
        uploadSessionId: uploadSessionId ?? null,
      })),
    });
    return result.count;
  }

  async transitionUploadingToUploadedBatch(
    input: UploadTransitionBatchInput,
  ): Promise<number> {
    if (input.documentIds.length === 0) return 0;
    return prisma.$transaction(async (tx) => {
      const at = input.at ?? new Date();
      const uploadingDocs = await tx.document.findMany({
        where: {
          id: { in: input.documentIds },
          userId: input.userId,
          status: "uploading",
        },
        select: { id: true, fileSize: true },
      });
      if (uploadingDocs.length === 0) return 0;

      const data: Record<string, unknown> = {
        status: "uploaded",
        indexingState: "pending",
        indexingError: null,
        indexingUpdatedAt: at,
      };
      if (input.touchUpdatedAt) {
        data.updatedAt = at;
      }

      const result = await tx.document.updateMany({
        where: {
          id: { in: uploadingDocs.map((d) => d.id) },
          userId: input.userId,
          status: "uploading",
        },
        data,
      });

      const totalBytes = uploadingDocs.reduce(
        (sum, doc) => sum + Math.max(0, doc.fileSize || 0),
        0,
      );
      if (result.count > 0 && totalBytes > 0) {
        await tx.user.update({
          where: { id: input.userId },
          data: { storageUsedBytes: { increment: totalBytes } },
        });
      }

      return result.count;
    });
  }

  async transitionUploadingToUploadedSingle(input: {
    userId: string;
    documentId: string;
    at?: Date;
  }): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const uploadingDoc = await tx.document.findFirst({
        where: {
          id: input.documentId,
          userId: input.userId,
          status: "uploading",
        },
        select: { fileSize: true },
      });
      if (!uploadingDoc) return 0;

      const result = await tx.document.updateMany({
        where: {
          id: input.documentId,
          userId: input.userId,
          status: "uploading",
        },
        data: {
          status: "uploaded",
          indexingState: "pending",
          indexingError: null,
          indexingUpdatedAt: input.at ?? new Date(),
        },
      });

      if (result.count > 0 && (uploadingDoc.fileSize || 0) > 0) {
        await tx.user.update({
          where: { id: input.userId },
          data: {
            storageUsedBytes: { increment: Math.max(0, uploadingDoc.fileSize) },
          },
        });
      }

      return result.count;
    });
  }

  async markUploadedPendingById(input: {
    userId: string;
    documentId: string;
    at?: Date;
  }): Promise<number> {
    return this.transitionUploadingToUploadedSingle({
      userId: input.userId,
      documentId: input.documentId,
      at: input.at,
    });
  }

  async markFailedBatch(input: {
    userId: string;
    documentIds: string[];
  }): Promise<number> {
    if (input.documentIds.length === 0) return 0;
    const result = await prisma.document.updateMany({
      where: { id: { in: input.documentIds }, userId: input.userId },
      data: { status: "failed" },
    });
    return result.count;
  }

  async markQueueSchedulingFailed(input: {
    userId: string;
    documentId: string;
    queueMessage: string;
    at?: Date;
  }): Promise<number> {
    const result = await prisma.document.updateMany({
      where: { id: input.documentId, userId: input.userId },
      data: {
        status: "uploaded",
        indexingState: "failed",
        indexingError: `Queue scheduling failed: ${String(input.queueMessage).slice(0, 300)}`,
        indexingUpdatedAt: input.at ?? new Date(),
      },
    });
    return result.count;
  }

  async updateDocumentFieldsForUser(input: UpdateDocumentFieldsInput) {
    const data: {
      folderId?: string | null;
      filename?: string;
      displayTitle?: string | null;
    } = {};

    if (input.folderId !== undefined) {
      if (input.folderId !== null) {
        await this.assertOwnedFolder(input.userId, input.folderId);
      }
      data.folderId = input.folderId;
    }
    if (input.filename !== undefined) data.filename = input.filename;
    if (input.displayTitle !== undefined) data.displayTitle = input.displayTitle;

    if (Object.keys(data).length === 0) return null;

    const result = await prisma.document.updateMany({
      where: {
        id: input.documentId,
        userId: input.userId,
      },
      data,
    });

    if (result.count === 0) return null;

    return prisma.document.findFirst({
      where: {
        id: input.documentId,
        userId: input.userId,
      },
      include: {
        folder: {
          select: { path: true },
        },
      },
    });
  }

  async resetForReprocess(input: {
    userId: string;
    documentId: string;
    at?: Date;
  }): Promise<number> {
    const result = await prisma.document.updateMany({
      where: {
        id: input.documentId,
        userId: input.userId,
      },
      data: {
        status: "uploaded",
        indexingState: "pending",
        indexingError: null,
        indexingUpdatedAt: input.at ?? new Date(),
        error: null,
      },
    });
    return result.count;
  }

  async upsertDocumentMetadata(input: {
    documentId: string;
    update: Record<string, unknown>;
    create?: Record<string, unknown>;
  }) {
    return prisma.documentMetadata.upsert({
      where: { documentId: input.documentId },
      update: input.update as any,
      create: {
        documentId: input.documentId,
        ...(input.create ?? input.update),
      } as any,
    });
  }

  async updateDocumentMetadata(input: {
    documentId: string;
    data: Record<string, unknown>;
  }) {
    return prisma.documentMetadata.update({
      where: { documentId: input.documentId },
      data: input.data as any,
    });
  }
}

export const documentUploadWriteService = new DocumentUploadWriteService();
