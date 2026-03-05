import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DocumentRevisionStore chunk lifecycle policy", () => {
  test("uses deactivation instead of destructive chunk deletion during reindex resets", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "services", "editing", "documentRevisionStore.service.ts"),
      "utf8",
    );

    expect(source).toContain("documentChunk.updateMany");
    expect(source).not.toContain("documentChunk.deleteMany({ where: { documentId:");
  });
});

