import { describe, expect, test } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

const SERVICE_PATH = path.resolve(__dirname, "embedding.service.ts");

describe("Embedding model defaults", () => {
  test("default model is text-embedding-3-large in source code", () => {
    const source = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(source).toContain('"text-embedding-3-large"');
    expect(source).not.toContain('"text-embedding-3-small"');
  });

  test("dimensions default remains 1536 for backwards compatibility", () => {
    const source = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(source).toMatch(/OPENAI_EMBEDDING_DIMENSIONS\s*\|\|\s*1536/);
  });
});
