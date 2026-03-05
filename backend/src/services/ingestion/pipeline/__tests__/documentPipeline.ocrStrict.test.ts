import { beforeEach, describe, expect, jest, test } from "@jest/globals";

process.env.PIPELINE_MAX_RSS_MB = "16384";

const mockDownloadFile = jest.fn();
const mockDocumentUpdate = jest.fn();
const mockDocumentFindUnique = jest.fn();
const mockExtractText = jest.fn();
const mockStoreEmbeddings = jest.fn();
const mockRunEncryptionStep = jest.fn();
const mockValidateFileHeader = jest.fn();

jest.mock("../../../../config/storage", () => ({
  downloadFile: (...args: any[]) => mockDownloadFile(...args),
}));

jest.mock("../../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      update: (...args: any[]) => mockDocumentUpdate(...args),
      findUnique: (...args: any[]) => mockDocumentFindUnique(...args),
    },
  },
}));

jest.mock("../../extraction/extractionDispatch.service", () => {
  const actual = jest.requireActual("../../extraction/extractionDispatch.service");
  return {
    ...actual,
    extractText: (...args: any[]) => mockExtractText(...args),
  };
});

jest.mock("../../../retrieval/vectorEmbedding.runtime.service", () => ({
  __esModule: true,
  default: {
    storeDocumentEmbeddings: (...args: any[]) => mockStoreEmbeddings(...args),
  },
}));

jest.mock("../encryptionStep.service", () => ({
  runEncryptionStep: (...args: any[]) => mockRunEncryptionStep(...args),
}));

jest.mock("../../fileValidator.service", () => ({
  __esModule: true,
  default: {
    validateFileHeader: (...args: any[]) => mockValidateFileHeader(...args),
  },
}));

import {
  processDocumentAsync,
  resolveStrictPdfOcrRequired,
} from "../documentPipeline.service";

describe("processDocumentAsync strict OCR policy", () => {
  beforeEach(() => {
    mockDownloadFile.mockReset().mockResolvedValue(Buffer.from("fake pdf bytes"));
    mockDocumentUpdate.mockReset().mockResolvedValue({});
    mockDocumentFindUnique.mockReset().mockResolvedValue({ parentVersionId: null });
    mockExtractText.mockReset();
    mockStoreEmbeddings.mockReset().mockResolvedValue({});
    mockRunEncryptionStep.mockReset().mockResolvedValue(undefined);
    mockValidateFileHeader.mockReset().mockReturnValue({ isValid: true });
    process.env.STRICT_PDF_OCR_REQUIRED = "true";
  });

  test("skips weak PDF when OCR was required but unavailable", async () => {
    mockExtractText.mockResolvedValue({
      sourceType: "pdf",
      text: "Weak extracted native text that should not be trusted.",
      confidence: 0.3,
      wordCount: 9,
      pageCount: 1,
      pages: [{ page: 1, text: "Weak extracted native text that should not be trusted." }],
      ocrApplied: false,
      ocrOutcome: "provider_unavailable",
      weakTextReasons: ["low_chars_per_page"],
    });

    const out = await processDocumentAsync(
      "doc-1",
      "users/u1/docs/doc-1/file.pdf",
      "file.pdf",
      "application/pdf",
      "user-1",
      null,
    );

    expect(out.skipped).toBe(true);
    expect(out.skipCode).toBe("OCR_REQUIRED_UNAVAILABLE");
    expect(out.ocrOutcome).toBe("provider_unavailable");
    expect(out.extractionWarningCodes).toEqual(
      expect.arrayContaining([
        "low_chars_per_page",
        "ocr_required_unavailable",
      ]),
    );
    expect(mockStoreEmbeddings).not.toHaveBeenCalled();
    expect(mockRunEncryptionStep).not.toHaveBeenCalled();
  }, 15000);

  test("applies strict OCR gate for parameterized PDF mime types", async () => {
    mockExtractText.mockResolvedValue({
      sourceType: "pdf",
      text: "Weak extracted native text that should not be trusted.",
      confidence: 0.3,
      wordCount: 9,
      pageCount: 1,
      pages: [{ page: 1, text: "Weak extracted native text that should not be trusted." }],
      ocrApplied: false,
      ocrOutcome: "provider_unavailable",
      weakTextReasons: ["low_chars_per_page"],
    });

    const out = await processDocumentAsync(
      "doc-1",
      "users/u1/docs/doc-1/file.pdf",
      "file.pdf",
      "Application/PDF; charset=binary",
      "user-1",
      null,
    );

    expect(out.skipped).toBe(true);
    expect(out.skipCode).toBe("OCR_REQUIRED_UNAVAILABLE");
    expect(out.extractionMethod).toBe("pdf_text");
    expect(mockStoreEmbeddings).not.toHaveBeenCalled();
    expect(mockRunEncryptionStep).not.toHaveBeenCalled();
  }, 15000);

  test("forces strict OCR policy in production/staging even when env tries to disable it", () => {
    expect(resolveStrictPdfOcrRequired("false", "production")).toBe(true);
    expect(resolveStrictPdfOcrRequired("false", "staging")).toBe(true);
    expect(resolveStrictPdfOcrRequired("false", "development")).toBe(false);
    expect(resolveStrictPdfOcrRequired(undefined, "test")).toBe(true);
  });
});
