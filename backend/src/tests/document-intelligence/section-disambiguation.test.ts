import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("section_disambiguation_policy", () => {
  const BANK_PATH = path.join(BANKS_ROOT, "ambiguity/section_disambiguation_policy.any.json");

  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("has valid _meta", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw._meta.id).toBe("section_disambiguation_policy");
  });

  it("defines section-level disambiguation rules", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const rules = raw.rules || [];
    expect(rules.length).toBeGreaterThanOrEqual(4);

    const ruleIds = rules.map((r: Record<string, unknown>) => r.id);
    expect(ruleIds).toContain("SDP_001_multi_doc_same_section");
    expect(ruleIds).toContain("SDP_002_section_alias_ambiguity");
    expect(ruleIds).toContain("SDP_003_clause_number_required");
    expect(ruleIds).toContain("SDP_004_section_autopick_single_match");
  });

  it("is registered in bank_registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const match = (registry.banks || []).find(
      (b: Record<string, unknown>) => b.id === "section_disambiguation_policy",
    );
    expect(match).toBeTruthy();
  });
});

