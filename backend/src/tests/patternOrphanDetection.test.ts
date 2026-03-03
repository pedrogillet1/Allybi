import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

interface PatternBank {
  _meta?: {
    id?: string;
    usedBy?: string[];
  };
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

const PATTERN_BANK_ALLOWLIST = new Set<string>([
  // Navigation families are intentionally in-progress with semantic orchestration tests only.
  "nav_intents_en",
  "nav_intents_pt",
  "path_string_guardrails",
  "open_disambiguation",
  "nav_failure_recovery",

  // Universal operators are exercised by operator runtime contracts; wiring is proven via service tests.
  "operator_patterns_open",
  "operator_patterns_close",
  "operator_patterns_extract",
  "operator_patterns_navigate",
  "operator_patterns_locate",
  "operator_patterns_validate",
  "operator_patterns_advise",
  "operator_patterns_evaluate",
  "operator_patterns_compare",
  "operator_patterns_calculate",
  "operator_patterns_summarize",
  "operator_patterns_monitor",

  // Quality banks are new and validated through dedicated tests; allowlisted during migration.
  "quality_ambiguity_triggers",
  "quality_weak_evidence_triggers",
  "quality_wrong_doc_risk_triggers",
  "quality_numeric_integrity_triggers",
  "quality_language_lock_triggers",
  "quality_unsafe_operation_triggers",

  // Medical domain family currently carries expanded pattern banks pending registry wiring.
  "patterns_medical_encounter_timeline_patterns",
  "patterns_medical_lab_panel_patterns",
  "patterns_medical_red_flag_patterns",
  "patterns_medical_safety_boundary_triggers",
  "patterns_medical_unit_reference_patterns",
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

describe("patternOrphanDetection", () => {
  test("pattern banks are registered, dependency-covered, and used or allowlisted", () => {
    const registry = JSON.parse(
      fs.readFileSync(
        path.join(DATA_BANKS_ROOT, "manifest", "bank_registry.any.json"),
        "utf8",
      ),
    );
    const dependencies = JSON.parse(
      fs.readFileSync(
        path.join(DATA_BANKS_ROOT, "manifest", "bank_dependencies.any.json"),
        "utf8",
      ),
    );
    const registryIds = new Set(
      (registry?.banks || [])
        .map((entry: { id?: string }) => String(entry?.id || "").trim())
        .filter(Boolean),
    );
    const dependencyIds = new Set(
      (dependencies?.banks || [])
        .map((entry: { id?: string }) => String(entry?.id || "").trim())
        .filter(Boolean),
    );

    const allSeenIds = new Set<string>();
    const duplicateBankIds: string[] = [];

    const missingRegistry: string[] = [];
    const missingDependency: string[] = [];
    const missingUsage: string[] = [];
    let scanned = 0;

    for (const [family, relDir] of Object.entries(TARGET_FAMILIES)) {
      const files = walkPatternFiles(path.join(DATA_BANKS_ROOT, relDir));
      for (const filePath of files) {
        const bank = readJson(filePath);
        const id = String(bank._meta?.id || "").trim();
        if (!id) continue;
        scanned += 1;

        if (allSeenIds.has(id)) {
          duplicateBankIds.push(`${family}:${id}`);
        }
        allSeenIds.add(id);

        const usedBy = Array.isArray(bank._meta?.usedBy)
          ? bank._meta.usedBy
          : [];
        if (!PATTERN_BANK_ALLOWLIST.has(id) && !registryIds.has(id)) {
          missingRegistry.push(id);
        }
        if (!PATTERN_BANK_ALLOWLIST.has(id) && !dependencyIds.has(id)) {
          missingDependency.push(id);
        }
        if (!PATTERN_BANK_ALLOWLIST.has(id) && usedBy.length === 0) {
          missingUsage.push(id);
        }
      }
    }

    expect(duplicateBankIds).toEqual([]);
    expect(missingRegistry).toEqual([]);
    expect(missingDependency).toEqual([]);
    expect(missingUsage).toEqual([]);
    expect(scanned).toBeGreaterThan(0);
    console.log(
      `[patternOrphanDetection] scanned=${scanned}, registry=${registryIds.size}, dependencies=${dependencyIds.size}, allowlisted=${PATTERN_BANK_ALLOWLIST.size}`,
    );
  });
});
