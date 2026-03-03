import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

type PatternRow = Record<string, unknown>;

interface PatternBank {
  _meta?: {
    id?: string;
  };
  patterns?: PatternRow[];
  connectors?: PatternRow[];
  rules?: PatternRow[];
  guardrails?: PatternRow[];
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();

const TARGET_FAMILIES: Record<string, string> = {
  core: "patterns/core",
  nav: "patterns/navigation",
  doc_refs: "patterns/doc_refs",
  operators: "patterns/operators",
  domains: "patterns/domains",
  quality: "patterns/quality",
};

function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Cannot locate src/data_banks from candidates: ${candidates.join(",")}`);
}

function walkPatternFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPatternFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".any.json")) {
      files.push(full);
    }
  }
  return files;
}

function readJson(filePath: string): PatternBank {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PatternBank;
}

function getPatternRows(bank: PatternBank): PatternRow[] {
  if (Array.isArray(bank.patterns)) return bank.patterns;
  if (Array.isArray(bank.connectors)) return bank.connectors;
  if (Array.isArray(bank.rules)) return bank.rules;
  if (Array.isArray(bank.guardrails)) return bank.guardrails;
  return [];
}

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasDuplicateValues(values: string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalize(value);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

describe("patternCollision", () => {
  for (const [family, relDir] of Object.entries(TARGET_FAMILIES)) {
    test(`${family}: zero duplicate IDs and bounded phrase collision count`, () => {
      const files = walkPatternFiles(path.join(DATA_BANKS_ROOT, relDir));
      const duplicateRowIds: string[] = [];
      const rowLocaleDuplicates: string[] = [];
      let rowCount = 0;
      let bankCount = 0;

      const phraseSourceByLocale = new Map<string, Set<string>>();
      let crossLocaleCollisionCount = 0;

      for (const filePath of files) {
        const bank = readJson(filePath);
        const bankId = String(bank._meta?.id || "").trim();
        if (!bankId) continue;
        bankCount += 1;

        const rows = getPatternRows(bank);
        const seenIds = new Set<string>();

        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          rowCount += 1;

          const rowId = String(row.id || "").trim();
          if (rowId && seenIds.has(rowId)) {
            duplicateRowIds.push(rowId);
          }
          if (rowId) seenIds.add(rowId);

          const en = Array.isArray(row.en) ? row.en : [];
          const pt = Array.isArray(row.pt) ? row.pt : [];
          if (hasDuplicateValues(en as string[])) rowLocaleDuplicates.push(`${bankId}:${rowId}:en`);
          if (hasDuplicateValues(pt as string[])) rowLocaleDuplicates.push(`${bankId}:${rowId}:pt`);

          for (const locale of ["en", "pt"] as const) {
            const rowsForLocale = Array.isArray(row[locale])
              ? (row[locale] as string[])
              : [];
            for (const rawPhrase of rowsForLocale) {
              const phrase = normalize(rawPhrase);
              if (!phrase) continue;
              const key = `${locale}|${phrase}`;
              const owners = phraseSourceByLocale.get(key) || new Set<string>();
              if (owners.size > 0 && !owners.has(rowId)) {
                crossLocaleCollisionCount += 1;
              }
              if (rowId) owners.add(rowId);
              phraseSourceByLocale.set(key, owners);
            }
          }
        }
      }

      const allowedCollisionCount = Math.max(25, Math.round(rowCount * 2.3));

      expect(duplicateRowIds).toEqual([]);
      expect(rowLocaleDuplicates).toEqual([]);
      expect(crossLocaleCollisionCount).toBeLessThanOrEqual(allowedCollisionCount);

      console.log(
        `[patternCollision] family=${family} banks=${bankCount} rows=${rowCount} collisions=${crossLocaleCollisionCount} allowed=${allowedCollisionCount}`,
      );
    });
  }
});
