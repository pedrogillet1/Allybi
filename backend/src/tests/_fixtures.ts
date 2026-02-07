import fs from "fs";
import path from "path";

/**
 * Ensures fixtures exist for tests.
 * We generate binary fixtures using a Node script (committed in repo) to avoid hand-editing zip bytes.
 */
export function ensureFixtures(): { fixturesDir: string } {
  const fixturesDir = path.join(__dirname, "fixtures");
  const expected = [
    path.join(fixturesDir, "sample.docx"),
    path.join(fixturesDir, "sample.xlsx"),
    path.join(fixturesDir, "sample.pptx"),
  ];

  const missing = expected.filter((p) => !fs.existsSync(p));
  if (missing.length === 0) return { fixturesDir };

  // Lazy generate via the committed script.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require(path.join(fixturesDir, "_generate-fixtures.cjs"));

  const stillMissing = expected.filter((p) => !fs.existsSync(p));
  if (stillMissing.length) {
    throw new Error(`Test fixtures missing: ${stillMissing.map((p) => path.basename(p)).join(", ")}`);
  }
  return { fixturesDir };
}
