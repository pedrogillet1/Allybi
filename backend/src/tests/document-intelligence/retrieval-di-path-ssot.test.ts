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
  throw new Error("Cannot locate src/data_banks root");
}

const DATA_BANKS_ROOT = resolveDataBanksRoot();
const REGISTRY_PATH = path.join(
  DATA_BANKS_ROOT,
  "manifest",
  "bank_registry.any.json",
);
const SCHEMA_REGISTRY_PATH = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence",
  "manifest",
  "bank_schema_registry.any.json",
);

const DI_DOMAINS = [
  "finance",
  "legal",
  "medical",
  "ops",
  "accounting",
] as const;
const DI_BANK_IDS = DI_DOMAINS.flatMap((domain) => [
  `boost_rules_${domain}`,
  `query_rewrites_${domain}`,
  `section_priority_${domain}`,
]);

describe("retrieval DI path SSOT", () => {
  test("non-canonical retrieval/document_intelligence DI files do not exist", () => {
    const nonCanonicalDir = path.join(
      DATA_BANKS_ROOT,
      "retrieval",
      "document_intelligence",
    );

    if (!fs.existsSync(nonCanonicalDir)) {
      return;
    }

    const files = fs
      .readdirSync(nonCanonicalDir)
      .filter((name) =>
        /^(boost_rules|query_rewrites|section_priority)\..+\.any\.json$/i.test(
          name,
        ),
      );

    expect(files).toEqual([]);
  });

  test("all retrieval DI registry entries point to canonical retrieval/*.any.json paths", () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    const banks = Array.isArray(registry?.banks) ? registry.banks : [];

    const badPaths: string[] = [];
    const missing: string[] = [];

    for (const bankId of DI_BANK_IDS) {
      const entry = banks.find((bank: any) => bank?.id === bankId);
      if (!entry) {
        missing.push(bankId);
        continue;
      }

      const bankPath = String(entry.path ?? "");
      const isCanonical =
        /^retrieval\/(boost_rules|query_rewrites|section_priority)\.[a-z]+\.any\.json$/.test(
          bankPath,
        ) && !bankPath.includes("retrieval/document_intelligence/");

      if (!isCanonical) {
        badPaths.push(`${bankId} -> ${bankPath}`);
      }
    }

    expect(missing).toEqual([]);
    expect(badPaths).toEqual([]);
  });

  test("schema registry retrieval path prefixes are canonical", () => {
    const schemaRegistry = JSON.parse(
      fs.readFileSync(SCHEMA_REGISTRY_PATH, "utf8"),
    );
    const families = Array.isArray(schemaRegistry?.schemaFamilies)
      ? schemaRegistry.schemaFamilies
      : [];

    const byId = new Map(
      families.map((family: any) => [String(family?.id ?? ""), family]),
    );

    expect(byId.get("retrieval_query_rewrites")?.pathPrefix).toBe(
      "retrieval/query_rewrites.",
    );
    expect(byId.get("retrieval_boost_rules")?.pathPrefix).toBe(
      "retrieval/boost_rules.",
    );
    expect(byId.get("retrieval_section_priority")?.pathPrefix).toBe(
      "retrieval/section_priority.",
    );
  });
});
