import * as crypto from "crypto";
import prisma from "../../config/database";
import { downloadFile } from "../../config/storage";
import {
  convertToDocx,
  isCloudConvertAvailable,
} from "../conversion/cloudConvertPptx.service";

export type ExportFormat = "docx" | "xlsx" | "pptx";

export interface ExportContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface ExportRequest {
  userId: string;
  documentId: string;
  format: ExportFormat;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  converted: boolean;
}

export class ExportServiceError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ExportServiceError";
    this.code = code;
  }
}

interface DocumentForExport {
  id: string;
  filename: string | null;
  mimeType: string;
  encryptedFilename: string;
  isEncrypted: boolean;
  encryptionIV: string | null;
  encryptionAuthTag: string | null;
}

const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function normalizeFilename(input: string): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function setExtension(filename: string, extension: string): string {
  const safe = normalizeFilename(filename) || "document";
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  return `${base}.${extension}`;
}

function defaultFilename(format: ExportFormat): string {
  return `document.${format}`;
}

function decryptDocumentBytesIfNeeded(
  fileBuffer: Buffer,
  doc: DocumentForExport,
  userId: string,
): Buffer {
  if (!doc.isEncrypted || !doc.encryptionIV || !doc.encryptionAuthTag) {
    return fileBuffer;
  }

  const key = crypto.scryptSync(`document-${userId}`, "salt", 32);
  const iv = Buffer.from(doc.encryptionIV, "base64");
  const authTag = Buffer.from(doc.encryptionAuthTag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(fileBuffer), decipher.final()]);
}

function isMimeForFormat(mimeType: string, format: ExportFormat): boolean {
  return mimeType === MIME_BY_FORMAT[format];
}

/**
 * Export service for native office formats.
 * - docx: native pass-through or CloudConvert fallback for convertible files
 * - xlsx/pptx: pass-through only (no lossy conversion path in v1)
 */
export class ExportService {
  async exportDocument(
    request: ExportRequest,
    _ctx?: ExportContext,
  ): Promise<ExportResult> {
    const userId = request.userId.trim();
    const documentId = request.documentId.trim();

    if (!userId || !documentId) {
      throw new ExportServiceError(
        "userId and documentId are required.",
        "INVALID_EXPORT_INPUT",
      );
    }

    const doc = await this.getDocumentForExport(userId, documentId);

    const rawFile = await downloadFile(doc.encryptedFilename);
    const clearFile = decryptDocumentBytesIfNeeded(rawFile, doc, userId);

    if (request.format === "docx") {
      return this.exportAsDocx(doc, clearFile);
    }

    if (request.format === "xlsx") {
      return this.exportAsXlsx(doc, clearFile);
    }

    return this.exportAsPptx(doc, clearFile);
  }

  private async exportAsDocx(
    doc: DocumentForExport,
    clearBuffer: Buffer,
  ): Promise<ExportResult> {
    if (isMimeForFormat(doc.mimeType, "docx")) {
      return {
        filename: setExtension(doc.filename || defaultFilename("docx"), "docx"),
        mimeType: MIME_BY_FORMAT.docx,
        buffer: clearBuffer,
        converted: false,
      };
    }

    const cloudConvertible = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.ms-excel",
      "application/msword",
    ]);

    if (!cloudConvertible.has(doc.mimeType)) {
      throw new ExportServiceError(
        `DOCX export is unavailable for MIME type ${doc.mimeType}.`,
        "DOCX_EXPORT_UNSUPPORTED_MIME",
      );
    }

    if (!isCloudConvertAvailable()) {
      throw new ExportServiceError(
        "CloudConvert is not configured for DOCX conversion.",
        "DOCX_CONVERTER_UNAVAILABLE",
      );
    }

    const inputName =
      normalizeFilename(doc.filename || "document") || "document";
    const converted = await convertToDocx(clearBuffer, inputName, doc.mimeType);

    if (!converted.success || !converted.docxBuffer) {
      throw new ExportServiceError(
        converted.error || "DOCX conversion failed.",
        "DOCX_CONVERSION_FAILED",
      );
    }

    return {
      filename: setExtension(inputName, "docx"),
      mimeType: MIME_BY_FORMAT.docx,
      buffer: converted.docxBuffer,
      converted: true,
    };
  }

  private exportAsXlsx(
    doc: DocumentForExport,
    clearBuffer: Buffer,
  ): ExportResult {
    if (!isMimeForFormat(doc.mimeType, "xlsx")) {
      throw new ExportServiceError(
        `XLSX export requires an XLSX source. Current MIME: ${doc.mimeType}`,
        "XLSX_EXPORT_UNSUPPORTED_MIME",
      );
    }

    return {
      filename: setExtension(doc.filename || defaultFilename("xlsx"), "xlsx"),
      mimeType: MIME_BY_FORMAT.xlsx,
      buffer: clearBuffer,
      converted: false,
    };
  }

  private exportAsPptx(
    doc: DocumentForExport,
    clearBuffer: Buffer,
  ): ExportResult {
    if (!isMimeForFormat(doc.mimeType, "pptx")) {
      throw new ExportServiceError(
        `PPTX export requires a PPTX source. Current MIME: ${doc.mimeType}`,
        "PPTX_EXPORT_UNSUPPORTED_MIME",
      );
    }

    return {
      filename: setExtension(doc.filename || defaultFilename("pptx"), "pptx"),
      mimeType: MIME_BY_FORMAT.pptx,
      buffer: clearBuffer,
      converted: false,
    };
  }

  private async getDocumentForExport(
    userId: string,
    documentId: string,
  ): Promise<DocumentForExport> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        encryptedFilename: true,
        isEncrypted: true,
        encryptionIV: true,
        encryptionAuthTag: true,
      },
    });

    if (!doc) {
      throw new ExportServiceError("Document not found.", "DOCUMENT_NOT_FOUND");
    }

    if (!doc.encryptedFilename) {
      throw new ExportServiceError(
        "Document storage key is missing.",
        "DOCUMENT_STORAGE_KEY_MISSING",
      );
    }

    return doc;
  }
}

export default ExportService;
