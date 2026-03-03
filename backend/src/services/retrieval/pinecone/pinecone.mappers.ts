import type { PineconeSearchHit } from "../pinecone.service";
import type { PineconeQueryMatch } from "./pinecone.types";

export function mapPineconeMatchesToHits(
  matches: PineconeQueryMatch[],
): PineconeSearchHit[] {
  const hits: PineconeSearchHit[] = [];

  for (const match of matches || []) {
    const metadata = (match?.metadata || {}) as Record<string, unknown>;
    const documentId = String(metadata.documentId || "");
    if (!documentId) continue;

    const status = String(metadata.status || "active");
    if (status === "deleted") continue;

    hits.push({
      documentId,
      chunkIndex: Number(metadata.chunkIndex ?? -1),
      content: String(metadata.content || ""),
      similarity: Number(match?.score || 0),
      metadata,
      document: {
        id: documentId,
        filename: String(metadata.filename || ""),
        mimeType: String(metadata.mimeType || ""),
        createdAt: String(metadata.createdAt || ""),
        status,
        folderId: metadata.folderId ? String(metadata.folderId) : undefined,
        folderPath: metadata.folderPath ? String(metadata.folderPath) : undefined,
        categoryId: metadata.categoryId ? String(metadata.categoryId) : undefined,
      },
    });
  }

  return hits;
}
