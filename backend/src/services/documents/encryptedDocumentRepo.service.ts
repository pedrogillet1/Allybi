import type { PrismaClient } from "@prisma/client";
import { DocumentKeyService } from "./documentKey.service";
import { DocumentCryptoService } from "./documentCrypto.service";

/**
 * Writes encrypted extracted text + encrypted chunks.
 * All encryption uses AAD bound to userId for cross-user attack mitigation.
 */
export class EncryptedDocumentRepo {
  constructor(
    private prisma: PrismaClient,
    private docKeys: DocumentKeyService,
    private docCrypto: DocumentCryptoService,
  ) {}

  async setEncryptedFilename(
    userId: string,
    documentId: string,
    filenamePlain: string,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const enc = this.docCrypto.encryptFilename(
      userId,
      documentId,
      filenamePlain,
      dk,
    );

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        filename: null,
        filenameEncrypted: enc,
      },
    });
  }

  async getDecryptedFilename(
    userId: string,
    documentId: string,
  ): Promise<string | null> {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { filename: true, filenameEncrypted: true },
    });
    if (!doc) return null;

    if (doc.filenameEncrypted) {
      return this.docCrypto.decryptFilename(
        userId,
        documentId,
        doc.filenameEncrypted,
        dk,
      );
    }
    return doc.filename ?? null;
  }

  async storeEncryptedExtractedText(
    userId: string,
    documentId: string,
    textPlain: string,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const enc = this.docCrypto.encryptExtractedText(
      userId,
      documentId,
      textPlain,
      dk,
    );

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        rawText: null,
        extractedTextEncrypted: enc,
      },
    });
  }

  async getDecryptedExtractedText(
    userId: string,
    documentId: string,
  ): Promise<string | null> {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { rawText: true, extractedTextEncrypted: true },
    });
    if (!doc) return null;

    if (doc.extractedTextEncrypted) {
      return this.docCrypto.decryptExtractedText(
        userId,
        documentId,
        doc.extractedTextEncrypted,
        dk,
      );
    }
    return doc.rawText ?? null;
  }

  async storeEncryptedPreviewText(
    userId: string,
    documentId: string,
    textPlain: string,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const enc = this.docCrypto.encryptPreviewText(
      userId,
      documentId,
      textPlain,
      dk,
    );

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        previewText: null,
        previewTextEncrypted: enc,
      },
    });
  }

  async storeEncryptedRenderableContent(
    userId: string,
    documentId: string,
    contentPlain: string,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const enc = this.docCrypto.encryptRenderableContent(
      userId,
      documentId,
      contentPlain,
      dk,
    );

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        renderableContent: null,
        renderableContentEncrypted: enc,
      },
    });
  }

  async getDecryptedRenderableContent(
    userId: string,
    documentId: string,
  ): Promise<string | null> {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { renderableContent: true, renderableContentEncrypted: true },
    });
    if (!doc) return null;

    if (doc.renderableContentEncrypted) {
      return this.docCrypto.decryptRenderableContent(
        userId,
        documentId,
        doc.renderableContentEncrypted,
        dk,
      );
    }

    return doc.renderableContent ?? null;
  }

  async storeEncryptedDisplayTitle(
    userId: string,
    documentId: string,
    titlePlain: string,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const enc = this.docCrypto.encryptDisplayTitle(
      userId,
      documentId,
      titlePlain,
      dk,
    );

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        displayTitle: null,
        displayTitleEncrypted: enc,
      },
    });
  }

  async upsertEncryptedChunks(
    userId: string,
    documentId: string,
    chunks: Array<{
      chunkIndex: number;
      text: string;
      page?: number | null;
      startChar?: number | null;
      endChar?: number | null;
      embedding?: Uint8Array | null;
    }>,
  ) {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    for (const c of chunks) {
      const row = await this.prisma.documentChunk.create({
        data: {
          documentId,
          chunkIndex: c.chunkIndex,
          text: null,
          textEncrypted: "",
          page: c.page ?? null,
          startChar: c.startChar ?? null,
          endChar: c.endChar ?? null,
          embedding: c.embedding
            ? (new Uint8Array(
                c.embedding.buffer,
                c.embedding.byteOffset,
                c.embedding.byteLength,
              ) as Uint8Array<ArrayBuffer>)
            : null,
        },
        select: { id: true },
      });

      const textEnc = this.docCrypto.encryptChunkText(
        userId,
        documentId,
        row.id,
        c.text,
        dk,
      );

      await this.prisma.documentChunk.update({
        where: { id: row.id },
        data: { text: null, textEncrypted: textEnc },
      });
    }
  }
}
