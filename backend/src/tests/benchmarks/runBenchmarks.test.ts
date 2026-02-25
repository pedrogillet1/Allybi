import fs from "fs";
import path from "path";

import { describe, expect, test } from "@jest/globals";

function readJsonl(filePath: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("Benchmark harness registry", () => {
  test("all benchmark jsonl files are parseable and have unique ids", () => {
    const benchDir = path.resolve(process.cwd(), "src/tests/benchmarks");
    const files = fs
      .readdirSync(benchDir)
      .filter((name) => name.endsWith(".jsonl"))
      .sort();

    const allIds = new Set<string>();
    for (const file of files) {
      const rows = readJsonl(path.join(benchDir, file));
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const id = String(row.id || "").trim();
        expect(id.length).toBeGreaterThan(0);
        expect(allIds.has(id)).toBe(false);
        allIds.add(id);
      }
    }
  });
});
