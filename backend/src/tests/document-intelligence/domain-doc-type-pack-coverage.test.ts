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

const DATA_BANKS_ROOT = resolveDataBanksRoot();
const DOMAINS_ROOT = path.join(
  DATA_BANKS_ROOT,
  "document_intelligence",
  "domains",
);
const PRIORITY_DOMAINS = ["finance", "accounting", "legal", "medical"] as const;
const PLANNED_NEXT_DOMAINS = [
  "procurement",
  "compliance_regulatory",
  "supply_chain_logistics",
  "public_sector",
  "research_scientific",
  "sales_crm",
  "manufacturing",
  "commercial_real_estate",
] as const;

describe("Terminal 3 domain/doc-type pack coverage", () => {
  test("priority domains expose the current runtime-wired root pack contract", () => {
    const failures: string[] = [];

    for (const domain of PRIORITY_DOMAINS) {
      const domainRoot = path.join(DOMAINS_ROOT, domain);
      const requiredFiles = [
        "domain_profile.any.json",
        "retrieval_strategies.any.json",
        "evidence_requirements.any.json",
        "validation_policies.any.json",
        "reasoning_scaffolds.any.json",
      ];

      for (const filename of requiredFiles) {
        const fullPath = path.join(domainRoot, filename);
        if (!fs.existsSync(fullPath)) {
          failures.push(`${domain}: missing ${filename}`);
        }
      }

      const catalogPath = path.join(
        domainRoot,
        "doc_types",
        "doc_type_catalog.any.json",
      );
      if (!fs.existsSync(catalogPath)) {
        failures.push(`${domain}: missing doc_types/doc_type_catalog.any.json`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("cataloged doc types resolve to required runtime pack files", () => {
    const failures: string[] = [];

    for (const domain of PRIORITY_DOMAINS) {
      const domainRoot = path.join(DOMAINS_ROOT, domain);
      const catalogPath = path.join(
        domainRoot,
        "doc_types",
        "doc_type_catalog.any.json",
      );
      const catalog = readJson(catalogPath);
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];

      for (const docType of docTypes) {
        const id = String(docType?.id ?? docType ?? "").trim();
        if (!id) {
          failures.push(`${domain}: catalog entry missing id`);
          continue;
        }

        const requiredPaths = [
          path.join(domainRoot, "doc_types", "sections", `${id}.sections.any.json`),
          path.join(
            domainRoot,
            "doc_types",
            "entities",
            `${id}.entities.schema.json`,
          ),
          path.join(domainRoot, "doc_types", "tables", `${id}.tables.any.json`),
          path.join(
            domainRoot,
            "doc_types",
            "extraction",
            `${id}.extraction_hints.any.json`,
          ),
        ];

        for (const requiredPath of requiredPaths) {
          if (!fs.existsSync(requiredPath)) {
            failures.push(
              `${domain}:${id}: missing ${path.relative(domainRoot, requiredPath)}`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("catalog packRefs stay structurally aligned when present", () => {
    const failures: string[] = [];

    for (const domain of PRIORITY_DOMAINS) {
      const catalogPath = path.join(
        DOMAINS_ROOT,
        domain,
        "doc_types",
        "doc_type_catalog.any.json",
      );
      const catalog = readJson(catalogPath);
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];

      for (const docType of docTypes) {
        const id = String(docType?.id ?? "").trim();
        const packRefs = docType?.packRefs ?? {};
        for (const family of ["sections", "entities", "tables", "extraction"]) {
          if (packRefs?.[family] == null) continue;

          const refs = Array.isArray(packRefs[family]) ? packRefs[family] : null;
          if (!refs || refs.length === 0) {
            failures.push(`${domain}:${id}: ${family} packRefs empty or invalid`);
            continue;
          }

          const badRefs = refs.filter((ref: unknown) => {
            const normalized = String(ref || "").trim();
            if (!normalized) return true;
            if (family === "sections") return !normalized.includes("sections");
            if (family === "entities") return !normalized.includes("entities");
            if (family === "tables") return !normalized.includes("tables");
            return !normalized.includes("extraction");
          });

          if (badRefs.length > 0) {
            failures.push(
              `${domain}:${id}: ${family} packRefs malformed (${badRefs.join(", ")})`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("planned next domains are not silently present without full owned packs", () => {
    const present = PLANNED_NEXT_DOMAINS.filter((domain) =>
      fs.existsSync(path.join(DOMAINS_ROOT, domain)),
    );
    expect(present).toEqual([]);
  });

  test("terminal-3 contract deltas remain explicit blockers until shared manifests/runtime are extended", () => {
    const blockers: string[] = [];

    for (const domain of PRIORITY_DOMAINS) {
      const domainRoot = path.join(DOMAINS_ROOT, domain);
      const missingRootContract = [
        "domain_writer.any.json",
        "ambiguity_patterns.any.json",
        "gold_queries.any.json",
      ].filter((filename) => !fs.existsSync(path.join(domainRoot, filename)));

      if (!fs.existsSync(path.join(domainRoot, "validation_rules.any.json"))) {
        if (!fs.existsSync(path.join(domainRoot, "validation_policies.any.json"))) {
          missingRootContract.push("validation_rules.any.json|validation_policies.any.json");
        }
      }

      if (missingRootContract.length > 0) {
        blockers.push(`${domain}: ${missingRootContract.join(", ")}`);
      }

      const catalog = readJson(
        path.join(domainRoot, "doc_types", "doc_type_catalog.any.json"),
      );
      const docTypes = Array.isArray(catalog?.docTypes) ? catalog.docTypes : [];
      for (const docType of docTypes) {
        const id = String(docType?.id ?? "").trim();
        if (!id) continue;

        const ambiguityPath = path.join(
          domainRoot,
          "doc_types",
          "ambiguity",
          `${id}.any.json`,
        );
        const evalPath = path.join(domainRoot, "doc_types", "eval", `${id}.any.json`);
        const extractionAliasPath = path.join(
          domainRoot,
          "doc_types",
          "extraction",
          `${id}.any.json`,
        );

        if (!fs.existsSync(ambiguityPath)) {
          blockers.push(`${domain}:${id}: missing ambiguity/${id}.any.json`);
        }
        if (!fs.existsSync(evalPath)) {
          blockers.push(`${domain}:${id}: missing eval/${id}.any.json`);
        }
        if (!fs.existsSync(extractionAliasPath)) {
          blockers.push(`${domain}:${id}: missing extraction/${id}.any.json`);
        }
      }
    }

    expect(blockers.length).toBeGreaterThan(0);
  });
});
