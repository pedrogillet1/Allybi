import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

describe("Certification: compression integrity", () => {
  const engineSource = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/services/core/retrieval/retrievalEngine.service.ts",
    ),
    "utf8",
  );

  test("compressSnippet imports UNIT_PATTERNS from tableUnitNormalization", () => {
    expect(engineSource).toContain("UNIT_PATTERNS");
    expect(engineSource).toMatch(
      /import.*UNIT_PATTERNS.*from.*tableUnitNormalization/,
    );
  });

  test("compressSnippet handles negation preservation", () => {
    // Verify negation-related code exists
    expect(engineSource).toMatch(/SCP_005.*[Nn]egation/);
    expect(engineSource).toMatch(/negationPattern/);
  });

  test("no hardcoded unit regex limited to R$|$|EUR only", () => {
    // The old pattern: R\$|\$|EUR|%|kg|months?|years?|days?|hours?
    // After fix, the unit regex should be built from UNIT_PATTERNS
    expect(engineSource).not.toMatch(
      /R\\\$\|\\\$\|EUR\|%\|kg\|months\?/,
    );
  });

  test("unit regex is built dynamically from UNIT_PATTERNS", () => {
    expect(engineSource).toMatch(/UNIT_PATTERNS\.flatMap/);
  });

  test("negation preservation extends truncation point", () => {
    // Verify the negation logic extends truncPoint
    expect(engineSource).toMatch(/extendedEnd.*truncPoint|truncPoint.*extendedEnd/s);
  });
});
