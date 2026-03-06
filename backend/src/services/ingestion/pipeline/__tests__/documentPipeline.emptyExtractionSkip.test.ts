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

import { processDocumentAsync } from "../documentPipeline.service";

describe("processDocumentAsync empty extraction taxonomy", () => {
  beforeEach(() => {
    mockDownloadFile.mockReset().mockResolvedValue(Buffer.from("fake bytes"));
    mockDocumentUpdate.mockReset().mockResolvedValue({});
    mockDocumentFindUnique.mockReset().mockResolvedValue({ parentVersionId: null });
    mockExtractText.mockReset();
    mockStoreEmbeddings.mockReset().mockResolvedValue({});
    mockRunEncryptionStep.mockReset().mockResolvedValue(undefined);
    mockValidateFileHeader.mockReset().mockReturnValue({ isValid: true });
    process.env.STRICT_PDF_OCR_REQUIRED = "true";
  });

  test.each([
    {
      name: "pdf",
      mimeType: "application/pdf",
      expectedCode: "PDF_TEXT_EMPTY",
      expectedReasonPart: "Unable to extract text from PDF",
      extraction: {
        sourceType: "pdf",
        text: "",
        confidence: 0.95,
        wordCount: 0,
        pageCount: 1,
        pages: [{ page: 1, text: "" }],
      },
    },
    {
      name: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      expectedCode: "DOCX_TEXT_EMPTY",
      expectedReasonPart: "Unable to extract text from DOCX",
      extraction: {
        sourceType: "docx",
        text: "",
        confidence: 0.95,
        wordCount: 0,
        sections: [],
      },
    },
    {
      name: "xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      expectedCode: "XLSX_TEXT_EMPTY",
      expectedReasonPart: "Unable to extract text from XLSX",
      extraction: {
        sourceType: "xlsx",
        text: "",
        confidence: 0.95,
        wordCount: 0,
        sheetCount: 1,
        sheets: [],
      },
    },
    {
      name: "pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      expectedCode: "PPTX_TEXT_EMPTY",
      expectedReasonPart: "Unable to extract text from PPTX",
      extraction: {
        sourceType: "pptx",
        text: "",
        confidence: 0.95,
        wordCount: 0,
        slideCount: 1,
        slides: [],
      },
    },
    {
      name: "plain text",
      mimeType: "text/plain",
      expectedCode: "TEXT_FILE_EMPTY",
      expectedReasonPart: "Text file is empty",
      extraction: {
        sourceType: "text",
        text: "",
        confidence: 1,
        wordCount: 0,
      },
    },
    {
      name: "image visual-only",
      mimeType: "image/png",
      expectedCode: "IMAGE_VISUAL_ONLY",
      expectedReasonPart: "Image saved as visual-only",
      extraction: {
        sourceType: "image",
        text: "",
        confidence: 0,
        wordCount: 0,
        skipped: true,
        skipReason: "Image saved as visual-only (low entropy)",
      },
    },
  ])(
    "returns explicit skip code/reason for $name empty extraction",
    async ({ mimeType, extraction, expectedCode, expectedReasonPart }) => {
      mockExtractText.mockResolvedValue(extraction);

      const out = await processDocumentAsync(
        "doc-1",
        "users/u1/docs/doc-1/file.bin",
        "file.bin",
        mimeType,
        "user-1",
        null,
      );

      expect(out.skipped).toBe(true);
      expect(out.skipCode).toBe(expectedCode);
      expect(out.skipReason).toContain(expectedReasonPart);
      expect(mockStoreEmbeddings).not.toHaveBeenCalled();
      expect(mockRunEncryptionStep).not.toHaveBeenCalled();
    },
  );
});
