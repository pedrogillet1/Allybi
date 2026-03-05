import fs from "fs";
import path from "path";

describe("Certification: workers_gcp extract uses canonical ingestion pipeline", () => {
  test("extract worker delegates to runDocumentIngestionPipeline with preview+ready enabled", () => {
    const backendRoot = path.resolve(__dirname, "../../../");
    const source = fs.readFileSync(
      path.join(backendRoot, "workers_gcp/extract/index.ts"),
      "utf8",
    );

    expect(source).toContain("runDocumentIngestionPipeline");
    expect(source).toContain("handlePreviewAndReady: true");

    expect(source).not.toContain("./extractors");
    expect(source).not.toContain("publishEmbedJob");
    expect(source).not.toContain("publishPreviewJob");
    expect(source).not.toContain("publishOcrJob");
  });
});
