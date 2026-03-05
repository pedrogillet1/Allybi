import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

type PatternRow = Record<string, unknown>;

interface PatternBank {
  _meta?: {
    id?: string;
  };
  config?: Record<string, unknown>;
  patterns?: PatternRow[];
  mappings?: PatternRow[];
  connectors?: PatternRow[];
  rules?: PatternRow[];
  guardrails?: PatternRow[];
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();

const FAMILY_PATHS: Record<string, string> = {
  core: "patterns/core",
  navigation: "patterns/navigation",
  doc_refs: "patterns/doc_refs",
  operators: "patterns/operators",
  domains: "patterns/domains",
  quality: "patterns/quality",
  ui: "patterns/ui",
};

const ALLOWLIST_MISSING_META_FILES = new Set<string>([
  "patterns/domains/accounting/aging_report_patterns.any.json",
  "patterns/domains/accounting/gl_export_patterns.any.json",
  "patterns/domains/accounting/journal_entry_patterns.any.json",
  "patterns/domains/accounting/reconciliation_patterns.any.json",
  "patterns/domains/accounting/trial_balance_patterns.any.json",
]);

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
  if (Array.isArray(bank.mappings)) return bank.mappings;
  if (Array.isArray(bank.connectors)) return bank.connectors;
  if (Array.isArray(bank.rules)) return bank.rules;
  if (Array.isArray(bank.guardrails)) return bank.guardrails;
  return [];
}

function hasDuplicateValues(values: string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = String(value || "").trim();
    if (key.length === 0) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function isSortedById(rows: PatternRow[]): boolean {
  const ids = rows.map((row) => String(row.id || "").trim());
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  return ids.every((id, index) => id === sorted[index]);
}

describe("patternDeterminism", () => {
  for (const [family, relDir] of Object.entries(FAMILY_PATHS)) {
    test(`${family}: sorted ids, unique row ids, and locale dedupe`, () => {
      const dir = path.join(DATA_BANKS_ROOT, relDir);
      const files = walkPatternFiles(dir);
      const filesWithMissingMeta: string[] = [];
      const filesWithMissingRowIds: string[] = [];
      const unsortedBanks: string[] = [];
      const duplicateIds: string[] = [];
      const rowLocaleDupes: string[] = [];

      const rowCount = files.reduce((acc, filePath) => {
        const bank = readJson(filePath);
        const relPath = path.relative(DATA_BANKS_ROOT, filePath);
        if (ALLOWLIST_MISSING_META_FILES.has(relPath)) {
          return acc;
        }
        const bankId = String(bank._meta?.id || "").trim();
        const rows = getPatternRows(bank);

        if (!bankId) {
          filesWithMissingMeta.push(path.relative(DATA_BANKS_ROOT, filePath));
          return acc;
        }

        const seen = new Set<string>();
        const rowIds: string[] = [];
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const rowId = String(row.id || "").trim();
          if (!rowId) {
            filesWithMissingRowIds.push(`${bankId} (${path.basename(filePath)})`);
            continue;
          }
          rowIds.push(rowId);
          if (seen.has(rowId)) {
            duplicateIds.push(rowId);
          }
          seen.add(rowId);

          const enRows = Array.isArray(row.en) ? row.en : [];
          const ptRows = Array.isArray(row.pt) ? row.pt : [];
          if (hasDuplicateValues(enRows as string[])) {
            rowLocaleDupes.push(`${bankId}:${rowId}:en`);
          }
          if (hasDuplicateValues(ptRows as string[])) {
            rowLocaleDupes.push(`${bankId}:${rowId}:pt`);
          }
        }

        if (rows.length > 1 && !isSortedById(rows)) {
          unsortedBanks.push(bankId);
        }

        if (bank.config?.sortBy === "id" && rows.length > 1 && !isSortedById(rows)) {
          unsortedBanks.push(`${bankId}:sortBy=id`);
        }

        return acc + rows.length;
      }, 0);

      expect(filesWithMissingMeta).toEqual([]);
      expect(filesWithMissingRowIds).toEqual([]);
      expect(duplicateIds).toEqual([]);
      expect(rowLocaleDupes).toEqual([]);
      expect(unsortedBanks).toEqual([]);
      expect(rowCount).toBeGreaterThan(0);
    });
  }
});
