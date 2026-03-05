import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock declarations (before imports)
// ---------------------------------------------------------------------------

let capturedProcessor: ((job: any) => Promise<any>) | null = null;

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    return {
      on: jest.fn(),
      close: jest.fn(),
    };
  }),
}));

const mockDocFindMany = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: any[]) => mockDocFindMany(...args),
    },
    ingestionEvent: {
      create: jest.fn().mockReturnValue({ catch: jest.fn() }),
    },
  },
}));

jest.mock("../../config/env", () => ({
  config: {
    USE_GCP_WORKERS: false,
  },
}));

const mockResetToUploadedOrFail = jest.fn();

jest.mock("../../services/documents/documentStateManager.service", () => ({
  __esModule: true,
  documentStateManager: {
    resetToUploadedOrFail: (...args: any[]) => mockResetToUploadedOrFail(...args),
  },
  default: {
    resetToUploadedOrFail: (...args: any[]) => mockResetToUploadedOrFail(...args),
  },
}));

jest.mock("../../services/jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: jest.fn().mockReturnValue(false),
  publishExtractFanoutJobsBulk: jest.fn(),
}));

const mockAddDocumentJob = jest.fn();
const mockDocumentQueueGetJob = jest.fn();

jest.mock("../queueConfig", () => ({
  connection: {},
  QUEUE_PREFIX: "test:",
  documentQueue: {
    getJob: (...args: any[]) => mockDocumentQueueGetJob(...args),
  },
  stuckDocSweepQueue: {
    add: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("./jobHelpers.service", () => ({
  addDocumentJob: (...args: any[]) => mockAddDocumentJob(...args),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { startStuckDocSweeper, stopStuckDocSweeper } from "./stuckDocSweeper.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStuckDoc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: "user-1",
    filename: `file-${id}.pdf`,
    mimeType: "application/pdf",
    encryptedFilename: `users/user-1/${id}.pdf`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stuckDocSweeper", () => {
  beforeEach(async () => {
    stopStuckDocSweeper();
    capturedProcessor = null;
    mockDocFindMany.mockReset();
    mockResetToUploadedOrFail.mockReset();
    mockAddDocumentJob.mockReset();
    mockDocumentQueueGetJob.mockReset();

    // Start sweeper to capture the processor
    await startStuckDocSweeper();
    expect(capturedProcessor).not.toBeNull();
  });

  afterEach(() => {
    stopStuckDocSweeper();
  });

  // -----------------------------------------------------------------------
  // 1. Resets enriching docs via documentStateManager.resetToUploadedOrFail
  // -----------------------------------------------------------------------
  test("resets enriching docs via documentStateManager.resetToUploadedOrFail", async () => {
    // No stuck uploaded docs
    mockDocFindMany
      .mockResolvedValueOnce([])
      // One stuck enriching doc
      .mockResolvedValueOnce([makeStuckDoc("doc-stuck-1")]);

    mockResetToUploadedOrFail.mockResolvedValue({
      success: true,
      documentId: "doc-stuck-1",
      fromStatus: "enriching",
      toStatus: "uploaded",
    });

    mockDocumentQueueGetJob.mockResolvedValue(null);
    mockAddDocumentJob.mockResolvedValue({});

    const result = await capturedProcessor!({ id: "job-1" });

    expect(mockResetToUploadedOrFail).toHaveBeenCalledTimes(1);
    expect(mockResetToUploadedOrFail).toHaveBeenCalledWith("doc-stuck-1");
    expect(result.requeued).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 2. Permanently fails docs that exceed max resets (toStatus === "failed")
  // -----------------------------------------------------------------------
  test("permanently fails docs that exceed max resets", async () => {
    mockDocFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuckDoc("doc-maxed")]);

    mockResetToUploadedOrFail.mockResolvedValue({
      success: true,
      documentId: "doc-maxed",
      fromStatus: "enriching",
      toStatus: "failed",
      reason: "Permanent failure: exceeded max sweep resets",
    });

    const result = await capturedProcessor!({ id: "job-2" });

    expect(result.permanentlyFailed).toBe(1);
    expect(result.requeued).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 3. Creates DLQ ingestion event for permanently failed docs
  // -----------------------------------------------------------------------
  test("creates DLQ ingestion event for permanently failed docs", async () => {
    const prisma = (await import("../../config/database")).default;

    mockDocFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuckDoc("doc-dlq")]);

    mockResetToUploadedOrFail.mockResolvedValue({
      success: true,
      documentId: "doc-dlq",
      fromStatus: "enriching",
      toStatus: "failed",
    });

    await capturedProcessor!({ id: "job-3" });

    expect(prisma.ingestionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: "doc-dlq",
          status: "dlq",
          errorCode: "SWEEP_RESET_LIMIT",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 4. Only re-enqueues reset docs, not permanently failed ones
  // -----------------------------------------------------------------------
  test("only re-enqueues reset docs, not permanently failed ones", async () => {
    mockDocFindMany
      .mockResolvedValueOnce([]) // No stuck uploaded
      .mockResolvedValueOnce([
        makeStuckDoc("doc-reset"),
        makeStuckDoc("doc-perm-fail"),
      ]);

    mockResetToUploadedOrFail
      .mockResolvedValueOnce({
        success: true,
        documentId: "doc-reset",
        fromStatus: "enriching",
        toStatus: "uploaded",
      })
      .mockResolvedValueOnce({
        success: true,
        documentId: "doc-perm-fail",
        fromStatus: "enriching",
        toStatus: "failed",
      });

    mockDocumentQueueGetJob.mockResolvedValue(null);
    mockAddDocumentJob.mockResolvedValue({});

    const result = await capturedProcessor!({ id: "job-4" });

    expect(mockAddDocumentJob).toHaveBeenCalledTimes(1);
    expect(mockAddDocumentJob).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-reset",
      }),
    );
    expect(result.requeued).toBe(1);
    expect(result.permanentlyFailed).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 5. Does not re-enqueue docs when reset transition itself fails
  // -----------------------------------------------------------------------
  test("does not re-enqueue docs when reset transition returns success:false", async () => {
    mockDocFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeStuckDoc("doc-transition-fail")]);

    mockResetToUploadedOrFail.mockResolvedValue({
      success: false,
      documentId: "doc-transition-fail",
      fromStatus: "enriching",
      toStatus: "uploaded",
      reason: "CAS failed",
    });

    const result = await capturedProcessor!({ id: "job-5" });

    expect(mockAddDocumentJob).not.toHaveBeenCalled();
    expect(result.requeued).toBe(0);
    expect(result.transitionFailures).toBe(1);
  });
});
