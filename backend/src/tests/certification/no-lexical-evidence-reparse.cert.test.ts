import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("Certification: provenance-only source filtering", () => {
  test("dead retrieval module facade stays removed", () => {
    const indexPath = path.resolve(
      process.cwd(),
      "src/modules/retrieval/application/index.ts",
    );
    expect(fs.existsSync(indexPath)).toBe(false);
  });

  test("no runtime file imports lexical evidence reparse helpers", () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const files = walkTsFiles(srcRoot);
    const failures: string[] = [];

    for (const filePath of files) {
      const rel = path.relative(srcRoot, filePath);
      if (rel === "tests/certification/no-lexical-evidence-reparse.cert.test.ts")
        continue;

      const raw = fs.readFileSync(filePath, "utf8");
      if (
        /\bextractUsedDocuments\b/.test(raw) ||
        /\bEvidenceChunkForFiltering\b/.test(raw)
      ) {
        failures.push(rel);
      }
    }

    expect(failures).toEqual([]);
  });

  test("source buttons service does not keep dead lexical helper implementations", () => {
    const sourceButtonsPath = path.resolve(
      process.cwd(),
      "src/services/core/retrieval/sourceButtons.service.ts",
    );
    const raw = fs.readFileSync(sourceButtonsPath, "utf8");
    const forbidden = [
      "extractUsedDocuments",
      "EvidenceChunkForFiltering",
      "extractSpecificPhrases",
      "extractUniqueTerminology",
      "normalizeForMatching",
      "extractSignificantNumbers",
    ];
    for (const symbol of forbidden) {
      expect(raw.includes(symbol)).toBe(false);
    }
  });
});
