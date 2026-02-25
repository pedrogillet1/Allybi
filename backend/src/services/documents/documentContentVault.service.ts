import prisma from "../../config/database";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";
import { DocumentKeyService } from "./documentKey.service";
import { DocumentCryptoService } from "./documentCrypto.service";

interface DocumentContentFields {
  rawText?: string | null;
  previewText?: string | null;
  renderableContent?: string | null;
}

type PreviewSelectable = {
  rawText?: string | null;
  previewText?: string | null;
  renderableContent?: string | null;
  extractedTextEncrypted?: string | null;
  previewTextEncrypted?: string | null;
  renderableContentEncrypted?: string | null;
};

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export class DocumentContentVaultService {
  private readonly encryptionEnabled: boolean;
  private readonly requireEncryption: boolean;
  private readonly allowPlaintextRead: boolean;
  private readonly docKeys: DocumentKeyService | null;
  private readonly crypto: DocumentCryptoService | null;

  constructor() {
    const nodeEnv = String(process.env.NODE_ENV || "")
      .trim()
      .toLowerCase();
    const isProdLike = nodeEnv === "production" || nodeEnv === "staging";
    this.encryptionEnabled = Boolean(
      String(process.env.KODA_MASTER_KEY_BASE64 || "").trim(),
    );
    this.requireEncryption = toBool(
      process.env.SECURITY_REQUIRE_DOC_ENCRYPTION,
      isProdLike,
    );
    this.allowPlaintextRead = toBool(
      process.env.SECURITY_ALLOW_PLAINTEXT_READ,
      !isProdLike,
    );

    if (!this.encryptionEnabled) {
      this.docKeys = null;
      this.crypto = null;
      return;
    }

    const encryption = new EncryptionService();
    const envelope = new EnvelopeService(encryption);
    const tenantKeys = new TenantKeyService(prisma, encryption);
    this.docKeys = new DocumentKeyService(
      prisma,
      encryption,
      tenantKeys,
      envelope,
    );
    this.crypto = new DocumentCryptoService(encryption);
  }

  isEnabled(): boolean {
    return this.encryptionEnabled;
  }

  isStrict(): boolean {
    return this.requireEncryption;
  }

  private assertReady(): void {
    if (this.encryptionEnabled && this.docKeys && this.crypto) return;
    if (this.requireEncryption) {
      throw new Error(
        "SECURITY_REQUIRE_DOC_ENCRYPTION is enabled but document encryption runtime is not configured.",
      );
    }
  }

  async encryptDocumentFields(
    userId: string,
    documentId: string,
    fields: DocumentContentFields,
  ): Promise<void> {
    this.assertReady();
    if (!this.encryptionEnabled || !this.docKeys || !this.crypto) return;

    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const data: Record<string, unknown> = {};

    if (typeof fields.rawText === "string") {
      data.rawText = null;
      data.extractedTextEncrypted = this.crypto.encryptExtractedText(
        userId,
        documentId,
        fields.rawText,
        dk,
      );
    }

    if (typeof fields.previewText === "string") {
      data.previewText = null;
      data.previewTextEncrypted = this.crypto.encryptPreviewText(
        userId,
        documentId,
        fields.previewText,
        dk,
      );
    }

    if (typeof fields.renderableContent === "string") {
      data.renderableContent = null;
      data.renderableContentEncrypted = this.crypto.encryptRenderableContent(
        userId,
        documentId,
        fields.renderableContent,
        dk,
      );
    }

    if (!Object.keys(data).length) return;

    await prisma.document.updateMany({
      where: { id: documentId, userId },
      data,
    });
  }

  async resolvePreviewText(
    userId: string,
    documentId: string,
    doc: PreviewSelectable | null,
  ): Promise<string | null> {
    if (!doc) return null;
    if (this.encryptionEnabled && this.docKeys && this.crypto) {
      const dk = await this.docKeys.getDocumentKey(userId, documentId);

      if (doc.renderableContentEncrypted) {
        return this.crypto.decryptRenderableContent(
          userId,
          documentId,
          doc.renderableContentEncrypted,
          dk,
        );
      }
      if (doc.previewTextEncrypted) {
        return this.crypto.decryptPreviewText(
          userId,
          documentId,
          doc.previewTextEncrypted,
          dk,
        );
      }
      if (doc.extractedTextEncrypted) {
        return this.crypto.decryptExtractedText(
          userId,
          documentId,
          doc.extractedTextEncrypted,
          dk,
        );
      }
    }

    const plaintext =
      doc.renderableContent || doc.previewText || doc.rawText || null;
    if (plaintext && !this.allowPlaintextRead && this.requireEncryption) {
      throw new Error(
        "Plaintext document content is blocked by SECURITY_ALLOW_PLAINTEXT_READ=false.",
      );
    }

    return plaintext;
  }
}

export const documentContentVault = new DocumentContentVaultService();
