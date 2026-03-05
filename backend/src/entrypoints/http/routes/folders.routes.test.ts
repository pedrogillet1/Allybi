import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("folders.routes visibility guard", () => {
  const root = process.cwd();

  test("download query uses canonical visibility filter", () => {
    const source = readFileSync(
      join(root, "src", "entrypoints", "http", "routes", "folders.routes.ts"),
      "utf8",
    );

    expect(source).toContain("VISIBLE_DOCUMENT_FILTER");
    expect(source).toContain("...VISIBLE_DOCUMENT_FILTER");
  });
});
