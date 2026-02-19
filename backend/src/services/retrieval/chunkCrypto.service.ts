import type { PrismaClient } from "@prisma/client";
import { DocumentKeyService } from "../documents/documentKey.service";
import { DocumentCryptoService } from "../documents/documentCrypto.service";

/**
 * Given a chunk row (with textEncrypted), return plaintext text for LLM context.
 * Use this in your retrieval/composition stage.
 */
export class ChunkCryptoService {
  constructor(
    private prisma: PrismaClient,
    private docKeys: DocumentKeyService,
    private docCrypto: DocumentCryptoService,
  ) {}

  async decryptChunkText(
    userId: string,
    documentId: string,
    chunkId: string,
  ): Promise<string> {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    const chunk = await this.prisma.documentChunk.findUnique({
      where: { id: chunkId },
      select: { id: true, textEncrypted: true, documentId: true },
    });

    if (!chunk || chunk.documentId !== documentId)
      throw new Error("Chunk not found");
    if (!chunk.textEncrypted) return "";

    return this.docCrypto.decryptChunkText(
      userId,
      documentId,
      chunk.id,
      chunk.textEncrypted,
      dk,
    );
  }

  async decryptChunksBatch(
    userId: string,
    documentId: string,
    chunkIds: string[],
  ): Promise<Map<string, string>> {
    const dk = await this.docKeys.getDocumentKey(userId, documentId);

    const chunks = await this.prisma.documentChunk.findMany({
      where: { id: { in: chunkIds }, documentId },
      select: { id: true, textEncrypted: true },
    });

    const result = new Map<string, string>();
    for (const chunk of chunks) {
      if (chunk.textEncrypted) {
        result.set(
          chunk.id,
          this.docCrypto.decryptChunkText(
            userId,
            documentId,
            chunk.id,
            chunk.textEncrypted,
            dk,
          ),
        );
      } else {
        result.set(chunk.id, "");
      }
    }
    return result;
  }
}
