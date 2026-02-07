import fs from "fs/promises";
import path from "path";

describe("creative operators databank", () => {
  it("parses and contains bilingual creative operators", async () => {
    const p = path.join(__dirname, "..", "data_banks", "operators", "creative_operators.any.json");
    const raw = await fs.readFile(p, "utf8");
    const bank = JSON.parse(raw);

    expect(typeof bank._meta?.id).toBe("string");
    expect(typeof bank._meta?.version).toBe("string");
    expect(Array.isArray(bank._meta?.languages)).toBe(true);
    expect(bank._meta.languages).toEqual(expect.arrayContaining(["en", "pt"]));
    expect(typeof bank.operators).toBe("object");

    const opIds = new Set(Object.keys(bank.operators));
    expect(opIds.has("generate_slide_visual")).toBe(true);
    expect(opIds.has("generate_diagram_asset")).toBe(true);

    const sample = Object.values(bank.operators).slice(0, 5) as any[];
    for (const op of sample) {
      expect(op.patterns?.en?.length).toBeGreaterThanOrEqual(12);
      expect(op.patterns?.pt?.length).toBeGreaterThanOrEqual(12);
      expect(op.examples?.en?.length).toBeGreaterThanOrEqual(8);
      expect(op.examples?.pt?.length).toBeGreaterThanOrEqual(8);
    }
  });
});
