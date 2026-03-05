import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();

const mockUploadFile = jest.fn();
const mockSplitTextIntoChunksWithOffsets = jest.fn();
const mockStoreDocumentEmbeddings = jest.fn();

const mockVaultIsStrict = jest.fn();
const mockVaultIsEnabled = jest.fn();
const mockVaultEncryptDocumentFields = jest.fn();

const mockAddDocumentJob = jest.fn();

const mockClaimForEnrichment = jest.fn();
const mockMarkIndexed = jest.fn();
const mockMarkFailed = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findFirst: (...args: any[]) => mockFindFirst(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

jest.mock("../../config/storage", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
}));

jest.mock("../ingestion/chunking.service", () => ({
  splitTextIntoChunksWithOffsets: (...args: any[]) =>
    mockSplitTextIntoChunksWithOffsets(...args),
}));

jest.mock("../retrieval/vectorEmbedding.runtime.service", () => ({
  __esModule: true,
  default: {
    storeDocumentEmbeddings: (...args: any[]) =>
      mockStoreDocumentEmbeddings(...args),
  },
}));

jest.mock("../documents/documentContentVault.service", () => ({
  documentContentVault: {
    isStrict: (...args: any[]) => mockVaultIsStrict(...args),
    isEnabled: (...args: any[]) => mockVaultIsEnabled(...args),
    encryptDocumentFields: (...args: any[]) =>
      mockVaultEncryptDocumentFields(...args),
  },
}));

jest.mock("../../queues/document.queue", () => ({
  addDocumentJob: (...args: any[]) => mockAddDocumentJob(...args),
}));

jest.mock("../documents/documentStateManager.service", () => ({
  __esModule: true,
  documentStateManager: {
    claimForEnrichment: (...args: any[]) => mockClaimForEnrichment(...args),
    markIndexed: (...args: any[]) => mockMarkIndexed(...args),
    markFailed: (...args: any[]) => mockMarkFailed(...args),
  },
  default: {
    claimForEnrichment: (...args: any[]) => mockClaimForEnrichment(...args),
    markIndexed: (...args: any[]) => mockMarkIndexed(...args),
    markFailed: (...args: any[]) => mockMarkFailed(...args),
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import ConnectorsIngestionService from "./connectorsIngestion.service";

function makeItem() {
  return {
    sourceType: "gmail" as const,
    sourceId: "msg-1",
    title: "Subject",
    body: "Body text",
    timestamp: new Date("2026-03-01T00:00:00.000Z"),
    actors: ["sender@example.com"],
    labelsOrChannel: ["INBOX"],
  };
}

describe("ConnectorsIngestionService", () => {
  beforeEach(() => {
    process.env.CONNECTORS_INGEST_AS_DOCUMENTS = "true";

    mockFindFirst.mockReset().mockResolvedValue(null);
    mockUpdate.mockReset().mockResolvedValue({});
    mockUploadFile.mockReset().mockResolvedValue(undefined);
    mockSplitTextIntoChunksWithOffsets.mockReset().mockReturnValue([
      { content: "chunk-1", startChar: 0, endChar: 7 },
      { content: "chunk-2", startChar: 7, endChar: 14 },
    ]);
    mockStoreDocumentEmbeddings.mockReset().mockResolvedValue(undefined);
    mockVaultIsStrict.mockReset().mockReturnValue(false);
    mockVaultIsEnabled.mockReset().mockReturnValue(false);
    mockVaultEncryptDocumentFields.mockReset().mockResolvedValue(undefined);
    mockAddDocumentJob.mockReset().mockResolvedValue(undefined);
    mockClaimForEnrichment.mockReset().mockResolvedValue({ success: true });
    mockMarkIndexed.mockReset().mockResolvedValue({ success: true });
    mockMarkFailed.mockReset().mockResolvedValue({ success: true });

    mockTransaction.mockReset().mockImplementation(async (fn: any) => {
      const tx = {
        document: {
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
        },
        documentMetadata: {
          create: jest.fn().mockResolvedValue({}),
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
  });

  test("queues document when queue is available", async () => {
    const service = new ConnectorsIngestionService();

    const out = await service.ingestDocuments(
      { userId: "user-1" },
      [makeItem()],
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("created");
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
    expect(mockClaimForEnrichment).not.toHaveBeenCalled();
    expect(mockMarkIndexed).not.toHaveBeenCalled();
  });

  test("returns existing when connector payload hash is unchanged", async () => {
    const item = makeItem();
    const sourceMeta = {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      timestamp: item.timestamp.toISOString(),
      actors: item.actors,
      labelsOrChannel: item.labelsOrChannel,
      sourceMeta: item.sourceMeta ?? {},
    };
    const payload = [
      `Title: ${item.title}`,
      `Source: ${item.sourceType}`,
      `Source ID: ${item.sourceId}`,
      `Timestamp: ${item.timestamp.toISOString()}`,
      `Actors: ${item.actors.join(", ")}`,
      `Labels/Channel: ${item.labelsOrChannel.join(", ")}`,
      "",
      item.body,
      "",
      `Source Metadata: ${JSON.stringify(sourceMeta)}`,
    ].join("\n");
    const fileHash = require("crypto")
      .createHash("sha256")
      .update(payload)
      .digest("hex");

    mockFindFirst.mockResolvedValue({
      id: "doc-existing-1",
      fileHash,
      encryptedFilename: "users/user-1/connectors/gmail/doc-existing-1/gmail_msg-1.txt",
    });

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments({ userId: "user-1" }, [item]);

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("existing");
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(mockAddDocumentJob).not.toHaveBeenCalled();
  });

  test("updates existing connector document when payload hash changes", async () => {
    mockFindFirst.mockResolvedValue({
      id: "doc-existing-2",
      fileHash: "stale-hash",
      encryptedFilename: "users/user-1/connectors/gmail/doc-existing-2/gmail_msg-1.txt",
    });

    const txDocumentUpdate = jest.fn().mockResolvedValue({});
    const txDocumentMetadataUpsert = jest.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        document: {
          create: jest.fn().mockResolvedValue({}),
          update: txDocumentUpdate,
        },
        documentMetadata: {
          create: jest.fn().mockResolvedValue({}),
          upsert: txDocumentMetadataUpsert,
        },
      }),
    );

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments({ userId: "user-1" }, [makeItem()]);

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("updated");
    expect(out[0]?.documentId).toBe("doc-existing-2");
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(txDocumentUpdate).toHaveBeenCalledTimes(1);
    expect(txDocumentMetadataUpsert).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
  });

  test("never persists connector plaintext body fields at rest", async () => {
    const txDocumentCreate = jest.fn().mockResolvedValue({});
    const txDocumentMetadataCreate = jest.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        document: { create: txDocumentCreate },
        documentMetadata: { create: txDocumentMetadataCreate },
      }),
    );
    mockVaultIsStrict.mockReturnValue(false);
    mockVaultIsEnabled.mockReturnValue(false);

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments(
      { userId: "user-1" },
      [makeItem()],
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("created");
    expect(txDocumentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawText: null,
          previewText: null,
          renderableContent: null,
        }),
      }),
    );
    expect(txDocumentMetadataCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extractedText: null,
        }),
      }),
    );
  });

  test("falls back to inline indexing with state-manager transitions when queue is unavailable", async () => {
    mockAddDocumentJob.mockRejectedValue(new Error("queue down"));

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments(
      { userId: "user-1" },
      [makeItem()],
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("created");
    expect(mockClaimForEnrichment).toHaveBeenCalledTimes(1);
    expect(mockStoreDocumentEmbeddings).toHaveBeenCalledTimes(1);
    const [, indexedChunks] = mockStoreDocumentEmbeddings.mock.calls[0];
    expect(Array.isArray(indexedChunks)).toBe(true);
    expect(indexedChunks[0].metadata).toEqual(
      expect.objectContaining({
        source: "connector_ingestion",
        sourceType: "text",
        chunkType: "text",
        sectionName: "connector_message",
        documentId: expect.any(String),
        versionId: expect.any(String),
        rootDocumentId: expect.any(String),
        isLatestVersion: true,
      }),
    );
    expect(mockMarkIndexed).toHaveBeenCalledWith(expect.any(String), 2);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { embeddingsGenerated: true },
      }),
    );
  });

  test("marks item as failed when inline fallback cannot transition to indexed", async () => {
    mockAddDocumentJob.mockRejectedValue(new Error("queue down"));
    mockMarkIndexed.mockResolvedValue({
      success: false,
      reason: "CAS failed",
    });

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments(
      { userId: "user-1" },
      [makeItem()],
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("failed");
    expect(out[0]?.error).toContain("State transition failed during markIndexed");
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
  });

  test("returns combined failure when markFailed transition also fails", async () => {
    mockAddDocumentJob.mockRejectedValue(new Error("queue down"));
    mockMarkIndexed.mockResolvedValue({
      success: false,
      reason: "CAS failed",
    });
    mockMarkFailed.mockResolvedValue({
      success: false,
      reason: "failed transition",
    });

    const service = new ConnectorsIngestionService();
    const out = await service.ingestDocuments(
      { userId: "user-1" },
      [makeItem()],
    );

    expect(out).toHaveLength(1);
    expect(out[0]?.status).toBe("failed");
    expect(out[0]?.error).toContain("Inline indexing failed and markFailed transition failed");
    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
  });
});
