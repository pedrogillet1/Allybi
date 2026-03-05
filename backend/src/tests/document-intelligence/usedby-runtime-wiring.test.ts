import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@jest/globals";

const DATA_BANKS_ROOT = path.resolve(__dirname, "../../data_banks");
const SRC_ROOT = path.resolve(__dirname, "../..");
const QUALITY_DOCINT_ROOT = path.join(
  DATA_BANKS_ROOT,
  "quality/document_intelligence",
);

describe("quality/document_intelligence usedBy runtime proof", () => {
  it("every usedBy target exists; planner-linked banks must reference the bank id", () => {
    const failures: string[] = [];
    const files = fs
      .readdirSync(QUALITY_DOCINT_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".any.json"))
      .map((entry) => path.join(QUALITY_DOCINT_ROOT, entry.name));

    for (const bankPath of files) {
      const raw = JSON.parse(fs.readFileSync(bankPath, "utf-8"));
      const id = String(raw?._meta?.id || "").trim();
      const usedBy = Array.isArray(raw?._meta?.usedBy) ? raw._meta.usedBy : [];
      if (!id) {
        failures.push(`${path.basename(bankPath)}: missing _meta.id`);
        continue;
      }

      for (const rel of usedBy) {
        const relPath = String(rel || "").trim();
        if (!relPath) {
          failures.push(`${id}: empty _meta.usedBy entry`);
          continue;
        }
        const fullPath = path.join(SRC_ROOT, relPath);
        if (!fs.existsSync(fullPath)) {
          failures.push(`${id}: usedBy target missing: ${relPath}`);
          continue;
        }

        if (relPath.includes("bankSelectionPlanner.service.ts")) {
          const src = fs.readFileSync(fullPath, "utf-8");
          if (!src.includes(id)) {
            failures.push(`${id}: usedBy target does not reference id: ${relPath}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
