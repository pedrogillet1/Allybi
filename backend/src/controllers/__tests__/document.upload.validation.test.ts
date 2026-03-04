/**
 * Upload validation tests for FileValidator.
 *
 * We mock UPLOAD_CONFIG to avoid env.ts AWS guard during testing.
 */

jest.mock("../../config/upload.config", () => ({
  UPLOAD_CONFIG: {
    MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  },
}));

jest.mock("xlsx", () => ({ read: jest.fn(), utils: { sheet_to_txt: jest.fn() } }));
jest.mock("mammoth", () => ({ extractRawText: jest.fn() }));

import fileValidator from "../../services/ingestion/fileValidator.service";

describe("Upload validation integration", () => {
  it("rejects a zero-byte file with FILE_EMPTY error code", () => {
    const result = fileValidator.validateFileHeader(
      Buffer.alloc(0),
      "application/pdf",
    );
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("FILE_EMPTY");
  });

  it("rejects a file with mismatched magic bytes", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content padding bytes here");
    const result = fileValidator.validateFileHeader(
      pdfBuffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("HEADER_MISMATCH");
  });

  it("accepts a valid PDF header", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content padding bytes here");
    const result = fileValidator.validateFileHeader(
      pdfBuffer,
      "application/pdf",
    );
    expect(result.isValid).toBe(true);
  });

  it("rejects a tiny file (< 10 bytes) as corrupted", () => {
    const result = fileValidator.validateFileHeader(
      Buffer.from("hello"),
      "application/pdf",
    );
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("FILE_CORRUPTED");
  });

  it("accepts text files without magic byte check", () => {
    const result = fileValidator.validateFileHeader(
      Buffer.from("Hello world"),
      "text/plain",
    );
    expect(result.isValid).toBe(true);
  });
});
