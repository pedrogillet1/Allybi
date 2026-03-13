import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";
import crypto from "crypto";

type CsvRow = {
  id: string;
  owner: string;
  path: string;
  category: string;
  checksum: string;
  lastUpdated: string;
  dependsOn: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function readCsv(filePath: string): CsvRow[] {
  const lines = fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/);
  return lines.slice(1).map((line) => {
    const [id, owner, relPath, category, checksum, lastUpdated, dependsOn] =
      parseCsvLine(line);
    return {
      id,
      owner,
      path: relPath,
      category,
      checksum,
      lastUpdated,
      dependsOn,
    };
  });
}

function sha256(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function normalizeMetadataPath(pathLike: string): string {
  return String(pathLike || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^backend\/src\//, "")
    .replace(/^src\//, "src/");
}

function resolveMetadataPathCandidates(repoRoot: string, pathLike: string): string[] {
  const normalized = normalizeMetadataPath(pathLike);
  if (!normalized) return [];
  const candidates = new Set<string>();

  if (normalized.startsWith("backend/")) {
    candidates.add(path.join(repoRoot, normalized));
    return Array.from(candidates);
  }

  if (normalized.startsWith("src/")) {
    candidates.add(path.join(repoRoot, normalized));
    candidates.add(path.join(repoRoot, "backend", normalized));
    return Array.from(candidates);
  }

  candidates.add(path.join(repoRoot, normalized));
  candidates.add(path.join(repoRoot, "backend", normalized));
  candidates.add(path.join(repoRoot, "src", normalized));
  candidates.add(path.join(repoRoot, "backend", "src", normalized));
  return Array.from(candidates);
}

function metadataPathExists(repoRoot: string, pathLike: string): boolean {
  return resolveMetadataPathCandidates(repoRoot, pathLike).some((candidate) =>
    fs.existsSync(candidate),
  );
}

function resolveRepoRoot(): string {
  const candidates = [
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), ".."),
    path.resolve(__dirname, "..", "..", "..", ".."),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "docs", "bank-expansion"))) {
      return candidate;
    }
  }
  throw new Error(`Could not resolve repo root from ${process.cwd()}`);
}

const REPO_ROOT = resolveRepoRoot();
const DATA_BANKS_ROOT = path.join(REPO_ROOT, "backend", "src", "data_banks");
const CSV_PATH = path.join(
  REPO_ROOT,
  "docs",
  "bank-expansion",
  "NEW_BANKS_REGISTERED.csv",
);
const REGISTRY_PATH = path.join(
  DATA_BANKS_ROOT,
  "manifest",
  "bank_registry.any.json",
);
const DEPENDENCIES_PATH = path.join(
  DATA_BANKS_ROOT,
  "manifest",
  "bank_dependencies.any.json",
);
const ALIASES_PATH = path.join(
  DATA_BANKS_ROOT,
  "manifest",
  "bank_aliases.any.json",
);
const GOVERNANCE_WIRING_PATH = path.join(
  DATA_BANKS_ROOT,
  "governance",
  "runtime_wiring_requirements.any.json",
);

describe("Certification: bank wave runtime metadata", () => {
  test("audited banks are registered, checksummed, and point to real runtime metadata paths", () => {
    const rows = readCsv(CSV_PATH);
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) as {
      banks?: Array<{
        id?: string;
        path?: string;
        checksumSha256?: string;
        requiredByEnv?: Record<string, boolean>;
      }>;
    };
    const dependencies = JSON.parse(
      fs.readFileSync(DEPENDENCIES_PATH, "utf8"),
    ) as {
      banks?: Array<{ id?: string }>;
    };
    const aliases = JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8")) as {
      aliases?: Array<{ alias?: string; canonicalId?: string }>;
    };
    const governanceWiring = JSON.parse(
      fs.readFileSync(GOVERNANCE_WIRING_PATH, "utf8"),
    ) as {
      managedAuditSet?: { bankIds?: string[] };
    };

    const auditedIds = new Set(
      Array.isArray(governanceWiring?.managedAuditSet?.bankIds)
        ? governanceWiring.managedAuditSet.bankIds
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : [],
    );
    const expectedCsvIds = rows.map((row) => row.id);
    for (const id of expectedCsvIds) {
      expect(auditedIds.has(id)).toBe(true);
    }

    const registryById = new Map(
      (registry.banks || [])
        .map((entry) => [String(entry.id || "").trim(), entry] as const)
        .filter(([id]) => id.length > 0),
    );
    const dependencyIds = new Set(
      (dependencies.banks || [])
        .map((entry) => String(entry.id || "").trim())
        .filter(Boolean),
    );
    const selfAliasIds = new Set(
      (aliases.aliases || [])
        .map((entry) => ({
          alias: String(entry.alias || "").trim(),
          canonicalId: String(entry.canonicalId || "").trim(),
        }))
        .filter((entry) => entry.alias && entry.alias === entry.canonicalId)
        .map((entry) => entry.alias),
    );

    const failures: string[] = [];

    for (const row of rows) {
      const registryEntry = registryById.get(row.id);
      if (!registryEntry) {
        failures.push(`${row.id}:missing_registry_entry`);
        continue;
      }
      if (!dependencyIds.has(row.id)) {
        failures.push(`${row.id}:missing_dependency_entry`);
      }
      if (!selfAliasIds.has(row.id)) {
        failures.push(`${row.id}:missing_self_alias`);
      }

      const bankPath = path.join(DATA_BANKS_ROOT, row.path);
      if (!fs.existsSync(bankPath)) {
        failures.push(`${row.id}:missing_file`);
        continue;
      }

      const registryPath = String(registryEntry.path || "").trim();
      if (registryPath !== row.path) {
        failures.push(`${row.id}:registry_path_mismatch`);
      }

      const onDiskChecksum = sha256(bankPath);
      if (onDiskChecksum !== row.checksum) {
        failures.push(`${row.id}:csv_checksum_mismatch`);
      }
      if (String(registryEntry.checksumSha256 || "").trim() !== onDiskChecksum) {
        failures.push(`${row.id}:registry_checksum_mismatch`);
      }

      const bank = JSON.parse(fs.readFileSync(bankPath, "utf8")) as {
        _meta?: { usedBy?: string[]; tests?: string[] };
        runtimeUsageNotes?: unknown;
      };
      const usedBy = Array.isArray(bank?._meta?.usedBy) ? bank._meta.usedBy : [];
      const tests = Array.isArray(bank?._meta?.tests) ? bank._meta.tests : [];

      if (usedBy.length === 0) {
        failures.push(`${row.id}:usedBy_empty`);
      } else if (!usedBy.some((entry) => metadataPathExists(REPO_ROOT, entry))) {
        failures.push(`${row.id}:usedBy_paths_missing`);
      }

      if (tests.length === 0) {
        failures.push(`${row.id}:tests_empty`);
      } else if (!tests.some((entry) => metadataPathExists(REPO_ROOT, entry))) {
        failures.push(`${row.id}:test_paths_missing`);
      }

      if (!bank.runtimeUsageNotes) {
        failures.push(`${row.id}:runtimeUsageNotes_missing`);
      }
    }

    expect(failures).toEqual([]);
  });
});
