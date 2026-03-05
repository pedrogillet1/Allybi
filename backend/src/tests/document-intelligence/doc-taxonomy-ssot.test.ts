import * as fs from "fs";
import * as path from "path";
import { describe, expect, it, test } from "vitest";

function resolveDataBanksRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "data_banks"),
    path.resolve(process.cwd(), "src", "data_banks"),
    path.resolve(process.cwd(), "backend", "src", "data_banks"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Cannot locate src/data_banks root");
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();
const CANONICAL_PATH = path.join(
  DATA_BANKS_ROOT,
  "semantics",
  "taxonomy",
  "doc_taxonomy.any.json",
);
const NORMALIZERS_DUPLICATE_PATH = path.join(
  DATA_BANKS_ROOT,
  "normalizers",
  "doc_taxonomy.any.json",
);
const REGISTRY_PATH = path.join(
  DATA_BANKS_ROOT,
  "manifest",
  "bank_registry.any.json",
);

const EXPECTED_DOMAINS = [
  "accounting",
  "banking",
  "billing",
  "education",
  "everyday",
  "finance",
  "housing",
  "hr_payroll",
  "identity",
  "insurance",
  "legal",
  "medical",
  "ops",
  "tax",
  "travel",
] as const;

describe("doc_taxonomy SSOT", () => {
  test("canonical doc_taxonomy file exists at the expected path", () => {
    expect(fs.existsSync(CANONICAL_PATH)).toBe(true);
  });

  test("normalizers duplicate has been removed", () => {
    expect(fs.existsSync(NORMALIZERS_DUPLICATE_PATH)).toBe(false);
  });

  test("canonical taxonomy covers all 16 domains", () => {
    const taxonomy = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
    const clusterDomains = Object.keys(taxonomy.clusters).sort();
    expect(clusterDomains).toEqual([...EXPECTED_DOMAINS].sort());
  });

  test("canonical taxonomy version is 3.0.0+", () => {
    const taxonomy = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
    const version = taxonomy._meta?.version ?? "0.0.0";
    const [major] = version.split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(3);
  });

  test("no duplicate doc_taxonomy entries in bank_registry", () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    const banks: any[] = Array.isArray(registry?.banks) ? registry.banks : [];
    const taxonomyEntries = banks.filter(
      (b: any) =>
        typeof b?.id === "string" &&
        b.id.startsWith("doc_taxonomy"),
    );

    const ids = taxonomyEntries.map((b: any) => b.id);
    expect(ids).toEqual(["doc_taxonomy"]);
  });

  test("bank_registry doc_taxonomy entry points to canonical path", () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    const banks: any[] = Array.isArray(registry?.banks) ? registry.banks : [];
    const entry = banks.find((b: any) => b?.id === "doc_taxonomy");

    expect(entry).toBeDefined();
    expect(entry.path).toBe("semantics/taxonomy/doc_taxonomy.any.json");
  });

  test("each domain cluster has at least one doc type", () => {
    const taxonomy = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
    const emptyDomains: string[] = [];

    for (const domain of EXPECTED_DOMAINS) {
      const types = taxonomy.clusters[domain];
      if (!Array.isArray(types) || types.length === 0) {
        emptyDomains.push(domain);
      }
    }

    expect(emptyDomains).toEqual([]);
  });
});

describe("table_header_ontology SSOT", () => {
  const CANONICAL_DIR = path.join(DATA_BANKS_ROOT, "semantics/structure");
  const STALE_DIR = path.join(DATA_BANKS_ROOT, "document_intelligence/semantics/structure");

  it("no table_header_ontology files exist in document_intelligence/semantics/structure", () => {
    if (!fs.existsSync(STALE_DIR)) return;
    const staleFiles = fs.readdirSync(STALE_DIR).filter(
      (f) => f.startsWith("table_header_ontology.") && f.endsWith(".any.json"),
    );
    expect(staleFiles).toEqual([]);
  });

  it("all table_header_ontology IDs in bank_registry use canonical path", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(DATA_BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const entries = (registry.banks || []).filter(
      (b: Record<string, unknown>) =>
        typeof b.id === "string" &&
        (b.id as string).startsWith("table_header_ontology_"),
    );
    for (const entry of entries) {
      expect(entry.path).toContain("semantics/structure/");
      expect(entry.path).not.toContain("document_intelligence/semantics/structure/");
      expect(entry.id).not.toMatch(/_v[0-9a-f]+$/);
    }
  });
});
