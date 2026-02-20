import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockNeedsPreviewPdfGeneration = jest.fn();
const mockGetPreviewPdfStatus = jest.fn();
const mockAddPreviewGenerationJob = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("./previewPdfGenerator.service", () => ({
  needsPreviewPdfGeneration: (...args: unknown[]) =>
    mockNeedsPreviewPdfGeneration(...args),
  getPreviewPdfStatus: (...args: unknown[]) => mockGetPreviewPdfStatus(...args),
  isProcessingStale: jest.fn(),
}));

jest.mock("../../queues/document.queue", () => ({
  addPreviewGenerationJob: (...args: unknown[]) =>
    mockAddPreviewGenerationJob(...args),
}));

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

describe("previewOrchestrator.ensurePreview", () => {
  beforeEach(() => {
    mockNeedsPreviewPdfGeneration.mockReset();
    mockGetPreviewPdfStatus.mockReset();
    mockAddPreviewGenerationJob.mockReset();
    mockFindUnique.mockReset();
  });

  it("returns not_needed when mime type does not require preview", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(false);
    const result = await ensurePreview("doc-1", "u1", "text/plain");
    expect(result).toEqual({ status: "not_needed" });
  });

  it("returns ready when preview is already generated", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "ready",
      pdfKey: "pdf/key",
      isStale: false,
      attempts: 1,
    });
    const result = await ensurePreview("doc-1", "u1", "application/pdf");
    expect(result).toEqual({ status: "ready", pdfKey: "pdf/key" });
  });

  it("re-triggers generation for failed previews under retry limit", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "failed",
      pdfKey: null,
      isStale: false,
      attempts: 1,
      error: "failed once",
    });
    mockFindUnique.mockResolvedValue({ filename: "doc.pdf" });
    mockAddPreviewGenerationJob.mockResolvedValue(undefined);

    const result = await ensurePreview("doc-1", "u1", "application/pdf");
    expect(result.status).toBe("triggered");
    expect(mockAddPreviewGenerationJob).toHaveBeenCalledTimes(1);
  });

  it("returns failed when retries are exhausted", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "failed",
      pdfKey: null,
      isStale: false,
      attempts: 3,
      error: "Max retries exceeded",
    });
    const result = await ensurePreview("doc-1", "u1", "application/pdf");
    expect(result.status).toBe("failed");
  });

  it("returns pending when preview is pending and not stale", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "pending",
      pdfKey: null,
      isStale: false,
      attempts: 0,
    });
    await expect(ensurePreview("doc-1", "u1", "application/pdf")).resolves.toEqual({
      status: "pending",
    });
  });

  it("re-triggers when processing state is stale", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "processing",
      pdfKey: null,
      isStale: true,
      attempts: 2,
    });
    mockFindUnique.mockResolvedValue({ filename: "doc.pdf" });
    mockAddPreviewGenerationJob.mockResolvedValue(undefined);

    const result = await ensurePreview("doc-1", "u1", "application/pdf");
    expect(result).toEqual({ status: "triggered" });
    expect(mockAddPreviewGenerationJob).toHaveBeenCalledTimes(1);
  });

  it("triggers when status is missing", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: null,
      pdfKey: null,
      isStale: false,
      attempts: 0,
    });
    mockFindUnique.mockResolvedValue({ filename: "doc.pdf" });
    mockAddPreviewGenerationJob.mockResolvedValue(undefined);

    await expect(ensurePreview("doc-1", "u1", "application/pdf")).resolves.toEqual({
      status: "triggered",
    });
  });

  it("fails closed with default message when retries are exhausted without explicit error", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "failed",
      pdfKey: null,
      isStale: false,
      attempts: 8,
      error: "",
    });
    await expect(ensurePreview("doc-1", "u1", "application/pdf")).resolves.toEqual({
      status: "failed",
      error: "Max retries exceeded",
    });
  });

  it("returns triggered even when queue scheduling throws", async () => {
    const { ensurePreview } = await import("./previewOrchestrator.service");
    mockNeedsPreviewPdfGeneration.mockReturnValue(true);
    mockGetPreviewPdfStatus.mockResolvedValue({
      status: "failed",
      pdfKey: null,
      isStale: false,
      attempts: 1,
      error: "temporary",
    });
    mockFindUnique.mockRejectedValue(new Error("db down"));
    mockAddPreviewGenerationJob.mockRejectedValue(new Error("queue down"));
    await expect(ensurePreview("doc-1", "u1", "application/pdf")).resolves.toEqual({
      status: "triggered",
      error: "temporary",
    });
  });
});
