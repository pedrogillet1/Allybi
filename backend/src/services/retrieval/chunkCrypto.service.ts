import type { PrismaClient } from "@prisma/client";
import { DocumentKeyService } from "../documents/documentKey.service";
import { DocumentCryptoService } from "../documents/documentCrypto.service";
import { resolveIndexingEncryptionPosture } from "./indexingPolicy.service";

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

  async decryptChunkMetadataBatch(
    userId: string,
    documentId: string,
    chunkIds: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const encryptedRuntime =
      resolveIndexingEncryptionPosture().encryptedChunksOnly;
    const dk = await this.docKeys.getDocumentKey(userId, documentId);
    const chunks = await this.prisma.documentChunk.findMany({
      where: { id: { in: chunkIds }, documentId },
      select: { id: true, metadata: true, metadataEncrypted: true },
    });

    const result = new Map<string, Record<string, unknown>>();
    for (const chunk of chunks) {
      if (chunk.metadataEncrypted) {
        try {
          const decrypted = this.docCrypto.decryptChunkText(
            userId,
            documentId,
            `${chunk.id}:meta`,
            chunk.metadataEncrypted,
            dk,
          );
          const parsed = JSON.parse(String(decrypted || "{}"));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            result.set(chunk.id, parsed as Record<string, unknown>);
            continue;
          }
        } catch {
          if (encryptedRuntime) {
            // In encrypted-only runtime, do not silently fall back to plaintext metadata.
            continue;
          }
        }
      }
      if (
        chunk.metadata &&
        typeof chunk.metadata === "object" &&
        !Array.isArray(chunk.metadata)
      ) {
        if (encryptedRuntime && chunk.metadataEncrypted) {
          continue;
        }
        result.set(chunk.id, chunk.metadata as Record<string, unknown>);
      }
    }
    return result;
  }
}
