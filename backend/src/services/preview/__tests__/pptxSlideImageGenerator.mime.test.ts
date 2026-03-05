jest.mock("pdf-to-png-converter", () => ({
  pdfToPng: jest.fn(),
}));

jest.mock("../../../config/storage", () => ({
  downloadFile: jest.fn(),
  uploadFile: jest.fn(),
  fileExists: jest.fn(),
  getSignedUrl: jest.fn(),
}));

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: { findUnique: jest.fn() },
    documentMetadata: { upsert: jest.fn() },
  },
}));

import { needsSlideImageGeneration } from "../pptxSlideImageGenerator.service";

describe("needsSlideImageGeneration mime handling", () => {
  it("treats uppercase parameterized PPTX mime as PPTX", () => {
    const out = needsSlideImageGeneration(
      "APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.PRESENTATIONML.PRESENTATION; charset=binary",
      null,
      null,
    );
    expect(out).toBe(true);
  });

  it("returns false for non-PPTX mime", () => {
    const out = needsSlideImageGeneration(
      "application/pdf",
      null,
      null,
    );
    expect(out).toBe(false);
  });
});
