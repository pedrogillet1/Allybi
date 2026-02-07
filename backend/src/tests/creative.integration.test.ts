import fs from "fs/promises";
import path from "path";

describe("creative operators databank", () => {
  it("parses and contains bilingual creative operators", async () => {
    const p = path.join(__dirname, "..", "data_banks", "operators", "creative_operators.any.json");
    const raw = await fs.readFile(p, "utf8");
    const bank = JSON.parse(raw);

    expect(typeof bank.bankId).toBe("string");
    expect(Array.isArray(bank.operators)).toBe(true);
    expect(bank.localeSupport).toEqual(expect.arrayContaining(["en", "pt"]));

    const opIds = new Set(bank.operators.map((o: any) => o.operatorId));
    expect(opIds.has("generate_slide_visual")).toBe(true);
    expect(opIds.has("generate_diagram_asset")).toBe(true);

    const sample = bank.operators.slice(0, 5);
    for (const op of sample) {
      expect(op.patterns?.en?.length).toBeGreaterThanOrEqual(10);
      expect(op.patterns?.pt?.length).toBeGreaterThanOrEqual(10);
      expect(op.examples?.en?.length).toBeGreaterThanOrEqual(8);
      expect(op.examples?.pt?.length).toBeGreaterThanOrEqual(8);
    }
  });
});

