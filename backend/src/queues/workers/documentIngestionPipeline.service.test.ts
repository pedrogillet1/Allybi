import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock declarations (before imports)
// ---------------------------------------------------------------------------

const mockDocFindUnique = jest.fn();
const mockDocFindFirst = jest.fn();
const mockDocMetaUpsert = jest.fn();
const mockMetricsUpsert = jest.fn();
const mockIngestionEventCreate = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockDocFindUnique(...args),
      findFirst: (...args: any[]) => mockDocFindFirst(...args),
    },
    documentMetadata: {
      upsert: (...args: any[]) => mockDocMetaUpsert(...args),
    },
    documentProcessingMetrics: {
      upsert: (...args: any[]) =>
        mockMetricsUpsert(...args).catch(() => {}),
    },
    ingestionEvent: {
      create: (...args: any[]) =>
        mockIngestionEventCreate(...args).catch(() => {}),
    },
  },
}));

jest.mock("../../config/env", () => ({
  config: {
    DATABASE_URL: "postgres://localhost:5432/test",
  },
}));

const mockClaimForEnrichment = jest.fn();
const mockMarkIndexed = jest.fn();
const mockMarkReady = jest.fn();
const mockMarkFailed = jest.fn();
const mockMarkSkipped = jest.fn();

jest.mock("../../services/documents/documentStateManager.service", () => ({
  __esModule: true,
  documentStateManager: {
    claimForEnrichment: (...args: any[]) => mockClaimForEnrichment(...args),
    markIndexed: (...args: any[]) => mockMarkIndexed(...args),
    markReady: (...args: any[]) => mockMarkReady(...args),
    markFailed: (...args: any[]) => mockMarkFailed(...args),
    markSkipped: (...args: any[]) => mockMarkSkipped(...args),
  },
  default: {
    claimForEnrichment: (...args: any[]) => mockClaimForEnrichment(...args),
    markIndexed: (...args: any[]) => mockMarkIndexed(...args),
    markReady: (...args: any[]) => mockMarkReady(...args),
    markFailed: (...args: any[]) => mockMarkFailed(...args),
    markSkipped: (...args: any[]) => mockMarkSkipped(...args),
  },
}));

const mockProcessDocumentAsync = jest.fn();

jest.mock("../../services/ingestion/pipeline/documentPipeline.service", () => ({
  processDocumentAsync: (...args: any[]) => mockProcessDocumentAsync(...args),
}));

const mockEmitToUser = jest.fn();
const mockEmitProcessingUpdate = jest.fn();

jest.mock("../../services/ingestion/progress/documentProgress.service", () => ({
  emitToUser: (...args: any[]) => mockEmitToUser(...args),
  emitProcessingUpdate: (...args: any[]) => mockEmitProcessingUpdate(...args),
  documentProgressService: {
    emitCustomProgress: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../services/ingestion/extraction/extractionDispatch.service", () => ({
  isMimeTypeSupportedForExtraction: () => true,
}));

const mockIsPipelineSkipped = jest.fn();

jest.mock("../../services/ingestion/pipeline/pipelineTypes", () => ({
  isPipelineSkipped: (...args: any[]) => mockIsPipelineSkipped(...args),
}));

const mockGeneratePreviewPdf = jest.fn();
const mockNeedsPreviewPdfGeneration = jest.fn();

jest.mock("../../services/preview/previewPdfGenerator.service", () => ({
  generatePreviewPdf: (...args: any[]) => mockGeneratePreviewPdf(...args),
  needsPreviewPdfGeneration: (...args: any[]) => mockNeedsPreviewPdfGeneration(...args),
}));

jest.mock("../../services/realtime/socketGateway.service", () => ({
  emitRealtimeToUser: jest.fn(),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  runDocumentIngestionPipeline,
  resolveIngestionTelemetryFailClosed,
} from "./documentIngestionPipeline.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobData(overrides: Record<string, unknown> = {}) {
  return {
    documentId: "doc-1",
    userId: "user-1",
    filename: "report.pdf",
    mimeType: "application/pdf",
    encryptedFilename: "users/user-1/report.pdf",
    thumbnailUrl: null,
    ...overrides,
  };
}

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    userId: "user-1",
    filename: "report.pdf",
    mimeType: "application/pdf",
    encryptedFilename: "users/user-1/report.pdf",
    status: "uploaded",
    fileSize: 12345,
    metadata: { thumbnailUrl: null },
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function makeTimings(overrides: Record<string, unknown> = {}) {
  return {
    chunkCount: 10,
    pageCount: 3,
    extractionMethod: "pdfjs",
    extractionMs: 200,
    embeddingMs: 500,
    textLength: 5000,
    ocrUsed: false,
    ocrSuccess: false,
    ocrAttempted: false,
    ocrOutcome: "not_attempted",
    ocrConfidence: null,
    ocrMode: null,
    ocrPageCount: 0,
    textQuality: "good",
    textQualityScore: 0.9,
    extractionWarnings: [],
    extractionWarningCodes: [],
    peakRssMb: 512.3,
    fileHash: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("documentIngestionPipeline", () => {
  beforeEach(() => {
    delete process.env.INGESTION_TELEMETRY_FAIL_CLOSED;
    mockDocFindUnique.mockReset();
    mockDocFindFirst.mockReset();
    mockDocMetaUpsert.mockReset();
    mockMetricsUpsert.mockReset().mockResolvedValue({});
    mockIngestionEventCreate.mockReset().mockResolvedValue({});
    mockClaimForEnrichment.mockReset();
    mockMarkIndexed.mockReset();
    mockMarkReady.mockReset();
    mockMarkFailed.mockReset();
    mockMarkSkipped.mockReset();
    mockProcessDocumentAsync.mockReset();
    mockEmitToUser.mockReset();
    mockEmitProcessingUpdate.mockReset();
    mockIsPipelineSkipped.mockReset();
    mockGeneratePreviewPdf.mockReset();
    mockNeedsPreviewPdfGeneration.mockReset();
  });

  // -----------------------------------------------------------------------
  // 1. Claims document via documentStateManager.claimForEnrichment
  // -----------------------------------------------------------------------
  test("claims document via documentStateManager.claimForEnrichment", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings());
    mockIsPipelineSkipped.mockReturnValue(false);
    mockMarkIndexed.mockResolvedValue({ success: true });
    mockDocFindFirst.mockResolvedValue(null);

    await runDocumentIngestionPipeline(makeJobData());

    expect(mockClaimForEnrichment).toHaveBeenCalledTimes(1);
    expect(mockClaimForEnrichment).toHaveBeenCalledWith("doc-1");
  });

  // -----------------------------------------------------------------------
  // 2. Skips already-processed document
  // -----------------------------------------------------------------------
  test("skips already-processed document (status enriching/indexed/ready/skipped)", async () => {
    for (const status of ["enriching", "indexed", "ready", "skipped"]) {
      mockDocFindUnique.mockResolvedValue(makeDocument({ status }));

      const result = await runDocumentIngestionPipeline(makeJobData());

      expect(result.skipped).toBe(true);
      expect(result.success).toBe(true);
    }

    expect(mockClaimForEnrichment).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. Returns skipped when CAS claim fails
  // -----------------------------------------------------------------------
  test("returns skipped when CAS claim fails", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({
      success: false,
      reason: "Already claimed",
    });

    const result = await runDocumentIngestionPipeline(makeJobData());

    expect(result.skipped).toBe(true);
    expect(result.success).toBe(true);
    expect(mockProcessDocumentAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 4. Marks skipped via documentStateManager for zero-chunk non-XLSX
  // -----------------------------------------------------------------------
  test("marks skipped via documentStateManager for zero-chunk non-XLSX", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(
      makeTimings({ chunkCount: 0 }),
    );
    mockIsPipelineSkipped.mockReturnValue(false);
    mockMarkSkipped.mockResolvedValue({ success: true });

    const result = await runDocumentIngestionPipeline(makeJobData());

    expect(result.skipped).toBe(true);
    expect(mockMarkSkipped).toHaveBeenCalledTimes(1);
    expect(mockMarkSkipped).toHaveBeenCalledWith(
      "doc-1",
      "No extractable text content",
    );
  });

  test("forces fail-closed telemetry in production/staging when env disables it", () => {
    expect(resolveIngestionTelemetryFailClosed("false", "production")).toBe(
      true,
    );
    expect(resolveIngestionTelemetryFailClosed("false", "staging")).toBe(true);
    expect(resolveIngestionTelemetryFailClosed("false", "development")).toBe(
      false,
    );
  });

  // -----------------------------------------------------------------------
  // 5. Marks skipped for XLSX with zero chunks (strict no-content policy)
  // -----------------------------------------------------------------------
  test("marks skipped for XLSX with zero chunks", async () => {
    const xlsxMime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    mockDocFindUnique.mockResolvedValue(
      makeDocument({ mimeType: xlsxMime }),
    );
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(
      makeTimings({ chunkCount: 0 }),
    );
    mockIsPipelineSkipped.mockReturnValue(false);
    mockMarkSkipped.mockResolvedValue({ success: true });

    const result = await runDocumentIngestionPipeline(
      makeJobData({ mimeType: xlsxMime }),
    );

    expect(result.skipped).toBe(true);
    expect(mockMarkSkipped).toHaveBeenCalledTimes(1);
    expect(mockMarkSkipped).toHaveBeenCalledWith(
      "doc-1",
      "No extractable text content",
    );
    expect(mockIngestionEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "skipped",
          meta: expect.objectContaining({
            ocrAttempted: false,
            ocrOutcome: "not_attempted",
            extractionWarningCodes: [],
            peakRssMb: 512.3,
            sizeBucket: "lt_1mb",
          }),
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 6. Marks indexed via documentStateManager on success
  // -----------------------------------------------------------------------
  test("marks indexed via documentStateManager on success", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings({ chunkCount: 15 }));
    mockIsPipelineSkipped.mockReturnValue(false);
    mockMarkIndexed.mockResolvedValue({ success: true });
    mockDocFindFirst.mockResolvedValue(null);

    const result = await runDocumentIngestionPipeline(makeJobData());

    expect(result.success).toBe(true);
    expect(result.chunks).toBe(15);
    expect(mockMarkIndexed).toHaveBeenCalledTimes(1);
    expect(mockMarkIndexed).toHaveBeenCalledWith("doc-1", 15);
    expect(mockIngestionEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ok",
          meta: expect.objectContaining({
            ocrAttempted: false,
            ocrOutcome: "not_attempted",
            extractionWarningCodes: [],
          }),
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 7. Marks failed via documentStateManager on pipeline error
  // -----------------------------------------------------------------------
  test("marks failed via documentStateManager on pipeline error", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockRejectedValue(new Error("extraction boom"));
    mockMarkFailed.mockResolvedValue({ success: true });
    mockMetricsUpsert.mockResolvedValue({});
    mockIngestionEventCreate.mockResolvedValue({});

    await expect(
      runDocumentIngestionPipeline(makeJobData()),
    ).rejects.toThrow("extraction boom");

    expect(mockMarkFailed).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed).toHaveBeenCalledWith(
      "doc-1",
      "enriching",
      "extraction boom",
    );
  });

  // -----------------------------------------------------------------------
  // 8. Handles preview generation when handlePreviewAndReady is true
  // -----------------------------------------------------------------------
  test("handles preview generation when handlePreviewAndReady is true", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings());
    mockIsPipelineSkipped.mockReturnValue(false);
    mockMarkIndexed.mockResolvedValue({ success: true });
    mockDocFindFirst.mockResolvedValue(null);
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGeneratePreviewPdf.mockResolvedValue({ success: true });
    mockMarkReady.mockResolvedValue({ success: true });

    const result = await runDocumentIngestionPipeline(makeJobData(), {
      handlePreviewAndReady: true,
    });

    expect(result.success).toBe(true);
    expect(mockNeedsPreviewPdfGeneration).toHaveBeenCalledWith("application/pdf");
    expect(mockGeneratePreviewPdf).toHaveBeenCalledWith("doc-1", "user-1");
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
    expect(mockMarkReady).toHaveBeenCalledWith("doc-1");
    expect(mockEmitToUser).toHaveBeenCalledWith(
      "user-1",
      "document-ready",
      expect.objectContaining({
        documentId: "doc-1",
        hasPreview: true,
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 9. Throws when state transition to indexed fails (CAS mismatch, etc.)
  // -----------------------------------------------------------------------
  test("throws when markIndexed transition returns success:false", async () => {
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings({ chunkCount: 3 }));
    mockIsPipelineSkipped.mockReturnValue(false);
    mockDocFindFirst.mockResolvedValue(null);
    mockMarkIndexed.mockResolvedValue({
      success: false,
      reason: "CAS failed",
    });
    mockMarkFailed.mockResolvedValue({ success: true });

    await expect(
      runDocumentIngestionPipeline(makeJobData()),
    ).rejects.toThrow("State transition failed during markIndexed");

    expect(mockMarkFailed).toHaveBeenCalledWith(
      "doc-1",
      "enriching",
      expect.stringContaining("State transition failed during markIndexed"),
    );
  });

  test("fails closed when ingestion telemetry persistence fails and fail-closed mode is enabled", async () => {
    process.env.INGESTION_TELEMETRY_FAIL_CLOSED = "true";
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings({ chunkCount: 3 }));
    mockIsPipelineSkipped.mockReturnValue(false);
    mockDocFindFirst.mockResolvedValue(null);
    mockMetricsUpsert.mockResolvedValue({});
    mockIngestionEventCreate.mockImplementation(() => {
      throw new Error("telemetry store unavailable");
    });
    mockMarkFailed.mockResolvedValue({ success: true });

    await expect(
      runDocumentIngestionPipeline(makeJobData()),
    ).rejects.toThrow("Persist ingestion telemetry failed after retries");

    expect(mockMarkIndexed).not.toHaveBeenCalled();
    expect(mockMarkFailed).toHaveBeenCalledWith(
      "doc-1",
      "enriching",
      expect.stringContaining("Persist ingestion telemetry failed after retries"),
    );
  });

  test("keeps fail-open behavior in development when telemetry persistence fails", async () => {
    process.env.INGESTION_TELEMETRY_FAIL_CLOSED = "false";
    mockDocFindUnique.mockResolvedValue(makeDocument());
    mockClaimForEnrichment.mockResolvedValue({ success: true });
    mockProcessDocumentAsync.mockResolvedValue(makeTimings({ chunkCount: 3 }));
    mockIsPipelineSkipped.mockReturnValue(false);
    mockDocFindFirst.mockResolvedValue(null);
    mockMetricsUpsert.mockResolvedValue({});
    mockIngestionEventCreate.mockImplementation(() => {
      throw new Error("telemetry store unavailable");
    });
    mockMarkIndexed.mockResolvedValue({ success: true });

    const result = await runDocumentIngestionPipeline(makeJobData());
    expect(result.success).toBe(true);
    expect(mockMarkIndexed).toHaveBeenCalledWith("doc-1", 3);
  });
});
