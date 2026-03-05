import fs from "fs";
import path from "path";

describe("Certification: ingestion MIME SSOT wiring", () => {
  test("upload, extraction dispatch, and preview rely on ingestionMimeRegistry", () => {
    const root = path.resolve(__dirname, "../../");

    const uploadSrc = fs.readFileSync(
      path.join(root, "middleware/upload.middleware.ts"),
      "utf8",
    );
    const dispatchSrc = fs.readFileSync(
      path.join(
        root,
        "services/ingestion/extraction/extractionDispatch.service.ts",
      ),
      "utf8",
    );
    const previewSrc = fs.readFileSync(
      path.join(root, "services/preview/previewPdfGenerator.service.ts"),
      "utf8",
    );

    expect(uploadSrc).toContain("ingestionMimeRegistry.service");
    expect(uploadSrc).toContain("isMimeTypeSupportedForExtraction");

    expect(dispatchSrc).toContain("ingestionMimeRegistry.service");
    expect(dispatchSrc).toContain("normalizeMimeType");

    expect(previewSrc).toContain("ingestionMimeRegistry.service");
    expect(previewSrc).toContain("needsPreviewPdfGenerationForMime");
    expect(previewSrc).toContain("getPreferredExtensionForMime");
    expect(previewSrc).not.toContain("const extMap: Record<string, string>");
  });
});
