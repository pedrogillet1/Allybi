import fs from "fs/promises";
import path from "path";

describe("connector operators databank", () => {
  it("parses and contains bilingual operators", async () => {
    const p = path.join(
      __dirname,
      "..",
      "data_banks",
      "operators",
      "connector_operators.any.json",
    );
    const raw = await fs.readFile(p, "utf8");
    const bank = JSON.parse(raw);

    expect(typeof bank._meta?.id).toBe("string");
    expect(typeof bank._meta?.version).toBe("string");
    expect(Array.isArray(bank._meta?.languages)).toBe(true);
    expect(bank._meta.languages).toEqual(expect.arrayContaining(["en", "pt"]));
    expect(typeof bank._meta?.description).toBe("string");
    expect(typeof bank.operators).toBe("object");

    const providers = new Set(["gmail", "outlook", "slack"]);
    const opIds = new Set(Object.keys(bank.operators));
    expect(opIds.has("connect_gmail")).toBe(true);
    expect(opIds.has("sync_slack")).toBe(true);

    // Sample a few operators for EN/PT density (avoid iterating everything).
    const allOps = Object.values(bank.operators);
    const sample = allOps
      .filter((o: any) => providers.has(o.provider || "gmail"))
      .slice(0, 6);
    for (const op of sample as any[]) {
      expect(Array.isArray(op.patterns?.en)).toBe(true);
      expect(Array.isArray(op.patterns?.pt)).toBe(true);
      expect(op.patterns.en.length).toBeGreaterThanOrEqual(12);
      expect(op.patterns.pt.length).toBeGreaterThanOrEqual(12);
      expect(op.examples?.en?.length).toBeGreaterThanOrEqual(8);
      expect(op.examples?.pt?.length).toBeGreaterThanOrEqual(8);
    }
  });
});
