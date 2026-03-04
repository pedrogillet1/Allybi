/**
 * Pipeline pre-extraction validation tests.
 *
 * Mock UPLOAD_CONFIG to avoid env.ts AWS guard.
 */

jest.mock("../../../../config/upload.config", () => ({
  UPLOAD_CONFIG: {
    MAX_FILE_SIZE_BYTES: 500 * 1024 * 1024,
  },
}));

jest.mock("xlsx", () => ({ read: jest.fn(), utils: { sheet_to_txt: jest.fn() } }));
jest.mock("mammoth", () => ({ extractRawText: jest.fn() }));

import fileValidator from "../../fileValidator.service";

describe("Pipeline pre-extraction validation", () => {
  it("validateFileHeader rejects corrupted ZIP-based file", () => {
    const corruptDocx = Buffer.from("CORRUPT DATA NOT A REAL DOCX FILE!!");
    const result = fileValidator.validateFileHeader(
      corruptDocx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("HEADER_MISMATCH");
  });

  it("validateFileHeader accepts valid ZIP-based file", () => {
    const validDocx = Buffer.alloc(100);
    validDocx[0] = 0x50; // P
    validDocx[1] = 0x4b; // K
    validDocx[2] = 0x03;
    validDocx[3] = 0x04;
    const result = fileValidator.validateFileHeader(
      validDocx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.isValid).toBe(true);
  });
});
