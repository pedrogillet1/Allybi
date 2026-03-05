import fs from "fs";
import path from "path";

const WORKER_FILES = [
  "workers_gcp/extract/index.ts",
  "workers_gcp/embed/index.ts",
  "workers_gcp/ocr/index.ts",
  "workers_gcp/preview/index.ts",
];

describe("Certification: workers_gcp avoids direct document status writes", () => {
  test("worker adapters do not write document.status directly", () => {
    const backendRoot = path.resolve(__dirname, "../../../");

    for (const rel of WORKER_FILES) {
      const source = fs.readFileSync(path.join(backendRoot, rel), "utf8");
      expect(source).not.toMatch(/\.document\.update\s*\(/);
      expect(source).not.toMatch(/status\s*:\s*["']ready["']/i);
    }
  });
});
