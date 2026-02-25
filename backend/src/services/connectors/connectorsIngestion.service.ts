import { createHash } from "crypto";

import prisma from "../../config/database";
import { uploadFile } from "../../config/storage";
import vectorEmbeddingService from "../retrieval/vectorEmbedding.service";
import type { ConnectorProvider } from "./connectorsRegistry";
import { documentContentVault } from "../documents/documentContentVault.service";

export interface ConnectorDocument {
  sourceType: ConnectorProvider;
  sourceId: string;
  title: string;
  body: string;
  timestamp: Date;
  actors: string[];
  labelsOrChannel: string[];
  sourceMeta?: Record<string, unknown>;
}

export interface ConnectorIngestionContext {
  userId: string;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface ConnectorIngestionResultItem {
  sourceId: string;
  documentId: string;
  status: "created" | "existing";
}

/**
 * Ingest connector payloads as first-class Documents and push to existing chunk/embed pipeline.
 */
export class ConnectorsIngestionService {
  async ingestDocuments(
    ctx: ConnectorIngestionContext,
    items: ConnectorDocument[],
  ): Promise<ConnectorIngestionResultItem[]> {
    // Product behavior: connectors should enable read/send in-chat without polluting the user's document library.
    // Keep ingestion behind an explicit flag for optional "index my inbox" style features.
    const ingestEnabled =
      String(process.env.CONNECTORS_INGEST_AS_DOCUMENTS || "").toLowerCase() ===
      "true";
    if (!ingestEnabled) return [];
    if (documentContentVault.isStrict() && !documentContentVault.isEnabled()) {
      throw new Error(
        "SECURITY_REQUIRE_DOC_ENCRYPTION is enabled but document encryption runtime is not configured.",
      );
    }

    const results: ConnectorIngestionResultItem[] = [];

    for (const item of items) {
      try {
        const normalized = this.normalize(item);

        // Idempotency by deterministic filename per source item.
        const filename = this.buildFilename(normalized);
        const existing = await prisma.document.findFirst({
          where: {
            userId: ctx.userId,
            filename,
          },
          select: { id: true },
        });

        if (existing) {
          results.push({
            sourceId: normalized.sourceId,
            documentId: existing.id,
            status: "existing",
          });
          continue;
        }

        const documentId = deterministicDocumentId(ctx.userId, normalized);
        const textContent = this.buildTextPayload(normalized);
        const storageKey = `users/${ctx.userId}/connectors/${normalized.sourceType}/${documentId}/${filename}`;
        const fileHash = createHash("sha256").update(textContent).digest("hex");
        const encryptDocumentText =
          documentContentVault.isEnabled() || documentContentVault.isStrict();

        await uploadFile(
          storageKey,
          Buffer.from(textContent, "utf8"),
          "text/plain",
        );

        await prisma.$transaction(async (tx) => {
          await tx.document.create({
            data: {
              id: documentId,
              userId: ctx.userId,
              filename,
              encryptedFilename: storageKey,
              fileSize: Buffer.byteLength(textContent, "utf8"),
              mimeType: "text/plain",
              fileHash,
              status: "uploaded",
              displayTitle: normalized.title,
              rawText: encryptDocumentText ? null : textContent,
              previewText: encryptDocumentText
                ? null
                : textContent.slice(0, 4000),
              renderableContent: encryptDocumentText ? null : textContent,
              language: "en",
            },
          });

          await tx.documentMetadata.create({
            data: {
              documentId,
              extractedText: encryptDocumentText ? null : textContent,
              wordCount: wordCount(textContent),
              characterCount: textContent.length,
              summary: normalized.title,
              creationDate: normalized.timestamp,
              modificationDate: normalized.timestamp,
              entities: JSON.stringify({
                actors: normalized.actors,
                labelsOrChannel: normalized.labelsOrChannel,
              }),
              classification: normalized.sourceType,
              topics: JSON.stringify(normalized.labelsOrChannel),
            },
          });
        });

        if (encryptDocumentText) {
          await documentContentVault.encryptDocumentFields(
            ctx.userId,
            documentId,
            {
              rawText: textContent,
              previewText: textContent.slice(0, 4000),
              renderableContent: textContent,
            },
          );
        }

        await this.enqueueOrIndexFallback(
          {
            documentId,
            userId: ctx.userId,
            filename,
            mimeType: "text/plain",
            encryptedFilename: storageKey,
          },
          textContent,
        );

        results.push({
          sourceId: normalized.sourceId,
          documentId,
          status: "created",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[ConnectorsIngestion] Failed to ingest item ${item.sourceType}:${item.sourceId}: ${msg}`,
        );
        // Continue processing remaining items instead of aborting the entire sync.
      }
    }

    return results;
  }

  private normalize(item: ConnectorDocument): ConnectorDocument {
    return {
      sourceType: item.sourceType,
      sourceId: item.sourceId.trim(),
      title: item.title.trim() || "(untitled connector item)",
      body: item.body.trim(),
      timestamp: item.timestamp,
      actors: Array.from(
        new Set(item.actors.map((a) => a.trim()).filter(Boolean)),
      ),
      labelsOrChannel: Array.from(
        new Set(item.labelsOrChannel.map((x) => x.trim()).filter(Boolean)),
      ),
      sourceMeta: item.sourceMeta ?? {},
    };
  }

  private buildFilename(item: ConnectorDocument): string {
    const safeSourceId = item.sourceId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${item.sourceType}_${safeSourceId}.txt`;
  }

  private buildTextPayload(item: ConnectorDocument): string {
    const meta = {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      timestamp: item.timestamp.toISOString(),
      actors: item.actors,
      labelsOrChannel: item.labelsOrChannel,
      sourceMeta: item.sourceMeta ?? {},
    };

    return [
      `Title: ${item.title}`,
      `Source: ${item.sourceType}`,
      `Source ID: ${item.sourceId}`,
      `Timestamp: ${item.timestamp.toISOString()}`,
      item.actors.length ? `Actors: ${item.actors.join(", ")}` : null,
      item.labelsOrChannel.length
        ? `Labels/Channel: ${item.labelsOrChannel.join(", ")}`
        : null,
      "",
      item.body,
      "",
      `Source Metadata: ${JSON.stringify(meta)}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");
  }

  private async enqueueOrIndexFallback(
    queuePayload: {
      documentId: string;
      userId: string;
      filename: string;
      mimeType: string;
      encryptedFilename: string;
    },
    textContent: string,
  ): Promise<void> {
    try {
      const queueMod = await import("../../queues/document.queue");
      if (typeof queueMod.addDocumentJob === "function") {
        await queueMod.addDocumentJob(queuePayload);
        return;
      }
    } catch {
      // Queue unavailable: fallback to inline indexing.
    }

    const chunks = splitIntoChunks(textContent, 1400, 120).map(
      (content, idx) => ({
        chunkIndex: idx,
        content,
        metadata: { source: "connector_ingestion" },
      }),
    );

    await vectorEmbeddingService.storeDocumentEmbeddings(
      queuePayload.documentId,
      chunks,
    );

    await prisma.document.update({
      where: { id: queuePayload.documentId },
      data: {
        status: "indexed",
        embeddingsGenerated: true,
        chunksCount: chunks.length,
      },
    });
  }
}

function deterministicDocumentId(
  userId: string,
  item: ConnectorDocument,
): string {
  // Include userId to avoid cross-user primary-key collisions when provider/source IDs overlap.
  const seed = `${userId}:${item.sourceType}:${item.sourceId}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

function wordCount(input: string): number {
  return input.trim() ? input.trim().split(/\s+/).length : 0;
}

function splitIntoChunks(
  text: string,
  size: number,
  overlap: number,
): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const out: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + Math.floor(size * 0.5)) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = clean.lastIndexOf(". ", end);
        if (sentenceBreak > start + Math.floor(size * 0.5)) {
          end = sentenceBreak + 1;
        }
      }
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) out.push(chunk);
    if (end >= clean.length) break;

    const nextStart = end - overlap;
    if (nextStart <= start) break;
    start = nextStart;
  }

  return out;
}

export default ConnectorsIngestionService;
