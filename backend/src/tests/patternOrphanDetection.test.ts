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
  // All pattern banks are now wired to consumer services and registered in the manifest.
  // This allowlist is intentionally empty — every bank must pass registry, dependency,
  // and usedBy checks without exemptions.
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
