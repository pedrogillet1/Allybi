import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

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

function loadJson(relPath: string): any {
  return JSON.parse(
    fs.readFileSync(path.join(DATA_BANKS_ROOT, relPath), "utf8"),
  );
}

describe("Semantics cross-layer integrity", () => {
  test("canonical domains are represented across taxonomy, archetypes, structure, and spreadsheet semantics", () => {
    const taxonomy = loadJson("semantics/taxonomy/doc_taxonomy.any.json");
    const spreadsheet = loadJson("semantics/spreadsheet_semantics.any.json");
    const canonicalDomains = Array.isArray(taxonomy?.config?.canonicalDomains)
      ? taxonomy.config.canonicalDomains.map((d: any) => String(d || "").trim())
      : [];
    expect(canonicalDomains.length).toBeGreaterThan(0);

    const sheetDomains = new Set(
      Array.isArray(spreadsheet?.config?.canonicalDomainCategories)
        ? spreadsheet.config.canonicalDomainCategories.map((d: any) =>
            String(d || "").trim(),
          )
        : [],
    );

    const failures: string[] = [];
    for (const domain of canonicalDomains) {
      const archetypePath = path.join(
        DATA_BANKS_ROOT,
        "semantics",
        "taxonomy",
        "doc_archetypes",
        `${domain}.any.json`,
      );
      if (!fs.existsSync(archetypePath)) {
        failures.push(`missing_archetype:${domain}`);
      }

      const headerPath = path.join(
        DATA_BANKS_ROOT,
        "semantics",
        "structure",
        `table_header_ontology.${domain}.any.json`,
      );
      if (!fs.existsSync(headerPath)) {
        failures.push(`missing_structure_headers:${domain}`);
      }

      if (!sheetDomains.has(domain)) {
        failures.push(`missing_spreadsheet_domain:${domain}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("domain ontology parent IDs are unique and include core canonical domains", () => {
    const domainOntology = loadJson("semantics/domain_ontology.any.json");
    const taxonomy = loadJson("semantics/taxonomy/doc_taxonomy.any.json");
    const canonical = new Set(
      Array.isArray(taxonomy?.config?.canonicalDomains)
        ? taxonomy.config.canonicalDomains.map((d: any) =>
            String(d || "").trim(),
          )
        : [],
    );
    const parents = Array.isArray(domainOntology?.parents)
      ? domainOntology.parents
      : [];
    const parentIds = parents.map((p: any) => String(p?.id || "").trim());
    const uniqueParentIds = new Set(parentIds);

    expect(uniqueParentIds.size).toBe(parentIds.length);
    for (const id of ["finance", "legal", "medical", "accounting"]) {
      expect(uniqueParentIds.has(id)).toBe(true);
    }
    // Compatibility domain remains canonical in taxonomy even if not a parent group.
    expect(canonical.has("ops")).toBe(true);
  });

  test("entity-role confusion graph references only declared role IDs", () => {
    const entityRole = loadJson("semantics/entity_role_ontology.any.json");
    const roleIds = new Set(
      Array.isArray(entityRole?.roles)
        ? entityRole.roles.map((r: any) => String(r?.id || "").trim())
        : [],
    );
    expect(roleIds.size).toBeGreaterThan(0);

    const graph = entityRole?.confusionGraph || {};
    const failures: string[] = [];
    for (const key of Object.keys(graph)) {
      const [left, right] = String(key || "").split("-");
      if (!roleIds.has(left)) failures.push(`unknown_role_in_confusion_graph:${left}`);
      if (!roleIds.has(right))
        failures.push(`unknown_role_in_confusion_graph:${right}`);
    }

    expect(failures).toEqual([]);
  });

  test("domain archetypes and structure ontologies are deeply curated per canonical domain", () => {
    const taxonomy = loadJson("semantics/taxonomy/doc_taxonomy.any.json");
    const canonicalDomains = Array.isArray(taxonomy?.config?.canonicalDomains)
      ? taxonomy.config.canonicalDomains.map((d: any) => String(d || "").trim())
      : [];

    const failures: string[] = [];
    for (const domain of canonicalDomains) {
      const archetypes = loadJson(
        `semantics/taxonomy/doc_archetypes/${domain}.any.json`,
      );
      const rows = Array.isArray(archetypes?.archetypes)
        ? archetypes.archetypes
        : [];
      if (rows.length === 0) {
        failures.push(`archetypes_empty:${domain}`);
        continue;
      }
      for (const row of rows) {
        const id = String(row?.id || "<missing>").trim();
        if (!Array.isArray(row?.expectedSections) || row.expectedSections.length < 3) {
          failures.push(`archetype_sections_thin:${domain}:${id}`);
        }
        if (!Array.isArray(row?.fieldFamilies) || row.fieldFamilies.length < 2) {
          failures.push(`archetype_fields_thin:${domain}:${id}`);
        }
        if (!Array.isArray(row?.redFlags) || row.redFlags.length < 2) {
          failures.push(`archetype_redflags_thin:${domain}:${id}`);
        }
      }

      const headers = loadJson(
        `semantics/structure/table_header_ontology.${domain}.any.json`,
      );
      const headerRows = Array.isArray(headers?.headers) ? headers.headers : [];
      if (headerRows.length < 8) {
        failures.push(`headers_thin:${domain}:${headerRows.length}`);
        continue;
      }
      for (const row of headerRows) {
        const canonical = String(row?.canonical || "<missing>").trim();
        const disamb = String(row?.disambiguationRuleId || "").trim();
        if (!disamb || disamb.startsWith("structure_tiebreak_default")) {
          failures.push(`headers_noncurated_disambiguation:${domain}:${canonical}`);
        }
        if (!String(row?.curationReason || "").trim()) {
          failures.push(`headers_missing_curation_reason:${domain}:${canonical}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("spreadsheet KPI semantics maintain behavioral contract fields", () => {
    const spreadsheet = loadJson("semantics/spreadsheet_semantics.any.json");
    const kpis = Array.isArray(spreadsheet?.kpiDefinitions)
      ? spreadsheet.kpiDefinitions
      : [];
    expect(kpis.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const kpi of kpis) {
      const id = String(kpi?.id || "<missing>").trim();
      if (!String(kpi?.formula || "").trim()) {
        failures.push(`kpi_formula_missing:${id}`);
      }
      if (!String(kpi?.unit || "").trim()) {
        failures.push(`kpi_unit_missing:${id}`);
      }
      const aliases = kpi?.aliases || {};
      const aliasCount =
        (Array.isArray(aliases?.en) ? aliases.en.length : 0) +
        (Array.isArray(aliases?.pt) ? aliases.pt.length : 0);
      if (aliasCount < 2) {
        failures.push(`kpi_alias_coverage_thin:${id}:${aliasCount}`);
      }
      if (
        !["higher_is_better", "lower_is_better", "neutral"].includes(
          String(kpi?.direction || "").trim(),
        )
      ) {
        failures.push(`kpi_direction_invalid:${id}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
