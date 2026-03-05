import {
  getPreferredExtensionForMime,
  needsPreviewPdfGenerationForMime,
  isMimeTypeSupportedForExtraction,
  isPptxMime,
  normalizeMimeType,
} from "../ingestionMimeRegistry.service";

describe("ingestionMimeRegistry", () => {
  test("normalizes mime type before matching", () => {
    expect(normalizeMimeType(" Application/PDF ")).toBe("application/pdf");
    expect(isMimeTypeSupportedForExtraction(" Application/PDF ")).toBe(true);
  });

  test("normalizes mime parameters before matching", () => {
    expect(normalizeMimeType(" Application/PDF ; charset=binary ")).toBe(
      "application/pdf",
    );
    expect(
      isMimeTypeSupportedForExtraction(" Application/PDF ; charset=binary "),
    ).toBe(true);
  });

  test("detects PPTX mime with uppercase + parameters", () => {
    expect(
      isPptxMime(
        "APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.PRESENTATIONML.PRESENTATION; charset=binary",
      ),
    ).toBe(true);
  });

  test("supports core extraction mime families", () => {
    expect(isMimeTypeSupportedForExtraction("application/pdf")).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe(true);
    expect(isMimeTypeSupportedForExtraction("image/png")).toBe(true);
    expect(isMimeTypeSupportedForExtraction("text/csv")).toBe(true);
    expect(isMimeTypeSupportedForExtraction("message/rfc822")).toBe(true);
    expect(
      isMimeTypeSupportedForExtraction("application/x-slack-message"),
    ).toBe(true);
  });

  test("uses the same office registry for preview conversion checks", () => {
    expect(
      needsPreviewPdfGenerationForMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(
      needsPreviewPdfGenerationForMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(
      needsPreviewPdfGenerationForMime(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe(true);
    expect(needsPreviewPdfGenerationForMime("application/pdf")).toBe(false);
  });

  test("returns preferred extension from canonical mime registry", () => {
    expect(
      getPreferredExtensionForMime(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe(".pptx");
    expect(getPreferredExtensionForMime("application/msword")).toBe(".doc");
    expect(getPreferredExtensionForMime("application/unknown")).toBe("");
  });
});
