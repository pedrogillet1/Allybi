import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("domain_ontology SSOT alignment", () => {
  const diPath = path.join(
    BANKS_ROOT,
    "document_intelligence/semantics/domain_ontology.any.json",
  );
  const taxonomyPath = path.join(
    BANKS_ROOT,
    "semantics/taxonomy/doc_taxonomy.any.json",
  );

  it("DI domain_ontology declares dependsOn root domain_ontology", () => {
    const di = JSON.parse(fs.readFileSync(diPath, "utf-8"));
    expect(di._meta.dependsOn).toContain("domain_ontology");
  });

  it("DI canonical domains are a subset of taxonomy canonical domains", () => {
    const di = JSON.parse(fs.readFileSync(diPath, "utf-8"));
    const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, "utf-8"));
    const diDomains: string[] = di.config.canonicalDomainIds || [];
    const taxDomains: string[] =
      taxonomy.config?.canonicalDomains || taxonomy.canonicalDomains || [];

    for (const domain of diDomains) {
      expect(taxDomains).toContain(domain);
    }
  });

  it("no phantom domains exist (all DI domains have implementation folders)", () => {
    const di = JSON.parse(fs.readFileSync(diPath, "utf-8"));
    const diDomains: string[] = di.config.canonicalDomainIds || [];
    const domainsDir = path.join(BANKS_ROOT, "document_intelligence/domains");

    for (const domain of diDomains) {
      const domainDir = path.join(domainsDir, domain);
      expect(fs.existsSync(domainDir)).toBe(true);
    }
  });
});
