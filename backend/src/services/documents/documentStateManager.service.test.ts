import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
      updateMany: (...args: any[]) => mockUpdateMany(...args),
    },
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

import { documentStateManager } from "./documentStateManager.service";

describe("documentStateManager", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockUpdateMany.mockReset();
  });

  // -----------------------------------------------------------------------
  // 1. Valid transition (uploaded -> enriching)
  // -----------------------------------------------------------------------
  test("valid transition (uploaded -> enriching) succeeds", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await documentStateManager.transition(
      "doc-1",
      "uploaded",
      "enriching",
    );

    expect(result.success).toBe(true);
    expect(result.documentId).toBe("doc-1");
    expect(result.fromStatus).toBe("uploaded");
    expect(result.toStatus).toBe("enriching");
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-1", status: "uploaded" },
        data: expect.objectContaining({
          status: "enriching",
          indexingState: "running",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 2. Invalid transition (uploaded -> ready)
  // -----------------------------------------------------------------------
  test("invalid transition (uploaded -> ready) returns success:false", async () => {
    const result = await documentStateManager.transition(
      "doc-1",
      "uploaded",
      "ready",
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("not allowed");
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. CAS failure (updateMany returns count:0)
  // -----------------------------------------------------------------------
  test("CAS failure (updateMany returns count:0) returns success:false", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await documentStateManager.transition(
      "doc-1",
      "uploaded",
      "enriching",
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("CAS failed");
  });

  // -----------------------------------------------------------------------
  // 4. deriveIndexingState maps correctly
  // -----------------------------------------------------------------------
  test("deriveIndexingState maps correctly via transition data", async () => {
    // uploaded -> enriching sets indexingState = running
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await documentStateManager.transition("doc-1", "uploaded", "enriching");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexingState: "running" }),
      }),
    );

    // enriching -> indexed sets indexingState = indexed
    mockUpdateMany.mockClear();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await documentStateManager.transition("doc-2", "enriching", "indexed", {
      chunksCount: 5,
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexingState: "indexed" }),
      }),
    );

    // enriching -> failed sets indexingState = failed
    mockUpdateMany.mockClear();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await documentStateManager.transition("doc-3", "enriching", "failed", {
      error: "boom",
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexingState: "failed" }),
      }),
    );

    // uploading -> uploaded sets indexingState = pending
    mockUpdateMany.mockClear();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await documentStateManager.transition("doc-4", "uploading", "uploaded");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ indexingState: "pending" }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 5. claimForEnrichment calls transition with correct args
  // -----------------------------------------------------------------------
  test("claimForEnrichment calls transition with correct args", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await documentStateManager.claimForEnrichment("doc-99");

    expect(result.success).toBe(true);
    expect(result.fromStatus).toBe("uploaded");
    expect(result.toStatus).toBe("enriching");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-99", status: "uploaded" },
        data: expect.objectContaining({
          status: "enriching",
          indexingState: "running",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 6. resetToUploadedOrFail increments sweepResetCount when below max
  // -----------------------------------------------------------------------
  test("resetToUploadedOrFail increments sweepResetCount when below max", async () => {
    mockFindUnique.mockResolvedValue({ sweepResetCount: 2, status: "enriching" });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await documentStateManager.resetToUploadedOrFail("doc-1");

    expect(result.success).toBe(true);
    expect(result.toStatus).toBe("uploaded");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "uploaded",
          sweepResetCount: { increment: 1 },
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 7. resetToUploadedOrFail transitions to failed when at max resets
  // -----------------------------------------------------------------------
  test("resetToUploadedOrFail transitions to failed when at max resets", async () => {
    const maxResets = parseInt(process.env.SWEEP_MAX_RESETS || "5", 10);
    mockFindUnique.mockResolvedValue({
      sweepResetCount: maxResets,
      status: "enriching",
    });
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await documentStateManager.resetToUploadedOrFail("doc-1");

    expect(result.toStatus).toBe("failed");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          indexingState: "failed",
        }),
      }),
    );
  });

  // -----------------------------------------------------------------------
  // 8. markFailed truncates error to 500 chars
  // -----------------------------------------------------------------------
  test("markFailed truncates error to 500 chars", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const longError = "x".repeat(1000);

    await documentStateManager.markFailed("doc-1", "enriching", longError);

    const callData = mockUpdateMany.mock.calls[0]?.[0] as any;
    expect(callData.data.indexingError).toHaveLength(500);
    expect(callData.data.error).toHaveLength(500);
  });

  // -----------------------------------------------------------------------
  // 9. markReadyWithoutContent sets chunksCount:0
  // -----------------------------------------------------------------------
  test("markReadyWithoutContent sets chunksCount:0", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await documentStateManager.markReadyWithoutContent("doc-1");

    expect(result.success).toBe(true);
    expect(result.toStatus).toBe("ready");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ready",
          chunksCount: 0,
        }),
      }),
    );
  });
});
