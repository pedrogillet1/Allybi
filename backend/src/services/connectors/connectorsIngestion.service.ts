import { createHash } from "crypto";

import prisma from "../../config/database";
import { uploadFile } from "../../config/storage";
import { splitTextIntoChunksWithOffsets } from "../ingestion/chunking.service";
import vectorEmbeddingRuntimeService from "../retrieval/vectorEmbedding.runtime.service";
import type { InputChunk } from "../retrieval/vectorEmbedding.service";
import type { ConnectorProvider } from "./connectorsRegistry";
import { documentContentVault } from "../documents/documentContentVault.service";
import {
  documentStateManager,
  type TransitionResult,
} from "../documents/documentStateManager.service";
import { logger } from "../../utils/logger";

const CONNECTOR_MIME_MAP: Record<string, string> = {
  gmail: "message/rfc822",
  outlook: "message/rfc822",
  slack: "application/x-slack-message",
};

const CONNECTOR_DOC_TYPE_MAP: Record<string, string> = {
  gmail: "email_message",
  outlook: "email_message",
  slack: "slack_message",
};

function resolveConnectorMimeType(sourceType: string): string {
  return CONNECTOR_MIME_MAP[sourceType] || "text/plain";
}

function resolveConnectorDocType(sourceType: string): string {
  return CONNECTOR_DOC_TYPE_MAP[sourceType] || sourceType;
}

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
  documentId?: string;
  status: "created" | "existing" | "updated" | "failed";
  error?: string;
}

/**
 * Ingest connector payloads as first-class Documents and push to existing chunk/embed pipeline.
 */
export class ConnectorsIngestionService {
  private ensureTransitionSucceeded(
    result: TransitionResult,
    context: string,
  ): void {
    if (result.success) return;
    const reason = result.reason || "unknown transition failure";
    throw new Error(
      `[ConnectorsIngestion] State transition failed during ${context}: ${reason}`,
    );
  }

  isIngestionEnabled(): boolean {
    return (
      String(process.env.CONNECTORS_INGEST_AS_DOCUMENTS || "").toLowerCase() ===
      "true"
    );
  }

  async ingestDocuments(
    ctx: ConnectorIngestionContext,
    items: ConnectorDocument[],
  ): Promise<ConnectorIngestionResultItem[]> {
    // Product behavior: connectors should enable read/send in-chat without polluting the user's document library.
    // Keep ingestion behind an explicit flag for optional "index my inbox" style features.
    if (!this.isIngestionEnabled()) return [];
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
        const documentId = deterministicDocumentId(ctx.userId, normalized);
        const textContent = this.buildTextPayload(normalized);
        const fileHash = createHash("sha256").update(textContent).digest("hex");
        const resolvedMime = resolveConnectorMimeType(normalized.sourceType);
        const resolvedDocType = resolveConnectorDocType(normalized.sourceType);
        let existing = await prisma.document.findUnique({
          where: { id: documentId },
          select: {
            id: true,
            fileHash: true,
            encryptedFilename: true,
            userId: true,
          },
        });
        // Backward-compat path for historical rows created before deterministic connector IDs.
        if (!existing) {
          existing = await prisma.document.findFirst({
            where: {
              userId: ctx.userId,
              filename,
            },
            select: {
              id: true,
              fileHash: true,
              encryptedFilename: true,
              userId: true,
            },
          });
        }
        if (existing && existing.userId !== ctx.userId) {
          throw new Error("Connector document ownership mismatch.");
        }

        if (existing) {
          if (existing.fileHash === fileHash) {
            results.push({
              sourceId: normalized.sourceId,
              documentId: existing.id,
              status: "existing",
            });
            continue;
          }

          await this.reconcileExistingDocument(
            ctx,
            normalized,
            existing,
            filename,
            textContent,
            fileHash,
            resolvedMime,
            resolvedDocType,
          );
          results.push({
            sourceId: normalized.sourceId,
            documentId: existing.id,
            status: "updated",
          });
          continue;
        }

        const storageKey = `users/${ctx.userId}/connectors/${normalized.sourceType}/${documentId}/${filename}`;
        const encryptDocumentText =
          documentContentVault.isEnabled() || documentContentVault.isStrict();

        await uploadFile(
          storageKey,
          Buffer.from(textContent, "utf8"),
          resolvedMime,
        );

        try {
          await prisma.$transaction(async (tx) => {
            await tx.document.create({
              data: {
                id: documentId,
                userId: ctx.userId,
                filename,
                encryptedFilename: storageKey,
                fileSize: Buffer.byteLength(textContent, "utf8"),
                mimeType: resolvedMime,
                fileHash,
                status: "uploaded",
                indexingState: "pending",
                indexingUpdatedAt: new Date(),
                displayTitle: normalized.title,
                // Never persist connector body text in plaintext columns.
                rawText: null,
                previewText: null,
                renderableContent: null,
                language: "en",
              },
            });

            await tx.documentMetadata.create({
              data: {
                documentId,
                // Connector extracted text remains encrypted-only / non-persistent.
                extractedText: null,
                wordCount: wordCount(textContent),
                characterCount: textContent.length,
                summary: normalized.title,
                creationDate: normalized.timestamp,
                modificationDate: normalized.timestamp,
                entities: JSON.stringify({
                  actors: normalized.actors,
                  labelsOrChannel: normalized.labelsOrChannel,
                }),
                classification: resolvedDocType,
                topics: JSON.stringify(normalized.labelsOrChannel),
              },
            });
          });
        } catch (createError) {
          if (!isUniqueViolation(createError)) {
            throw createError;
          }

          const concurrent = await prisma.document.findUnique({
            where: { id: documentId },
            select: {
              id: true,
              fileHash: true,
              encryptedFilename: true,
              userId: true,
            },
          });
          if (!concurrent || concurrent.userId !== ctx.userId) {
            throw createError;
          }

          if (concurrent.fileHash === fileHash) {
            results.push({
              sourceId: normalized.sourceId,
              documentId: concurrent.id,
              status: "existing",
            });
            continue;
          }

          await this.reconcileExistingDocument(
            ctx,
            normalized,
            concurrent,
            filename,
            textContent,
            fileHash,
            resolvedMime,
            resolvedDocType,
          );
          results.push({
            sourceId: normalized.sourceId,
            documentId: concurrent.id,
            status: "updated",
          });
          continue;
        }

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
            mimeType: resolvedMime,
            encryptedFilename: storageKey,
            connectorDocType: resolvedDocType,
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
        logger.error(
          `[ConnectorsIngestion] Failed to ingest item ${item.sourceType}:${item.sourceId}: ${msg}`,
        );
        // Continue processing remaining items instead of aborting the entire sync.
        results.push({
          sourceId: item.sourceId,
          status: "failed",
          error: msg,
        });
      }
    }

    return results;
  }

  private async reconcileExistingDocument(
    ctx: ConnectorIngestionContext,
    item: ConnectorDocument,
    existing: {
      id: string;
      fileHash: string | null;
      encryptedFilename: string | null;
    },
    filename: string,
    textContent: string,
    fileHash: string,
    resolvedMime: string,
    resolvedDocType: string,
  ): Promise<void> {
    const encryptDocumentText =
      documentContentVault.isEnabled() || documentContentVault.isStrict();
    const storageKey =
      existing.encryptedFilename ||
      `users/${ctx.userId}/connectors/${item.sourceType}/${existing.id}/${filename}`;

    await uploadFile(storageKey, Buffer.from(textContent, "utf8"), resolvedMime);

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: existing.id },
        data: {
          filename,
          encryptedFilename: storageKey,
          fileSize: Buffer.byteLength(textContent, "utf8"),
          mimeType: resolvedMime,
          fileHash,
          status: "uploaded",
          indexingState: "pending",
          indexingUpdatedAt: new Date(),
          displayTitle: item.title,
          rawText: null,
          previewText: null,
          renderableContent: null,
          language: "en",
          embeddingsGenerated: false,
          chunksCount: 0,
        },
      });

      await tx.documentMetadata.upsert({
        where: { documentId: existing.id },
        create: {
          documentId: existing.id,
          extractedText: null,
          wordCount: wordCount(textContent),
          characterCount: textContent.length,
          summary: item.title,
          creationDate: item.timestamp,
          modificationDate: item.timestamp,
          entities: JSON.stringify({
            actors: item.actors,
            labelsOrChannel: item.labelsOrChannel,
          }),
          classification: resolvedDocType,
          topics: JSON.stringify(item.labelsOrChannel),
        },
        update: {
          extractedText: null,
          wordCount: wordCount(textContent),
          characterCount: textContent.length,
          summary: item.title,
          modificationDate: item.timestamp,
          entities: JSON.stringify({
            actors: item.actors,
            labelsOrChannel: item.labelsOrChannel,
          }),
          classification: resolvedDocType,
          topics: JSON.stringify(item.labelsOrChannel),
        },
      });
    });

    if (encryptDocumentText) {
      await documentContentVault.encryptDocumentFields(ctx.userId, existing.id, {
        rawText: textContent,
        previewText: textContent.slice(0, 4000),
        renderableContent: textContent,
      });
    }

    await this.enqueueOrIndexFallback(
      {
        documentId: existing.id,
        userId: ctx.userId,
        filename,
        mimeType: resolvedMime,
        encryptedFilename: storageKey,
        connectorDocType: resolvedDocType,
      },
      textContent,
    );
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
      connectorDocType?: string;
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

    const segments = splitTextIntoChunksWithOffsets(textContent, 0);
    const chunks: InputChunk[] = segments.map((segment, idx): InputChunk => ({
      chunkIndex: idx,
      content: segment.content,
      metadata: {
        source: "connector_ingestion",
        sourceType: "text",
        chunkType: "text",
        sectionName: "connector_message",
        sectionId: `sec:connector|doc:${queuePayload.documentId}|chunk:${idx}`,
        startChar: segment.startChar,
        endChar: segment.endChar,
        documentId: queuePayload.documentId,
        versionId: queuePayload.documentId,
        rootDocumentId: queuePayload.documentId,
        isLatestVersion: true,
      },
    }));

    const claimResult = await documentStateManager.claimForEnrichment(
      queuePayload.documentId,
    );
    this.ensureTransitionSucceeded(claimResult, "claimForEnrichment");

    try {
      await vectorEmbeddingRuntimeService.storeDocumentEmbeddings(
        queuePayload.documentId,
        chunks,
      );

      await prisma.document.update({
        where: { id: queuePayload.documentId },
        data: {
          embeddingsGenerated: true,
        },
      });

      const markIndexedResult = await documentStateManager.markIndexed(
        queuePayload.documentId,
        chunks.length,
      );
      this.ensureTransitionSucceeded(markIndexedResult, "markIndexed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        const markFailedResult = await documentStateManager.markFailed(
          queuePayload.documentId,
          "enriching",
          `Connector inline indexing failed: ${message}`.slice(0, 500),
        );
        this.ensureTransitionSucceeded(markFailedResult, "markFailed");
      } catch (markFailedError) {
        const markFailedMessage =
          markFailedError instanceof Error
            ? markFailedError.message
            : String(markFailedError);
        throw new Error(
          `[ConnectorsIngestion] Inline indexing failed and markFailed transition failed: inline="${message}" markFailed="${markFailedMessage}"`,
        );
      }
      throw error;
    }
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

function isUniqueViolation(error: unknown): boolean {
  const code = String((error as any)?.code || "");
  const message = String((error as any)?.message || "");
  return code === "P2002" || /unique constraint/i.test(message);
}

export default ConnectorsIngestionService;
