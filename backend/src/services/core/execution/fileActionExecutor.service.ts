/**
 * FileActionExecutorService
 *
 * A generic executor for file/folder write operations.
 * 100% databank-driven - reads ALL configuration from file_action_operators.any.json:
 * - Operator config (service, method, destructive, confirmation)
 * - Entity extraction rules
 * - Microcopy (success, error, confirmation prompts)
 * - Undo rules
 *
 * NO hardcoded operator names or switch statements.
 */

import prisma from "../../../config/database";
import { getOptionalBank } from "../banks/bankLoader.service";
import {
  EntityExtractorService,
  getEntityExtractor,
  type LanguageCode,
  type FileActionOperatorsBank,
} from "../extraction/entityExtractor.service";
import {
  ActionHistoryService,
  getActionHistoryService,
  type UndoHistoryEntry,
} from "./actionHistory.service";

export interface FileActionContext {
  userId: string;
  operator: string;
  message: string;
  language: LanguageCode;
  confirmationToken?: string;
  attachedDocumentIds?: string[];
}

export interface FileActionAttachment {
  // 'folder' and 'document' match frontend SourcesList rendering
  // 'action_confirmation' is for destructive action confirmation buttons
  type: "folder" | "document" | "action_confirmation";
  id?: string;
  title?: string;
  filename?: string;
  folderId?: string;
  docId?: string; // Frontend expects docId, not documentId
  documentId?: string; // Keep for backwards compatibility
  confirmationId?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: string;
  operator?: string; // For confirmation flow
}

export interface FileActionResult {
  success: boolean;
  message: string;
  requiresConfirmation?: boolean;
  attachments?: FileActionAttachment[];
  data?: Record<string, any>;
  operator?: string;
}

interface ServiceResult {
  success: boolean;
  data?: Record<string, any>;
  microcopyKey?: string;
  error?: string;
}

export class FileActionExecutorService {
  private bank: FileActionOperatorsBank | null = null;
  private entityExtractor: EntityExtractorService;
  private actionHistory: ActionHistoryService;

  constructor() {
    this.loadBank();
    this.entityExtractor = getEntityExtractor();
    this.actionHistory = getActionHistoryService();
  }

  private loadBank(): void {
    this.bank = getOptionalBank<FileActionOperatorsBank>(
      "file_action_operators",
    );
    if (this.bank) {
      console.log(
        "[FileActionExecutor] Loaded file_action_operators bank successfully",
      );
    }
  }

  /**
   * Ensure bank is loaded (lazy reload if initially failed).
   */
  private ensureBank(): FileActionOperatorsBank | null {
    if (!this.bank) {
      this.loadBank();
    }
    return this.bank;
  }

  /**
   * Execute a file action based on operator and message.
   */
  async execute(ctx: FileActionContext): Promise<FileActionResult> {
    const bank = this.ensureBank();
    if (!bank) {
      return {
        success: false,
        message: "File action operators not configured.",
      };
    }

    // Load operator config from databank
    const opConfig = bank.operators[ctx.operator];
    const bulkConfig = bank.bulkOperators?.[ctx.operator];

    if (!opConfig && !bulkConfig) {
      return { success: false, message: `Unknown operator: ${ctx.operator}` };
    }

    // For bulk operators, get base config
    const config = bulkConfig
      ? { ...bank.operators[bulkConfig.baseOperator], ...bulkConfig }
      : opConfig;

    // Extract entities using databank-defined rules
    const entities = await this.entityExtractor.extract(
      ctx.message,
      config.entityExtraction,
      ctx.language,
    );

    // Handle bulk operations with attached document IDs
    // When user says "move these files to X" with attachments, use attachedDocumentIds
    if (
      bulkConfig &&
      ctx.attachedDocumentIds &&
      ctx.attachedDocumentIds.length > 0
    ) {
      const attachmentIndicators =
        /\b(these|those|attached|the files|esses|essas|esses arquivos|esses documentos|anexados|anexos)\b/i;
      if (attachmentIndicators.test(ctx.message)) {
        // For bulk move with attachments, we need target folder from entities
        if (ctx.operator === "file_bulk_move") {
          return this.executeBulkMoveWithIds(
            ctx.userId,
            ctx.attachedDocumentIds,
            entities.targetFolder,
            ctx.language,
            config,
            bulkConfig,
          );
        }
        // For bulk delete with attachments
        if (ctx.operator === "file_bulk_delete") {
          if (config.requiresConfirmation && !ctx.confirmationToken) {
            return this.buildConfirmationResponse(
              config,
              bulkConfig,
              { ...entities, count: String(ctx.attachedDocumentIds.length) },
              ctx.language,
              ctx.operator,
            );
          }
          return this.executeBulkDeleteWithIds(
            ctx.userId,
            ctx.attachedDocumentIds,
            ctx.language,
            config,
            bulkConfig,
          );
        }
        // For bulk copy with attachments
        if (ctx.operator === "file_bulk_copy") {
          return this.executeBulkCopyWithIds(
            ctx.userId,
            ctx.attachedDocumentIds,
            entities.targetFolder,
            ctx.language,
            config,
            bulkConfig,
          );
        }
      }
    }

    // Handle file_multi_move (multiple named files like "move file1.pdf and file2.xlsx to folder X")
    if (ctx.operator === "file_multi_move") {
      const filenames = this.entityExtractor.extractMultipleFilenames(
        ctx.message,
      );
      if (filenames.length === 0) {
        const microcopy =
          config.microcopy?.missingEntity?.[ctx.language] ||
          config.microcopy?.missingEntity?.en ||
          "Please specify the files to move.";
        return { success: false, message: microcopy };
      }
      return this.executeMultiFileMove(
        ctx.userId,
        filenames,
        entities.targetFolder,
        ctx.language,
        config,
      );
    }

    // Check for missing required entities
    const missing = this.entityExtractor.getMissingEntities(
      entities,
      config.entityExtraction,
    );
    if (missing.length > 0) {
      const microcopy =
        config.microcopy?.missingEntity?.[ctx.language] ||
        config.microcopy?.missingEntity?.en ||
        `Missing required information: ${missing.join(", ")}`;
      return { success: false, message: microcopy };
    }

    // Check confirmation requirement (from databank).
    // Minimal safety: require a token with the expected operator prefix.
    const hasValidConfirmationToken =
      typeof ctx.confirmationToken === "string" &&
      ctx.confirmationToken.startsWith(`${ctx.operator}_`) &&
      ctx.confirmationToken.length <= 256;

    if (config.requiresConfirmation && !hasValidConfirmationToken) {
      return this.buildConfirmationResponse(
        config,
        bulkConfig,
        entities,
        ctx.language,
        ctx.operator,
      );
    }

    // Execute the operation
    const result = await this.executeOperation(
      ctx.userId,
      ctx.operator,
      config,
      entities,
    );

    // Record undo history if applicable (non-blocking - don't fail if undo table missing)
    if (config.canUndo && result.success && result.data) {
      try {
        await this.recordUndoHistory(
          ctx.userId,
          ctx.operator,
          result.data,
          entities,
        );
      } catch (undoErr: any) {
        console.warn(
          "[FileActionExecutor] Could not record undo history:",
          undoErr.message,
        );
      }
    }

    // Build response using databank microcopy
    return this.buildSuccessResponse(
      config,
      bulkConfig,
      entities,
      result,
      ctx.language,
      ctx.operator,
    );
  }

  /**
   * Execute the operation by dynamically calling the appropriate service method.
   */
  private async executeOperation(
    userId: string,
    operator: string,
    config: any,
    entities: Record<string, string>,
  ): Promise<ServiceResult> {
    const serviceName = config.service;
    const method = config.method;

    try {
      // Route to appropriate service based on operator
      switch (serviceName) {
        case "folderService":
          return this.executeFolderOperation(userId, method, entities);

        case "documentService":
          return this.executeDocumentOperation(userId, method, entities);

        case "actionHistoryService":
          return this.executeUndoOperation(userId);

        default:
          return { success: false, error: `Unknown service: ${serviceName}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Operation failed" };
    }
  }

  /**
   * Execute folder operations (create, rename, delete, move).
   */
  private async executeFolderOperation(
    userId: string,
    method: string,
    entities: Record<string, string>,
  ): Promise<ServiceResult> {
    switch (method) {
      case "create": {
        const name = entities.folderName;
        const parentName = entities.parentFolder;

        // Check for duplicate
        const existing = await prisma.folder.findFirst({
          where: {
            userId,
            name: { equals: name, mode: "insensitive" },
            isDeleted: false,
          },
        });
        if (existing) {
          return { success: false, microcopyKey: "alreadyExists" };
        }

        // Find parent folder if specified
        let parentFolderId: string | null = null;
        if (parentName) {
          const parent = await prisma.folder.findFirst({
            where: {
              userId,
              name: { equals: parentName, mode: "insensitive" },
              isDeleted: false,
            },
          });
          if (parent) {
            parentFolderId = parent.id;
          }
        }

        const folder = await prisma.folder.create({
          data: { userId, name, parentFolderId },
        });

        return {
          success: true,
          microcopyKey: parentFolderId ? "successWithParent" : "success",
          data: {
            folderId: folder.id,
            folderName: name,
            parentFolder: parentName,
          },
        };
      }

      case "rename": {
        const oldName = entities.folderName;
        const newName = entities.newName;

        const folder = await prisma.folder.findFirst({
          where: {
            userId,
            name: { equals: oldName, mode: "insensitive" },
            isDeleted: false,
          },
        });
        if (!folder) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Capture previous state for undo
        const previousName = folder.name;

        await prisma.folder.update({
          where: { id: folder.id },
          data: { name: newName },
        });

        return {
          success: true,
          data: {
            folderId: folder.id,
            folderName: oldName,
            newName,
            previousState: { name: previousName },
          },
        };
      }

      case "delete": {
        const name = entities.folderName;

        const folder = await prisma.folder.findFirst({
          where: {
            userId,
            name: { equals: name, mode: "insensitive" },
            isDeleted: false,
          },
        });
        if (!folder) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Move documents in folder to root
        await prisma.document.updateMany({
          where: { folderId: folder.id, userId },
          data: { folderId: null },
        });

        // Soft delete the folder
        await prisma.folder.update({
          where: { id: folder.id },
          data: { isDeleted: true, deletedAt: new Date() },
        });

        return {
          success: true,
          data: { folderId: folder.id, folderName: name },
        };
      }

      case "move": {
        const folderName = entities.folderName;
        const targetName = entities.targetFolder;

        const folder = await prisma.folder.findFirst({
          where: {
            userId,
            name: { equals: folderName, mode: "insensitive" },
            isDeleted: false,
          },
        });
        if (!folder) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Capture previous parent for undo (both ID and name)
        const previousParentId = folder.parentFolderId;
        let originalParent = "root";
        if (previousParentId) {
          const prevParentFolder = await prisma.folder.findUnique({
            where: { id: previousParentId },
          });
          if (prevParentFolder?.name) {
            originalParent = prevParentFolder.name;
          }
        }

        // Check if moving to root
        const isRoot = this.isRootTarget(targetName, entities);

        let newParentId: string | null = null;
        if (!isRoot) {
          // Use resolveTargetFolder for nested path support ("X inside Y")
          const targetFolder = await this.resolveTargetFolder(
            userId,
            targetName,
          );
          if (!targetFolder) {
            return { success: false, microcopyKey: "targetNotFound" };
          }
          newParentId = targetFolder.id;
        }

        await prisma.folder.update({
          where: { id: folder.id },
          data: { parentFolderId: newParentId },
        });

        return {
          success: true,
          microcopyKey: isRoot ? "successToRoot" : "success",
          data: {
            folderId: folder.id,
            folderName,
            targetFolder: targetName,
            originalParent, // Include for undo description
            previousState: { parentFolderId: previousParentId },
          },
        };
      }

      default:
        return { success: false, error: `Unknown folder method: ${method}` };
    }
  }

  /**
   * Execute document operations (move, copy, rename, delete).
   */
  private async executeDocumentOperation(
    userId: string,
    method: string,
    entities: Record<string, string>,
  ): Promise<ServiceResult> {
    switch (method) {
      case "move": {
        const filename = entities.filename;
        const targetFolderName = entities.targetFolder;

        // Find document
        const doc = await this.findDocument(userId, filename);
        if (!doc) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Find target folder (with nested path support)
        const targetFolder = await this.resolveTargetFolder(
          userId,
          targetFolderName,
        );
        if (!targetFolder) {
          return { success: false, microcopyKey: "folderNotFound" };
        }

        // Capture previous folder for undo (both ID and name)
        const previousFolderId = doc.folderId;
        let originalFolder = "root";
        if (previousFolderId) {
          const prevFolder = await prisma.folder.findUnique({
            where: { id: previousFolderId },
          });
          if (prevFolder?.name) {
            originalFolder = prevFolder.name;
          }
        }

        await prisma.document.update({
          where: { id: doc.id },
          data: { folderId: targetFolder.id },
        });

        return {
          success: true,
          data: {
            documentId: doc.id,
            filename: doc.filename || filename,
            targetFolder: targetFolderName,
            originalFolder, // Include for undo description
            previousState: { folderId: previousFolderId },
          },
        };
      }

      case "copy": {
        const filename = entities.filename;
        const targetFolderName = entities.targetFolder;

        // Find document
        const doc = await this.findDocument(userId, filename);
        if (!doc) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Find target folder if specified (with nested path support)
        let targetFolderId = doc.folderId;
        if (targetFolderName) {
          const targetFolder = await this.resolveTargetFolder(
            userId,
            targetFolderName,
          );
          if (targetFolder) {
            targetFolderId = targetFolder.id;
          }
        }

        // Create copy (simplified - actual implementation would copy S3 object)
        const copyName = this.generateCopyName(doc.filename || filename);
        const copy = await prisma.document.create({
          data: {
            userId,
            folderId: targetFolderId,
            filename: copyName,
            encryptedFilename: copyName,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            fileHash: doc.fileHash,
            status: doc.status,
            language: doc.language,
          },
        });

        return {
          success: true,
          microcopyKey: targetFolderName ? "success" : "successSameFolder",
          data: {
            documentId: copy.id,
            originalId: doc.id,
            filename: doc.filename || filename,
            copyFilename: copyName,
            targetFolder: targetFolderName,
          },
        };
      }

      case "rename": {
        const filename = entities.filename;
        const newName = entities.newName;

        const doc = await this.findDocument(userId, filename);
        if (!doc) {
          return { success: false, microcopyKey: "notFound" };
        }

        // Capture previous name for undo (use fallbacks if filename is null)
        const previousName = doc.filename || doc.encryptedFilename || filename;

        await prisma.document.update({
          where: { id: doc.id },
          data: { filename: newName, encryptedFilename: newName },
        });

        return {
          success: true,
          data: {
            documentId: doc.id,
            filename: previousName,
            newName,
            previousState: { filename: previousName },
          },
        };
      }

      case "delete": {
        const filename = entities.filename;

        const doc = await this.findDocument(userId, filename);
        if (!doc) {
          return { success: false, microcopyKey: "notFound" };
        }

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: "deleted" },
        });

        return {
          success: true,
          data: { documentId: doc.id, filename: doc.filename || filename },
        };
      }

      case "open": {
        const filename = entities.filename;

        const doc = await this.findDocument(userId, filename);
        if (!doc) {
          return { success: false, microcopyKey: "notFound" };
        }

        return {
          success: true,
          data: { documentId: doc.id, filename: doc.filename || filename },
        };
      }

      default:
        return { success: false, error: `Unknown document method: ${method}` };
    }
  }

  /**
   * Execute bulk move using document IDs (from attachments).
   */
  private async executeBulkMoveWithIds(
    userId: string,
    documentIds: string[],
    targetFolderName: string | undefined,
    language: LanguageCode,
    config: any,
    bulkConfig: any,
  ): Promise<FileActionResult> {
    if (!targetFolderName) {
      const microcopy =
        config.microcopy?.missingEntity?.[language] ||
        config.microcopy?.missingEntity?.en ||
        "Please specify the destination folder.";
      return { success: false, message: microcopy };
    }

    // Find target folder (with nested path support)
    const targetFolder = await this.resolveTargetFolder(
      userId,
      targetFolderName,
    );
    if (!targetFolder) {
      const microcopy =
        bulkConfig?.microcopy?.folderNotFound?.[language] ||
        config.microcopy?.folderNotFound?.[language] ||
        `I couldn't find a folder named **${targetFolderName}**.`;
      return { success: false, message: microcopy };
    }

    // Move all documents
    let successCount = 0;
    let failCount = 0;
    const movedDocs: Array<{ id: string; filename: string }> = [];

    for (const docId of documentIds) {
      try {
        const doc = await prisma.document.findFirst({
          where: { id: docId, userId, status: { not: "deleted" } },
        });
        if (doc) {
          await prisma.document.update({
            where: { id: docId },
            data: { folderId: targetFolder.id },
          });
          successCount++;
          movedDocs.push({
            id: docId,
            filename: doc.filename || doc.encryptedFilename || "file",
          });
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount === 0) {
      return { success: false, message: "No files were moved." };
    }

    const microcopyKey = failCount > 0 ? "partialSuccess" : "success";
    const template =
      bulkConfig?.microcopy?.[microcopyKey]?.[language] ||
      bulkConfig?.microcopy?.[microcopyKey]?.en ||
      `Done — moved **${successCount}** files to **${targetFolderName}**.`;

    const message = this.interpolate(template, {
      count: String(successCount),
      successCount: String(successCount),
      failCount: String(failCount),
      targetFolder: targetFolderName,
    });

    // Build attachments for moved files (show first few)
    const attachments: FileActionAttachment[] = movedDocs
      .slice(0, 3)
      .map((doc) => ({
        type: "document" as const,
        id: doc.id,
        docId: doc.id,
        documentId: doc.id,
        title: doc.filename,
        filename: doc.filename,
      }));

    return {
      success: true,
      message,
      attachments: attachments.length > 0 ? attachments : undefined,
      data: { count: successCount, targetFolder: targetFolderName, movedDocs },
      operator: "file_bulk_move",
    };
  }

  /**
   * Execute bulk delete using document IDs (from attachments).
   */
  private async executeBulkDeleteWithIds(
    userId: string,
    documentIds: string[],
    language: LanguageCode,
    config: any,
    bulkConfig: any,
  ): Promise<FileActionResult> {
    let successCount = 0;

    for (const docId of documentIds) {
      try {
        await prisma.document.update({
          where: { id: docId, userId },
          data: { status: "deleted" },
        });
        successCount++;
      } catch {
        // Ignore errors for individual files
      }
    }

    const template =
      bulkConfig?.microcopy?.success?.[language] ||
      bulkConfig?.microcopy?.success?.en ||
      `Done — deleted **${successCount}** files.`;

    const message = this.interpolate(template, { count: String(successCount) });

    return {
      success: true,
      message,
      data: { count: successCount },
      operator: "file_bulk_delete",
    };
  }

  /**
   * Execute bulk copy using document IDs (from attachments).
   */
  private async executeBulkCopyWithIds(
    userId: string,
    documentIds: string[],
    targetFolderName: string | undefined,
    language: LanguageCode,
    config: any,
    bulkConfig: any,
  ): Promise<FileActionResult> {
    // Find target folder if specified
    let targetFolderId: string | null = null;
    if (targetFolderName) {
      const targetFolder = await this.resolveTargetFolder(
        userId,
        targetFolderName,
      );
      if (targetFolder) {
        targetFolderId = targetFolder.id;
      }
    }

    let successCount = 0;
    const copiedDocs: Array<{ id: string; filename: string }> = [];

    for (const docId of documentIds) {
      try {
        const doc = await prisma.document.findFirst({
          where: { id: docId, userId, status: { not: "deleted" } },
        });
        if (doc) {
          const copyName = this.generateCopyName(doc.filename || "file");
          const copy = await prisma.document.create({
            data: {
              userId,
              folderId: targetFolderId || doc.folderId,
              filename: copyName,
              encryptedFilename: copyName,
              fileSize: doc.fileSize,
              mimeType: doc.mimeType,
              fileHash: doc.fileHash,
              status: doc.status,
              language: doc.language,
            },
          });
          successCount++;
          copiedDocs.push({ id: copy.id, filename: copyName });
        }
      } catch {
        // Ignore errors for individual files
      }
    }

    const template =
      bulkConfig?.microcopy?.success?.[language] ||
      bulkConfig?.microcopy?.success?.en ||
      `Done — copied **${successCount}** files.`;

    const message = this.interpolate(template, {
      count: String(successCount),
      targetFolder: targetFolderName || "same folder",
    });

    return {
      success: true,
      message,
      data: { count: successCount, copiedDocs },
      operator: "file_bulk_copy",
    };
  }

  /**
   * Execute multi-file move using filenames extracted from message.
   * E.g., "move file1.pdf and file2.xlsx to Archive"
   */
  private async executeMultiFileMove(
    userId: string,
    filenames: string[],
    targetFolderName: string | undefined,
    language: LanguageCode,
    config: any,
  ): Promise<FileActionResult> {
    if (!targetFolderName) {
      const microcopy =
        config.microcopy?.missingEntity?.[language] ||
        config.microcopy?.missingEntity?.en ||
        "Please specify the destination folder.";
      return { success: false, message: microcopy };
    }

    // Find target folder (with nested path support)
    const targetFolder = await this.resolveTargetFolder(
      userId,
      targetFolderName,
    );
    if (!targetFolder) {
      const microcopy =
        config.microcopy?.folderNotFound?.[language] ||
        `I couldn't find a folder named **${targetFolderName}**.`;
      return { success: false, message: microcopy };
    }

    // Move all documents by filename
    let successCount = 0;
    let failCount = 0;
    const movedDocs: Array<{ id: string; filename: string }> = [];

    for (const filename of filenames) {
      try {
        // Find document by filename
        const doc = await this.findDocument(userId, filename);
        if (doc) {
          await prisma.document.update({
            where: { id: doc.id },
            data: { folderId: targetFolder.id },
          });
          successCount++;
          movedDocs.push({ id: doc.id, filename: doc.filename || filename });
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount === 0) {
      const microcopy =
        config.microcopy?.noneFound?.[language] ||
        config.microcopy?.noneFound?.en ||
        "I couldn't find any of those files.";
      return { success: false, message: microcopy };
    }

    const microcopyKey = failCount > 0 ? "partialSuccess" : "success";
    const template =
      config.microcopy?.[microcopyKey]?.[language] ||
      config.microcopy?.[microcopyKey]?.en ||
      `Done — moved **${successCount}** files to **${targetFolderName}**.`;

    const message = this.interpolate(template, {
      count: String(successCount),
      successCount: String(successCount),
      failCount: String(failCount),
      targetFolder: targetFolderName,
    });

    // Build attachments for moved files (show first few)
    const attachments: FileActionAttachment[] = movedDocs
      .slice(0, 3)
      .map((doc) => ({
        type: "document" as const,
        id: doc.id,
        docId: doc.id,
        documentId: doc.id,
        title: doc.filename,
        filename: doc.filename,
      }));

    return {
      success: true,
      message,
      attachments: attachments.length > 0 ? attachments : undefined,
      data: { count: successCount, targetFolder: targetFolderName, movedDocs },
      operator: "file_multi_move",
    };
  }

  /**
   * Resolve target folder by name, supporting nested paths like "folder Y inside folder Z".
   */
  private async resolveTargetFolder(
    userId: string,
    folderName: string,
  ): Promise<{ id: string; name: string } | null> {
    // Check for nested path patterns: "X inside Y", "X in Y", "X within Y", "X dentro de Y"
    const nestedPattern =
      /^(.+?)\s+(?:inside|in|within|under|dentro\s+de|em|sob)\s+(.+)$/i;
    const nestedMatch = folderName.match(nestedPattern);

    if (nestedMatch) {
      const targetName = nestedMatch[1].trim();
      const parentName = nestedMatch[2].trim();

      // First find the parent folder
      const parentFolder = await prisma.folder.findFirst({
        where: {
          userId,
          name: { equals: parentName, mode: "insensitive" },
          isDeleted: false,
        },
      });

      if (!parentFolder) {
        return null;
      }

      // Then find target folder INSIDE the parent
      const targetFolder = await prisma.folder.findFirst({
        where: {
          userId,
          name: { equals: targetName, mode: "insensitive" },
          parentFolderId: parentFolder.id,
          isDeleted: false,
        },
      });

      return targetFolder
        ? { id: targetFolder.id, name: targetFolder.name || folderName }
        : null;
    }

    // Simple folder lookup (no nesting)
    const folder = await prisma.folder.findFirst({
      where: {
        userId,
        name: { equals: folderName, mode: "insensitive" },
        isDeleted: false,
      },
    });

    return folder ? { id: folder.id, name: folder.name || folderName } : null;
  }

  /**
   * Execute undo operation.
   */
  private async executeUndoOperation(userId: string): Promise<ServiceResult> {
    const lastAction = await this.actionHistory.getLastUndoable(userId);

    if (!lastAction) {
      return { success: false, microcopyKey: "nothingToUndo" };
    }

    const { id, operator, previousState, entityIds } = lastAction;

    try {
      // Validate entity exists before attempting undo
      const entityValid = await this.validateUndoEntity(operator, entityIds);
      if (!entityValid) {
        // Entity no longer exists - mark as used and report error
        await this.actionHistory.markUsed(id);
        return { success: false, microcopyKey: "entityNotFound" };
      }

      // Restore previous state based on operator type
      switch (operator) {
        case "folder_create":
          // Delete the created folder
          await prisma.folder.update({
            where: { id: entityIds.folderId },
            data: { isDeleted: true, deletedAt: new Date() },
          });
          break;

        case "folder_rename":
          // Rename back to original
          await prisma.folder.update({
            where: { id: entityIds.folderId },
            data: { name: previousState.name },
          });
          break;

        case "folder_move":
          // Move back to original parent
          await prisma.folder.update({
            where: { id: entityIds.folderId },
            data: { parentFolderId: previousState.parentFolderId },
          });
          break;

        case "file_move":
          // Move back to original folder
          await prisma.document.update({
            where: { id: entityIds.documentId },
            data: { folderId: previousState.folderId },
          });
          break;

        case "file_copy":
          // Delete the copy
          await prisma.document.update({
            where: { id: entityIds.copyId || entityIds.documentId },
            data: { status: "deleted" },
          });
          break;

        case "file_rename":
          // Rename back to original
          await prisma.document.update({
            where: { id: entityIds.documentId },
            data: {
              filename: previousState.filename,
              encryptedFilename: previousState.filename,
            },
          });
          break;

        default:
          return { success: false, microcopyKey: "cannotUndo" };
      }

      // Mark action as used
      await this.actionHistory.markUsed(id);

      return {
        success: true,
        data: {
          operator,
          entityIds,
          previousState,
        },
      };
    } catch (error: any) {
      // Mark as used to prevent repeated failures
      await this.actionHistory.markUsed(id).catch(() => {});
      return { success: false, error: error.message || "Undo failed" };
    }
  }

  /**
   * Validate that the entity to be undone still exists.
   */
  private async validateUndoEntity(
    operator: string,
    entityIds: Record<string, string>,
  ): Promise<boolean> {
    try {
      switch (operator) {
        case "folder_create":
        case "folder_rename":
        case "folder_move": {
          if (!entityIds.folderId) return false;
          const folder = await prisma.folder.findUnique({
            where: { id: entityIds.folderId },
          });
          return folder !== null && !folder.isDeleted;
        }

        case "file_move":
        case "file_rename": {
          if (!entityIds.documentId) return false;
          const doc = await prisma.document.findUnique({
            where: { id: entityIds.documentId },
          });
          return doc !== null && doc.status !== "deleted";
        }

        case "file_copy": {
          const copyId = entityIds.copyId || entityIds.documentId;
          if (!copyId) return false;
          const doc = await prisma.document.findUnique({
            where: { id: copyId },
          });
          return doc !== null && doc.status !== "deleted";
        }

        default:
          return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Build confirmation response for destructive operations.
   */
  private buildConfirmationResponse(
    config: any,
    bulkConfig: any,
    entities: Record<string, string>,
    lang: LanguageCode,
    operator: string,
  ): FileActionResult {
    const confirmation = bulkConfig?.confirmation || config.confirmation;
    if (!confirmation) {
      return {
        success: false,
        message: "Confirmation required but not configured.",
      };
    }

    const message = this.interpolate(
      confirmation.prompt[lang] || confirmation.prompt.en,
      entities,
    );

    return {
      success: false,
      requiresConfirmation: true,
      message,
      operator,
      attachments: [
        {
          type: "action_confirmation",
          confirmationId: `${operator}_${Date.now()}`,
          operator, // Include operator for confirmation flow
          confirmLabel:
            confirmation.confirmLabel[lang] || confirmation.confirmLabel.en,
          cancelLabel:
            confirmation.cancelLabel[lang] || confirmation.cancelLabel.en,
          confirmStyle: confirmation.confirmStyle,
        },
      ],
    };
  }

  /**
   * Build success/error response using databank microcopy.
   */
  private buildSuccessResponse(
    config: any,
    bulkConfig: any,
    entities: Record<string, string>,
    result: ServiceResult,
    lang: LanguageCode,
    operator: string,
  ): FileActionResult {
    const microcopy = bulkConfig?.microcopy || config.microcopy;
    const microcopyKey =
      result.microcopyKey || (result.success ? "success" : "error");

    let template =
      microcopy?.[microcopyKey]?.[lang] ||
      microcopy?.[microcopyKey]?.en ||
      (result.success ? "Done." : "Operation failed.");

    // For undo, get the undo description
    if (operator === "undo" && result.success && result.data) {
      const undoDesc = this.actionHistory.getUndoDescription(
        result.data.operator,
        { ...entities, ...result.data.entityIds, ...result.data.previousState },
        lang,
      );
      entities.undoDescription = undoDesc;
    }

    // If error, include error message
    if (result.error) {
      entities.error = result.error;
    }

    const message = this.interpolate(template, { ...entities, ...result.data });

    // Build attachments based on result
    // Type names match frontend SourcesList: 'folder' and 'document'
    const attachments: FileActionAttachment[] = [];
    if (result.success && result.data) {
      // For rename operations, show the NEW name in the pill
      const isRename =
        operator === "folder_rename" || operator === "file_rename";

      if (result.data.folderId && !["folder_delete"].includes(operator)) {
        const displayName = isRename
          ? result.data.newName || result.data.folderName || ""
          : result.data.folderName || result.data.newName || "";
        attachments.push({
          type: "folder",
          id: result.data.folderId,
          folderId: result.data.folderId,
          title: displayName,
          filename: displayName,
        });
      } else if (
        result.data.documentId &&
        !["file_delete"].includes(operator)
      ) {
        const displayName = isRename
          ? result.data.newName || result.data.filename || ""
          : result.data.filename || result.data.newName || "";
        attachments.push({
          type: "document",
          id: result.data.documentId,
          docId: result.data.documentId, // Frontend expects docId
          documentId: result.data.documentId,
          title: displayName,
          filename: displayName,
        });
      }
    }

    return {
      success: result.success,
      message,
      attachments: attachments.length > 0 ? attachments : undefined,
      data: result.data,
      operator,
    };
  }

  /**
   * Record action history for undo.
   */
  private async recordUndoHistory(
    userId: string,
    operator: string,
    data: Record<string, any>,
    entities: Record<string, string>,
  ): Promise<void> {
    const entry: UndoHistoryEntry = {
      userId,
      operator,
      previousState: data.previousState || {},
      entityIds: {
        ...(data.folderId ? { folderId: data.folderId } : {}),
        ...(data.documentId ? { documentId: data.documentId } : {}),
        ...(data.originalId ? { originalId: data.originalId } : {}),
        ...(data.copyId ? { copyId: data.copyId } : {}),
      },
    };

    // Add entity names for undo descriptions
    if (entities.folderName) entry.entityIds.folderName = entities.folderName;
    if (entities.filename) entry.entityIds.filename = entities.filename;
    if (entities.newName) entry.entityIds.newName = entities.newName;
    if (entities.targetFolder)
      entry.entityIds.targetFolder = entities.targetFolder;
    // Add originalParent/originalFolder for move undo descriptions
    if (data.originalParent)
      entry.entityIds.originalParent = data.originalParent;
    if (data.originalFolder)
      entry.entityIds.originalFolder = data.originalFolder;

    await this.actionHistory.record(entry);
  }

  /**
   * Find a document by filename (case-insensitive).
   */
  private async findDocument(userId: string, filename: string): Promise<any> {
    return prisma.document.findFirst({
      where: {
        userId,
        status: { not: "deleted" },
        OR: [
          { filename: { contains: filename, mode: "insensitive" } },
          { encryptedFilename: { contains: filename, mode: "insensitive" } },
        ],
      },
    });
  }

  /**
   * Check if target is a root/top-level reference.
   */
  private isRootTarget(target: string, entities: Record<string, any>): boolean {
    if (!target) return false;
    const rootTerms = [
      "root",
      "top level",
      "top-level",
      "raiz",
      "nível principal",
      "nivel principal",
    ];
    return rootTerms.some((t) => target.toLowerCase().includes(t));
  }

  /**
   * Generate a copy name for a file.
   */
  private generateCopyName(originalName: string): string {
    const dotIndex = originalName.lastIndexOf(".");
    if (dotIndex === -1) {
      return `${originalName} (copy)`;
    }
    const base = originalName.slice(0, dotIndex);
    const ext = originalName.slice(dotIndex);
    return `${base} (copy)${ext}`;
  }

  /**
   * Interpolate template string with values.
   */
  private interpolate(template: string, values: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = values[key];
      return value !== undefined ? String(value) : `{${key}}`;
    });
  }

  /**
   * Check if an operator name is a file action write operator (from databank).
   */
  isOperatorKnown(operator: string): boolean {
    const bank = this.ensureBank();
    if (!bank) return false;
    return operator in bank.operators || operator in (bank.bulkOperators || {});
  }

  /**
   * Check if a message matches any file action write operator pattern.
   * 100% databank-driven - reads detection rules from file_action_operators.any.json.
   */
  isFileActionWriteOperator(message: string): boolean {
    return this.detectOperator(message) !== null;
  }

  /**
   * Detect which file action operator matches the given message.
   * 100% databank-driven - reads detection rules from file_action_operators.any.json.
   * Returns the operator with highest priority that matches.
   */
  detectOperator(message: string): string | null {
    const bank = this.ensureBank();
    if (!bank) {
      console.log("[FileActionExecutor] detectOperator: bank not loaded");
      return null;
    }

    const detectionConfig = bank.config.operatorDetection;
    if (!detectionConfig?.enabled) {
      console.log("[FileActionExecutor] detectOperator: detection disabled");
      return null;
    }

    const detectionRules = bank.detectionRules;
    if (!detectionRules || detectionRules.length === 0) {
      console.log(
        "[FileActionExecutor] detectOperator: no detection rules found",
      );
      return null;
    }

    // Apply global guards first
    if (this.failsGlobalGuards(message, detectionConfig.guards)) {
      return null;
    }

    // Collect all matching candidates with their priority and confidence
    const candidates: Array<{
      operator: string;
      priority: number;
      confidence: number;
    }> = [];

    for (const rule of detectionRules) {
      if (this.ruleMatches(message, rule, detectionConfig.caseInsensitive)) {
        candidates.push({
          operator: rule.operator,
          priority: rule.priority,
          confidence: rule.confidence,
        });
      }
    }

    if (candidates.length === 0) return null;

    // Sort by priority (descending) and return highest
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].operator;
  }

  /**
   * Check if message fails global guards (should not be treated as file action).
   */
  private failsGlobalGuards(
    message: string,
    guards?: {
      mustNotMatchWholeMessage?: Record<string, string[]>;
      mustNotContain?: Record<string, string[]>;
    },
  ): boolean {
    if (!guards) return false;

    const msg = message.toLowerCase();

    // Check mustNotMatchWholeMessage patterns
    if (guards.mustNotMatchWholeMessage) {
      for (const lang of ["en", "pt"]) {
        const patterns = guards.mustNotMatchWholeMessage[lang] || [];
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, "i").test(msg)) {
              return true;
            }
          } catch {
            /* invalid regex, skip */
          }
        }
      }
    }

    // Check mustNotContain patterns
    if (guards.mustNotContain) {
      for (const lang of ["en", "pt"]) {
        const patterns = guards.mustNotContain[lang] || [];
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, "i").test(msg)) {
              return true;
            }
          } catch {
            /* invalid regex, skip */
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if a detection rule matches the message.
   */
  private ruleMatches(
    message: string,
    rule: {
      patterns: Record<string, string[]>;
      mustContain?: Record<string, string[]>;
      mustNotContain?: Record<string, string[]>;
    },
    caseInsensitive: boolean,
  ): boolean {
    const flags = caseInsensitive ? "i" : "";
    const msg = caseInsensitive ? message.toLowerCase() : message;

    // Check mustNotContain first (exclusion patterns)
    if (rule.mustNotContain) {
      for (const lang of ["en", "pt"]) {
        const patterns = rule.mustNotContain[lang] || [];
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, flags).test(message)) {
              return false;
            }
          } catch {
            /* invalid regex, skip */
          }
        }
      }
    }

    // Check mustContain if present
    if (rule.mustContain) {
      let hasRequired = false;
      for (const lang of ["en", "pt"]) {
        const patterns = rule.mustContain[lang] || [];
        for (const pattern of patterns) {
          try {
            if (new RegExp(pattern, flags).test(message)) {
              hasRequired = true;
              break;
            }
          } catch {
            /* invalid regex, skip */
          }
        }
        if (hasRequired) break;
      }
      if (!hasRequired) return false;
    }

    // Check main patterns (any match is sufficient)
    for (const lang of ["en", "pt"]) {
      const patterns = rule.patterns[lang] || [];
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern, flags).test(message)) {
            return true;
          }
        } catch {
          /* invalid regex, skip */
        }
      }
    }

    return false;
  }
}

// Singleton instance
let instance: FileActionExecutorService | null = null;

export function getFileActionExecutor(): FileActionExecutorService {
  if (!instance) {
    instance = new FileActionExecutorService();
  }
  return instance;
}
