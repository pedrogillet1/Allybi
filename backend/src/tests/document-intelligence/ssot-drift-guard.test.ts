import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import glob from "glob";

const BANKS_ROOT = path.resolve(__dirname, "../../../data_banks");

describe("SSOT drift guard", () => {
  it("no logical bank ID appears at more than one file path", () => {
    const files = glob.sync("**/*.any.json", {
      cwd: BANKS_ROOT,
      ignore: ["_deprecated/**", ".compiled/**"],
      absolute: true,
    });

    const idToFiles = new Map<string, string[]>();

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        const id = raw?._meta?.id ?? raw?.bankId;
        if (typeof id !== "string") continue;

        // Normalize: strip hash suffixes like _v440f0106
        const normalizedId = id.replace(/_v[0-9a-f]{6,}$/, "");

        const rel = path.relative(BANKS_ROOT, file).replace(/\\/g, "/");
        const existing = idToFiles.get(normalizedId) || [];
        existing.push(rel);
        idToFiles.set(normalizedId, existing);
      } catch {
        // skip non-JSON or malformed
      }
    }

    const duplicates: Array<{ id: string; files: string[] }> = [];
    for (const [id, files] of idToFiles) {
      if (files.length > 1) {
        duplicates.push({ id, files });
      }
    }

    expect(duplicates, `SSOT violations found:\n${JSON.stringify(duplicates, null, 2)}`).toEqual([]);
  });
});
