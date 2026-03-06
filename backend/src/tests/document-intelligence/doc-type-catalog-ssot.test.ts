import fs from "node:fs";
import path from "node:path";

type TypeRow = {
  id?: string;
  aliases?: string[];
};

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");
const TAXONOMY_PATH = path.join(
  BANKS_ROOT,
  "semantics/taxonomy/doc_taxonomy.any.json",
);
const DOMAINS_ROOT = path.join(BANKS_ROOT, "document_intelligence/domains");

const LEGAL_LEGACY_TO_CANONICAL: Record<string, string> = {
  nda: "legal_nda",
  msa: "legal_msa",
  sow: "legal_sow",
  dpa: "legal_dpa",
  lease: "legal_lease_agreement",
  terms: "legal_terms_of_service",
  litigation_memo: "legal_litigation_memo",
  privacy_policy: "legal_privacy_policy",
  board_resolution: "legal_board_resolution",
  employment_agreement: "legal_employment_agreement",
};

function loadJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("doc type catalog SSOT alignment", () => {
  test("catalog IDs canonicalize into taxonomy IDs without drift", () => {
    const taxonomy = loadJson(TAXONOMY_PATH);
    const taxonomyRows: TypeRow[] = Array.isArray(taxonomy?.typeDefinitions)
      ? taxonomy.typeDefinitions
      : [];

    const canonicalIds = new Set<string>();
    const aliasToCanonical = new Map<string, string>();
    for (const row of taxonomyRows) {
      const id = String(row?.id || "").trim().toLowerCase();
      if (!id) continue;
      canonicalIds.add(id);
      aliasToCanonical.set(id, id);
      const aliases = Array.isArray(row?.aliases) ? row.aliases : [];
      for (const alias of aliases) {
        const normalizedAlias = String(alias || "").trim().toLowerCase();
        if (!normalizedAlias) continue;
        aliasToCanonical.set(normalizedAlias, id);
      }
    }

    for (const [legacy, canonical] of Object.entries(LEGAL_LEGACY_TO_CANONICAL)) {
      aliasToCanonical.set(legacy, canonical);
    }

    const failures: string[] = [];
    const domainDirs = fs
      .readdirSync(DOMAINS_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const domain of domainDirs) {
      const catalogPath = path.join(
        DOMAINS_ROOT,
        domain,
        "doc_types/doc_type_catalog.any.json",
      );
      if (!fs.existsSync(catalogPath)) continue;
      const catalog = loadJson(catalogPath);
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
      const seenCanonical = new Map<string, string>();

      for (const row of docTypes) {
        const rawId = String(row?.id || "").trim().toLowerCase();
        if (!rawId) continue;
        const canonical = aliasToCanonical.get(rawId) || rawId;
        if (!canonicalIds.has(canonical)) {
          failures.push(`unknown_canonical:${domain}:${rawId}->${canonical}`);
          continue;
        }
        const firstRaw = seenCanonical.get(canonical);
        if (firstRaw) {
          const isAllowedLegacyDuplicate =
            domain === "legal" &&
            (LEGAL_LEGACY_TO_CANONICAL[rawId] === canonical ||
              LEGAL_LEGACY_TO_CANONICAL[firstRaw] === canonical);
          if (!isAllowedLegacyDuplicate) {
            failures.push(`duplicate_canonical_within_catalog:${domain}:${canonical}`);
          }
        }
        if (!firstRaw) {
          seenCanonical.set(canonical, rawId);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
