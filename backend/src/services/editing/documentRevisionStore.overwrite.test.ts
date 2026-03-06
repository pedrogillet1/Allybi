import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockUploadFile = jest.fn();
const mockDownloadFile = jest.fn();
const mockCreateRevision = jest.fn();

jest.mock("../../config/storage", () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
  downloadFile: (...args: any[]) => mockDownloadFile(...args),
}));

jest.mock("../cache.service", () => ({
  __esModule: true,
  default: { del: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("../../queues/document.queue", () => ({
  addDocumentJob: jest.fn(),
  processDocumentJobData: jest.fn(),
}));

jest.mock("../jobs/pubsubPublisher.service", () => ({
  isPubSubAvailable: jest.fn(() => false),
  publishExtractJob: jest.fn(),
}));

jest.mock("../documents/revision.service", () => ({
  __esModule: true,
  RevisionService: jest.fn().mockImplementation(() => ({
    createRevision: (...args: any[]) => mockCreateRevision(...args),
  })),
  default: jest.fn().mockImplementation(() => ({
    createRevision: (...args: any[]) => mockCreateRevision(...args),
  })),
}));

import { DocumentRevisionStoreService } from "./documentRevisionStore.service";

describe("DocumentRevisionStoreService overwrite safety", () => {
  const makeService = () =>
    new DocumentRevisionStoreService({
      revisionService: { createRevision: mockCreateRevision } as any,
      docxEditor: {} as any,
      slidesClient: {} as any,
      slidesEditor: {} as any,
      sheetsBridge: {} as any,
      spreadsheetEngine: {} as any,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.KODA_EDITING_SAVE_MODE = "overwrite";
    process.env.KODA_EDITING_ENABLE_OVERWRITE = "true";
    process.env.KODA_EDITING_ALLOW_OVERWRITE_PROTECTED = "true";
    process.env.NODE_ENV = "test";
  });

  test("storeEditedBuffer is globally disabled and always rejects", async () => {
    const service = makeService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/OVERWRITE_DISABLED/i);
  });

  test("storeEditedBuffer does not perform side effects when disabled", async () => {
    const service = makeService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/OVERWRITE_DISABLED/i);

    expect(mockCreateRevision).not.toHaveBeenCalled();
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  test("storeEditedBuffer remains disabled in protected environments", async () => {
    process.env.NODE_ENV = "production";
    const service = makeService();

    await expect(
      service.storeEditedBuffer({
        documentId: "doc-123",
        userId: "user-456",
        editedBuffer: Buffer.from("edited bytes"),
        operator: "EXPORT_SLIDES",
      }),
    ).rejects.toThrow(/OVERWRITE_DISABLED/i);
  });
});
