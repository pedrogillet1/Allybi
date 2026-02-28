import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    path.resolve(process.cwd(), "backend", "src", "data_banks"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Cannot locate data_banks root. Tried: ${candidates.join(", ")}`,
  );
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function list(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function walkAnyJsonFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkAnyJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".any.json")) {
      out.push(full);
    }
  }

  return out;
}

function compileRegexes(patterns: string[], label: string): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      throw new Error(`${label} has invalid regex: ${pattern}`);
    }
  });
}

function matchesCoverage(
  id: string,
  exact: Set<string>,
  prefixes: string[],
  regexes: RegExp[],
): boolean {
  if (exact.has(id)) return true;
  if (prefixes.some((prefix) => id.startsWith(prefix))) return true;
  return regexes.some((regex) => regex.test(id));
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();
const REPO_ROOT = path.resolve(DATA_BANKS_ROOT, "..", "..");

const mapPath = path.join(
  DATA_BANKS_ROOT,
  "semantics/document_intelligence_bank_map.any.json",
);
const usagePath = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/manifest/usage_manifest.any.json",
);
const allowlistPath = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/manifest/orphan_allowlist.any.json",
);
const gatesPath = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/manifest/runtime_wiring_gates.any.json",
);
const dependencyGraphPath = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/manifest/dependency_graph.any.json",
);
const schemaRegistryPath = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence/manifest/bank_schema_registry.any.json",
);
const registryPath = path.join(DATA_BANKS_ROOT, "manifest/bank_registry.any.json");
const dependenciesPath = path.join(
  DATA_BANKS_ROOT,
  "manifest/bank_dependencies.any.json",
);
const aliasesPath = path.join(DATA_BANKS_ROOT, "manifest/bank_aliases.any.json");
const DI_ROOT = path.join(DATA_BANKS_ROOT, "document_intelligence");

const INFRA_RUNTIME_IDS = [
  "document_intelligence_bank_map",
  "document_intelligence_schema_registry",
  "document_intelligence_dependency_graph",
  "document_intelligence_usage_manifest",
  "document_intelligence_orphan_allowlist",
  "document_intelligence_runtime_wiring_gates",
];

const REQUIRED_PROOF_FAMILIES = [
  "domain_packs",
  "doc_type_sections",
  "retrieval_policies",
  "validation_policies",
];

describe("Document intelligence orphan + runtime wiring detection", () => {
  test("required governance files exist", () => {
    expect(fs.existsSync(mapPath)).toBe(true);
    expect(fs.existsSync(usagePath)).toBe(true);
    expect(fs.existsSync(allowlistPath)).toBe(true);
    expect(fs.existsSync(gatesPath)).toBe(true);
    expect(fs.existsSync(dependencyGraphPath)).toBe(true);
    expect(fs.existsSync(schemaRegistryPath)).toBe(true);
    expect(fs.existsSync(registryPath)).toBe(true);
    expect(fs.existsSync(dependenciesPath)).toBe(true);
    expect(fs.existsSync(aliasesPath)).toBe(true);
  });

  test("all runtime banks in map have registry, dependencies, and self-alias", () => {
    const mapBank = readJson(mapPath);
    const registry = readJson(registryPath);
    const dependencies = readJson(dependenciesPath);
    const aliases = readJson(aliasesPath);

    const runtimeIds = [
      ...new Set([
        ...list(mapBank?.requiredCoreBankIds),
        ...list(mapBank?.optionalBankIds),
        ...INFRA_RUNTIME_IDS,
      ]),
    ];

    const registryIds = new Set(
      list((registry?.banks || []).map((entry: any) => entry?.id)),
    );
    const dependencyIds = new Set(
      list((dependencies?.banks || []).map((entry: any) => entry?.id)),
    );
    const selfAliases = new Set(
      (Array.isArray(aliases?.aliases) ? aliases.aliases : [])
        .map((entry: any) => ({
          alias: String(entry?.alias || "").trim(),
          canonicalId: String(entry?.canonicalId || "").trim(),
        }))
        .filter((entry: any) => entry.alias && entry.alias === entry.canonicalId)
        .map((entry: any) => entry.alias),
    );

    const missingRegistry = runtimeIds.filter((id) => !registryIds.has(id));
    const missingDependencies = runtimeIds.filter((id) => !dependencyIds.has(id));
    const missingSelfAlias = runtimeIds.filter((id) => !selfAliases.has(id));

    expect(missingRegistry).toEqual([]);
    expect(missingDependencies).toEqual([]);
    expect(missingSelfAlias).toEqual([]);
  });

  test("new on-disk document_intelligence banks must be registered (unless allowlisted)", () => {
    const registry = readJson(registryPath);
    const allowlist = readJson(allowlistPath);

    const registryIds = new Set(
      list((registry?.banks || []).map((entry: any) => entry?.id)),
    );

    const allowlistedIds = new Set(list(allowlist?.allowlistedBankIds));
    const allowlistedPrefixes = list(allowlist?.allowlistedIdPrefixes);
    const allowlistedPatterns = compileRegexes(
      list(allowlist?.allowlistedIdPatterns),
      "orphan_allowlist.allowlistedIdPatterns",
    );

    const isAllowlisted = (id: string): boolean =>
      matchesCoverage(id, allowlistedIds, allowlistedPrefixes, allowlistedPatterns);

    const missing: string[] = [];
    for (const filePath of walkAnyJsonFiles(DI_ROOT)) {
      const bank = readJson(filePath);
      const id = String(bank?._meta?.id || "").trim();
      const rel = path.relative(DATA_BANKS_ROOT, filePath);

      if (!id) {
        missing.push(`missing _meta.id in ${rel}`);
        continue;
      }

      if (!registryIds.has(id) && !isAllowlisted(id)) {
        missing.push(`${id} (${rel})`);
      }
    }

    expect(missing).toEqual([]);
  });

  test("runtime banks must have usage coverage or explicit allowlist", () => {
    const mapBank = readJson(mapPath);
    const usage = readJson(usagePath);
    const allowlist = readJson(allowlistPath);

    const runtimeIds = [
      ...new Set([
        ...list(mapBank?.requiredCoreBankIds),
        ...list(mapBank?.optionalBankIds),
        ...INFRA_RUNTIME_IDS,
      ]),
    ];

    const consumedIds = new Set(list(usage?.consumedBankIds));
    const consumedPrefixes = list(usage?.consumedIdPrefixes);
    const consumedPatterns = compileRegexes(
      list(usage?.consumedIdPatterns),
      "usage_manifest.consumedIdPatterns",
    );

    const allowlistedIds = new Set(list(allowlist?.allowlistedBankIds));
    const allowlistedPrefixes = list(allowlist?.allowlistedIdPrefixes);
    const allowlistedPatterns = compileRegexes(
      list(allowlist?.allowlistedIdPatterns),
      "orphan_allowlist.allowlistedIdPatterns",
    );

    const misses = runtimeIds.filter((id) => {
      const consumed = matchesCoverage(
        id,
        consumedIds,
        consumedPrefixes,
        consumedPatterns,
      );
      if (consumed) return false;

      const allowlisted = matchesCoverage(
        id,
        allowlistedIds,
        allowlistedPrefixes,
        allowlistedPatterns,
      );
      return !allowlisted;
    });

    expect(misses).toEqual([]);
  });

  test("runtime banks must have proof-family coverage and proof tests on disk", () => {
    const mapBank = readJson(mapPath);
    const allowlist = readJson(allowlistPath);
    const gates = readJson(gatesPath);

    const runtimeIds = [
      ...new Set([
        ...list(mapBank?.requiredCoreBankIds),
        ...list(mapBank?.optionalBankIds),
        ...INFRA_RUNTIME_IDS,
      ]),
    ];

    const allowlistedIds = new Set(list(allowlist?.allowlistedBankIds));
    const allowlistedPrefixes = list(allowlist?.allowlistedIdPrefixes);
    const allowlistedPatterns = compileRegexes(
      list(allowlist?.allowlistedIdPatterns),
      "orphan_allowlist.allowlistedIdPatterns",
    );

    const gatesList = Array.isArray(gates?.gates) ? gates.gates : [];
    const families = gatesList.flatMap((gate: any) =>
      Array.isArray(gate?.requiredFamilies) ? gate.requiredFamilies : [],
    );

    const familyIds = new Set(
      families.map((family: any) => String(family?.id || "").trim()),
    );
    for (const familyId of REQUIRED_PROOF_FAMILIES) {
      expect(familyIds.has(familyId)).toBe(true);
    }

    const familyMatchers = families.map((family: any) => {
      const sampleIds = new Set(list(family?.sampleBankIds));
      const prefixes = list(family?.bankIdPrefixes);
      const patterns = compileRegexes(
        list(family?.bankIdPatterns),
        `runtime_wiring_gates.requiredFamilies(${String(family?.id || "")}).bankIdPatterns`,
      );
      const proofTests = list(family?.proofTests);

      for (const relPath of proofTests) {
        const fullPath = path.join(REPO_ROOT, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
      }

      return {
        id: String(family?.id || ""),
        sampleIds,
        prefixes,
        patterns,
      };
    });

    const uncovered = runtimeIds.filter((id) => {
      const allowlisted = matchesCoverage(
        id,
        allowlistedIds,
        allowlistedPrefixes,
        allowlistedPatterns,
      );
      if (allowlisted) return false;

      return !familyMatchers.some((family) =>
        matchesCoverage(id, family.sampleIds, family.prefixes, family.patterns),
      );
    });

    expect(uncovered).toEqual([]);
  });
});
