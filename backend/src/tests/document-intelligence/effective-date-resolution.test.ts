import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("effective_date_resolution", () => {
  const BANK_PATH = path.join(BANKS_ROOT, "patterns/doc_refs/effective_date_resolution.any.json");

  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("has valid _meta", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw._meta.id).toBe("effective_date_resolution");
  });

  it("defines at least 5 resolution rules", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw.rules.length).toBeGreaterThanOrEqual(5);
  });

  it("each rule has id, trigger, resolution, and priority", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    for (const rule of raw.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.trigger).toBeTruthy();
      expect(rule.resolution).toBeTruthy();
      expect(typeof rule.priority).toBe("number");
    }
  });

  it("is registered in bank_registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const match = (registry.banks || []).find(
      (b: Record<string, unknown>) => b.id === "effective_date_resolution",
    );
    expect(match).toBeTruthy();
  });
});

