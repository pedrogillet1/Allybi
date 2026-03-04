import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

describe("amendment_chain_schema", () => {
  const BANK_PATH = path.join(BANKS_ROOT, "patterns/doc_refs/amendment_chain_schema.any.json");

  it("bank file exists", () => {
    expect(fs.existsSync(BANK_PATH)).toBe(true);
  });

  it("defines chain relationship types", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    expect(raw._meta.id).toBe("amendment_chain_schema");

    const relationships = raw.relationshipTypes || [];
    const types = relationships.map((r: Record<string, unknown>) => r.type);
    expect(types).toContain("amends");
    expect(types).toContain("supersedes");
    expect(types).toContain("restates");
    expect(types).toContain("extends");
    expect(types).toContain("terminates");
  });

  it("defines version status taxonomy", () => {
    const raw = JSON.parse(fs.readFileSync(BANK_PATH, "utf-8"));
    const statuses = raw.versionStatuses || [];
    const names = statuses.map((s: Record<string, unknown>) => s.status);
    expect(names).toContain("draft");
    expect(names).toContain("executed");
    expect(names).toContain("effective");
    expect(names).toContain("superseded");
    expect(names).toContain("terminated");
    expect(names).toContain("expired");
  });

  it("is registered in bank_registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "manifest/bank_registry.any.json"), "utf-8"),
    );
    const match = (registry.banks || []).find(
      (b: Record<string, unknown>) => b.id === "amendment_chain_schema",
    );
    expect(match).toBeTruthy();
  });
});
