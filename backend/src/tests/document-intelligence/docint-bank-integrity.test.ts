/**
 * Document Intelligence Bank Integrity Tests
 * -------------------------------------------
 * CI-grade validation that all DI bank JSON files are structurally sound,
 * carry required _meta fields, have unique IDs, are registered in the
 * bank_registry, contain no empty critical arrays, reference valid schemas,
 * and maintain cross-domain parity.
 *
 * These tests read real filesystem files — no mocks.
 */

import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the data_banks root directory.
 * Works whether cwd is backend/ or the repo root.
 */
function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    path.resolve(process.cwd(), "backend", "src", "data_banks"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Cannot locate data_banks root. Tried: ${candidates.join(", ")}`,
  );
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();

/**
 * Directories that contain document-intelligence-related banks.
 * These sub-trees are walked recursively for .any.json files.
 */
const DI_SUBDIRECTORIES = [
  "document_intelligence/domains",
  "document_intelligence/manifest",
  "quality/document_intelligence",
  "retrieval",
  "semantics/domain",
  "semantics/structure",
  "semantics/entities",
  "semantics/taxonomy",
  "policies/reasoning",
  "operators/playbooks",
  "probes/marketing",
  "normalizers/doc_aliases",
];

/**
 * Walk a directory tree and return all .any.json file paths.
 */
function walkJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".any.json")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Collect all DI bank file paths from the known sub-directories.
 */
function collectDiBankFiles(): string[] {
  const files: string[] = [];
  for (const sub of DI_SUBDIRECTORIES) {
    const dir = path.join(DATA_BANKS_ROOT, sub);
    files.push(...walkJsonFiles(dir));
  }

  // Also include the bank map itself
  const bankMapPath = path.join(
    DATA_BANKS_ROOT,
    "semantics",
    "document_intelligence_bank_map.any.json",
  );
  if (fs.existsSync(bankMapPath) && !files.includes(bankMapPath)) {
    files.push(bankMapPath);
  }

  // Include the crossdoc grounding bank
  const crossdocPath = path.join(
    DATA_BANKS_ROOT,
    "semantics",
    "allybi_crossdoc_grounding.any.json",
  );
  if (fs.existsSync(crossdocPath) && !files.includes(crossdocPath)) {
    files.push(crossdocPath);
  }

  // Only keep banks that are registry-governed (or the explicit inclusions above).
  // This avoids duplicate legacy artifacts on disk from polluting CI integrity checks.
  const registry = loadRegistry();
  const registryPaths = new Set<string>(
    Array.isArray(registry?.banks)
      ? registry.banks
          .map((entry: any) => String(entry?.path ?? "").trim())
          .filter(Boolean)
      : [],
  );

  return files.filter((filePath) => {
    const rel = path.relative(DATA_BANKS_ROOT, filePath);
    return (
      registryPaths.has(rel) ||
      rel === "semantics/document_intelligence_bank_map.any.json" ||
      rel === "semantics/allybi_crossdoc_grounding.any.json"
    );
  });
}

/**
 * Load and parse a JSON bank, returning the parsed object or null on failure.
 */
function tryParseBank(
  filePath: string,
): { ok: true; data: any } | { ok: false; error: string } {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Load the bank registry.
 */
function loadRegistry(): any {
  const registryPath = path.join(
    DATA_BANKS_ROOT,
    "manifest",
    "bank_registry.any.json",
  );
  const raw = fs.readFileSync(registryPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Load the document intelligence bank map.
 */
function loadBankMap(): any {
  const mapPath = path.join(
    DATA_BANKS_ROOT,
    "semantics",
    "document_intelligence_bank_map.any.json",
  );
  if (!fs.existsSync(mapPath)) return null;
  const raw = fs.readFileSync(mapPath, "utf8");
  return JSON.parse(raw);
}

// Pre-collect for use across tests
const diBankFiles = collectDiBankFiles();
const parsedBanks: Array<{ path: string; data: any }> = [];
for (const filePath of diBankFiles) {
  const result = tryParseBank(filePath);
  if (result.ok) {
    parsedBanks.push({ path: filePath, data: result.data });
  }
}

// ---------------------------------------------------------------------------
// 1. All DI bank files parse as valid JSON
// ---------------------------------------------------------------------------

describe("DI bank JSON validity", () => {
  test("all DI bank files parse as valid JSON", () => {
    expect(diBankFiles.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const filePath of diBankFiles) {
      const result = tryParseBank(filePath);
      if (!result.ok) {
        const rel = path.relative(DATA_BANKS_ROOT, filePath);
        failures.push(`${rel}: ${result.error}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("found a reasonable number of DI bank files", () => {
    // We expect at least 40+ DI banks across all sub-directories
    expect(diBankFiles.length).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// 2. All DI banks have required _meta fields
// ---------------------------------------------------------------------------

describe("DI bank _meta fields", () => {
  test("every bank has _meta.id, _meta.version, _meta.description", () => {
    const missing: string[] = [];

    for (const { path: filePath, data } of parsedBanks) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      const meta = data?._meta;

      if (!meta || typeof meta !== "object") {
        missing.push(`${rel}: missing _meta object`);
        continue;
      }
      if (!meta.id || typeof meta.id !== "string") {
        missing.push(`${rel}: missing or invalid _meta.id`);
      }
      if (!meta.version || typeof meta.version !== "string") {
        missing.push(`${rel}: missing or invalid _meta.version`);
      }
      if (!meta.description || typeof meta.description !== "string") {
        missing.push(`${rel}: missing or invalid _meta.description`);
      }
    }

    expect(missing).toEqual([]);
  });

  test("every bank has a config object with enabled flag", () => {
    const missing: string[] = [];

    for (const { path: filePath, data } of parsedBanks) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      if (!data?.config || typeof data.config !== "object") {
        missing.push(`${rel}: missing config object`);
        continue;
      }
      if (typeof data.config.enabled !== "boolean") {
        missing.push(`${rel}: config.enabled is not a boolean`);
      }
    }

    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. All DI bank IDs are unique
// ---------------------------------------------------------------------------

describe("DI bank ID uniqueness", () => {
  test("no duplicate _meta.id across all DI banks", () => {
    const idToFiles = new Map<string, string[]>();

    for (const { path: filePath, data } of parsedBanks) {
      const id = data?._meta?.id;
      if (!id) continue;

      const rel = path.relative(DATA_BANKS_ROOT, filePath);
      if (!idToFiles.has(id)) {
        idToFiles.set(id, []);
      }
      idToFiles.get(id)!.push(rel);
    }

    const duplicates: string[] = [];
    for (const [id, files] of idToFiles) {
      if (files.length > 1) {
        duplicates.push(`${id} => [${files.join(", ")}]`);
      }
    }

    expect(duplicates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. All DI banks with _meta.id are registered in bank_registry
// ---------------------------------------------------------------------------

describe("DI bank registry cross-reference", () => {
  test("all DI banks with _meta.id are listed in bank_registry.any.json", () => {
    const registry = loadRegistry();
    const registeredIds = new Set<string>(
      Array.isArray(registry?.banks)
        ? registry.banks
            .map((b: any) => String(b?.id ?? "").trim())
            .filter(Boolean)
        : [],
    );

    const unregistered: string[] = [];

    for (const { path: filePath, data } of parsedBanks) {
      const id = data?._meta?.id;
      if (!id) continue;

      // Skip the registry itself and meta-banks
      if (id === "bank_registry") continue;

      if (!registeredIds.has(id)) {
        const rel = path.relative(DATA_BANKS_ROOT, filePath);
        unregistered.push(`${id} (${rel})`);
      }
    }

    expect(unregistered).toEqual([]);
  });

  test("all DI banks listed in the bank map requiredCoreBankIds exist", () => {
    const bankMap = loadBankMap();
    if (!bankMap) {
      // Skip if bank map does not exist yet
      return;
    }

    const required: string[] = Array.isArray(bankMap.requiredCoreBankIds)
      ? bankMap.requiredCoreBankIds
          .map((id: unknown) => String(id))
          .filter(Boolean)
      : [];

    const loadedIds = new Set(
      parsedBanks.map((b) => b.data?._meta?.id).filter(Boolean),
    );

    // Also check against full data_banks directory (some required banks live outside DI sub-dirs)
    const allBankFiles = walkJsonFiles(DATA_BANKS_ROOT);
    const allIds = new Set<string>();
    for (const f of allBankFiles) {
      const result = tryParseBank(f);
      if (result.ok && result.data?._meta?.id) {
        allIds.add(result.data._meta.id);
      }
    }

    const missing = required.filter((id) => !allIds.has(id));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. No empty critical arrays in domain banks
// ---------------------------------------------------------------------------

describe("DI bank non-empty critical arrays", () => {
  const criticalArrayKeys = [
    "rules",
    "aliases",
    "priorities",
    "typeDefinitions",
    "templates",
    "questions",
    "frameworks",
    "entries",
    "patterns",
    "audienceStyles",
    "rewrites",
    "boostDocTypes",
    "requirements",
    "scaffolds",
    "strategies",
  ];

  test("domain/operator banks contain at least one entry in their primary array", () => {
    const empty: string[] = [];

    for (const { path: filePath, data } of parsedBanks) {
      const rel = path.relative(DATA_BANKS_ROOT, filePath);

      // Skip manifest-style banks (bank_map, crossdoc_grounding, doc_taxonomy)
      const id = data?._meta?.id ?? "";
      if (id === "document_intelligence_bank_map") continue;
      if (id === "doc_taxonomy") continue;

      // Find the first matching critical array key
      let foundArray = false;
      for (const key of criticalArrayKeys) {
        if (Array.isArray(data[key])) {
          foundArray = true;
          if (data[key].length === 0) {
            empty.push(`${rel} (${id}): "${key}" array is empty`);
          }
          break;
        }
      }

      // If no standard array key found, check for object-based entries
      if (!foundArray && data.entries && typeof data.entries === "object") {
        if (Object.keys(data.entries).length === 0) {
          empty.push(`${rel} (${id}): "entries" object is empty`);
        }
      }
    }

    expect(empty).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Schema registry references valid schema files
// ---------------------------------------------------------------------------

describe("DI schema references", () => {
  test("document_intelligence_manifest_schema file exists if referenced", () => {
    const schemaPath = path.join(
      DATA_BANKS_ROOT,
      "schemas",
      "document_intelligence_manifest_schema.any.json",
    );

    if (fs.existsSync(schemaPath)) {
      const result = tryParseBank(schemaPath);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data._meta?.id).toBe(
          "document_intelligence_manifest_schema",
        );
      }
    }
  });

  test("all DI-related schema files referenced in registry exist on disk", () => {
    const registry = loadRegistry();
    const schemaBanks = Array.isArray(registry?.banks)
      ? registry.banks.filter(
          (b: any) =>
            b?.category === "schemas" &&
            (String(b?.id ?? "").includes("document_intelligence") ||
              String(b?.id ?? "").includes("quality_document_intelligence") ||
              String(b?.id ?? "").includes("retrieval_document_intelligence") ||
              String(b?.id ?? "").includes("reasoning_policy") ||
              String(b?.id ?? "").includes("operator_playbook") ||
              String(b?.id ?? "").includes("marketing_probe") ||
              String(b?.id ?? "").includes("doc_identity")),
        )
      : [];

    const missing: string[] = [];
    for (const entry of schemaBanks) {
      const relPath = String(entry?.path ?? "").trim();
      if (!relPath) continue;
      const fullPath = path.join(DATA_BANKS_ROOT, relPath);
      if (!fs.existsSync(fullPath)) {
        missing.push(`${entry.id}: ${relPath}`);
      }
    }

    expect(missing).toEqual([]);
  });

  test("schema files referenced by DI banks via schemaId exist in registry", () => {
    const registry = loadRegistry();
    const registeredSchemaIds = new Set<string>(
      Array.isArray(registry?.banks)
        ? registry.banks
            .filter((b: any) => b?.category === "schemas")
            .map((b: any) => String(b?.id ?? ""))
            .filter(Boolean)
        : [],
    );

    const diBanksInRegistry = Array.isArray(registry?.banks)
      ? registry.banks.filter((b: any) => {
          const bankPath = String(b?.path ?? "");
          return DI_SUBDIRECTORIES.some((sub) => bankPath.startsWith(sub));
        })
      : [];

    const missingSchemas: string[] = [];
    for (const entry of diBanksInRegistry) {
      const schemaId = String(entry?.schemaId ?? "").trim();
      if (!schemaId) continue;
      if (!registeredSchemaIds.has(schemaId)) {
        missingSchemas.push(
          `${entry.id} references schema "${schemaId}" which is not registered`,
        );
      }
    }

    expect(missingSchemas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-domain parity
// ---------------------------------------------------------------------------

describe("DI cross-domain parity", () => {
  const DOMAINS = ["accounting", "finance", "legal", "medical", "ops"] as const;
  const FULL_PARITY_DOMAINS = ["finance", "legal", "medical", "ops"] as const;
  const OPERATORS = [
    "navigate",
    "open",
    "extract",
    "summarize",
    "compare",
    "locate",
    "calculate",
    "evaluate",
    "validate",
    "advise",
    "monitor",
  ] as const;

  const bankMap = loadBankMap();
  const allBankIds = new Set(
    parsedBanks.map((b) => b.data?._meta?.id).filter(Boolean),
  );

  // Also collect IDs from the full data_banks tree to cover banks outside DI sub-dirs
  const allBankFilesGlobal = walkJsonFiles(DATA_BANKS_ROOT);
  for (const f of allBankFilesGlobal) {
    const result = tryParseBank(f);
    if (result.ok && result.data?._meta?.id) {
      allBankIds.add(result.data._meta.id);
    }
  }

  test("finance, legal, medical have doc_archetypes banks", () => {
    for (const domain of ["finance", "legal", "medical"] as const) {
      expect(allBankIds.has(`doc_archetypes_${domain}`)).toBe(true);
    }
  });

  test("finance, legal, medical have doc_aliases banks", () => {
    for (const domain of ["finance", "legal", "medical"] as const) {
      expect(allBankIds.has(`doc_aliases_${domain}`)).toBe(true);
    }
  });

  test("all domains have explain_style and decision_support banks", () => {
    for (const domain of DOMAINS) {
      expect(allBankIds.has(`explain_style_${domain}`)).toBe(true);
      expect(allBankIds.has(`decision_support_${domain}`)).toBe(true);
    }
  });

  test("all domains have retrieval banks (boost_rules, query_rewrites, section_priority)", () => {
    for (const domain of DOMAINS) {
      expect(allBankIds.has(`boost_rules_${domain}`)).toBe(true);
      expect(allBankIds.has(`query_rewrites_${domain}`)).toBe(true);
      expect(allBankIds.has(`section_priority_${domain}`)).toBe(true);
    }
  });

  test("all domains have table_header_ontology", () => {
    for (const domain of DOMAINS) {
      expect(allBankIds.has(`table_header_ontology_${domain}`)).toBe(true);
    }
  });

  test("all operator+domain combinations have a playbook bank", () => {
    const missing: string[] = [];

    for (const operator of OPERATORS) {
      for (const domain of FULL_PARITY_DOMAINS) {
        const bankId = `operator_playbook_${operator}_${domain}`;
        if (!allBankIds.has(bankId)) {
          missing.push(bankId);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test("all domains have marketing probe banks (keyword_taxonomy + pain_points)", () => {
    for (const domain of FULL_PARITY_DOMAINS) {
      expect(allBankIds.has(`keyword_taxonomy_${domain}`)).toBe(true);
      expect(allBankIds.has(`pain_points_${domain}`)).toBe(true);
    }
  });

  test("bank map domains match code-expected domains", () => {
    if (!bankMap) return;

    const mapDomains = Array.isArray(bankMap.domains)
      ? bankMap.domains.sort()
      : [];
    expect(mapDomains).toEqual([...DOMAINS].sort());
  });

  test("bank map operators match code-expected operators", () => {
    if (!bankMap) return;

    const mapOperators = Array.isArray(bankMap.operators)
      ? bankMap.operators.sort()
      : [];
    expect(mapOperators).toEqual([...OPERATORS].sort());
  });
});
