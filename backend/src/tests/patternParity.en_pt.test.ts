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
  navigation: "patterns/navigation",
  doc_refs: "patterns/doc_refs",
  operators: "patterns/operators",
  domains: "patterns/domains",
  quality: "patterns/quality",
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
  if (Array.isArray(bank.connectors)) return bank.connectors;
  if (Array.isArray(bank.rules)) return bank.rules;
  if (Array.isArray(bank.guardrails)) return bank.guardrails;
  return [];
}

function extractPlaceholders(value: string): string[] {
  const values = value.match(/\\{\\{[^}]+\\}\\}|\\$\\{[^}]+\\}/g);
  return values ? values.map((v) => v.toLowerCase().trim()) : [];
}

describe("patternParity (EN/PT)", () => {
  for (const [family, relDir] of Object.entries(TARGET_FAMILIES)) {
    test(`${family}: bilingual EN/PT parity is stable`, () => {
      const files = walkPatternFiles(path.join(DATA_BANKS_ROOT, relDir));

      const missingMetaIds: string[] = [];
      const parityFailures: string[] = [];

      for (const filePath of files) {
        const bank = readJson(filePath);
        const relPath = path.relative(DATA_BANKS_ROOT, filePath);
        if (ALLOWLIST_MISSING_META_FILES.has(relPath)) {
          continue;
        }
        const bankId = String(bank._meta?.id || "").trim();
        if (!bankId) {
          missingMetaIds.push(path.relative(DATA_BANKS_ROOT, filePath));
          continue;
        }

        const rows = getPatternRows(bank);
        for (const row of rows) {
          const rowId = String(row.id || "").trim();
          const en = Array.isArray(row.en) ? row.en : [];
          const pt = Array.isArray(row.pt) ? row.pt : [];
          if (en.length === 0 && pt.length === 0) continue;
          if (en.length !== pt.length || rowId.length === 0) {
            parityFailures.push(`${bankId}:${rowId}`);
            continue;
          }

          const enPlaceholders = new Set<string>();
          const ptPlaceholders = new Set<string>();
          for (const phrase of en) {
            for (const token of extractPlaceholders(String(phrase))) {
              enPlaceholders.add(token);
            }
          }
          for (const phrase of pt) {
            for (const token of extractPlaceholders(String(phrase))) {
              ptPlaceholders.add(token);
            }
          }
          if (
            [...enPlaceholders].sort().join("|") !==
            [...ptPlaceholders].sort().join("|")
          ) {
            parityFailures.push(`${bankId}:${rowId}:placeholders`);
          }
        }
      }

      expect(missingMetaIds).toEqual([]);
      expect(parityFailures).toEqual([]);
    });
  }
});
