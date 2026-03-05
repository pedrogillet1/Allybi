import fs from "fs";
import path from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (entry.isFile() && abs.endsWith(".ts")) {
      out.push(abs);
    }
  }
  return out;
}

describe("Certification: no markReadyWithoutContent usage in runtime ingestion paths", () => {
  test("markReadyWithoutContent is only defined/tested, not called by runtime code", () => {
    const root = path.resolve(__dirname, "../../");
    const files = walk(root);
    const violations: string[] = [];

    for (const abs of files) {
      const rel = path
        .relative(root, abs)
        .replace(/\\/g, "/");
      if (
        rel.endsWith("services/documents/documentStateManager.service.ts") ||
        rel.endsWith("services/documents/documentStateManager.service.test.ts") ||
        rel.endsWith("tests/certification/ingestion-no-ready-without-content.cert.test.ts")
      ) {
        continue;
      }

      const src = fs.readFileSync(abs, "utf8");
      if (src.includes("markReadyWithoutContent(")) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });
});
