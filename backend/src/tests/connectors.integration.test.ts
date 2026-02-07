import fs from "fs/promises";
import path from "path";

function assertOperatorBankShape(bank: any): void {
  expect(typeof bank.bankId).toBe("string");
  expect(typeof bank.version).toBe("string");
  expect(Array.isArray(bank.localeSupport)).toBe(true);
  expect(bank.localeSupport).toEqual(expect.arrayContaining(["en", "pt"]));
  expect(typeof bank.description).toBe("string");
  expect(Array.isArray(bank.operators)).toBe(true);
}

describe("connector operators databank", () => {
  it("parses and contains bilingual operators", async () => {
    const p = path.join(__dirname, "..", "data_banks", "operators", "connector_operators.any.json");
    const raw = await fs.readFile(p, "utf8");
    const bank = JSON.parse(raw);

    assertOperatorBankShape(bank);

    const providers = new Set(["gmail", "outlook", "slack"]);
    const opIds = new Set(bank.operators.map((o: any) => o.operatorId));
    expect(opIds.has("connect_gmail")).toBe(true);
    expect(opIds.has("sync_slack")).toBe(true);

    // Sample a few operators for EN/PT density (avoid iterating everything).
    const sample = bank.operators.filter((o: any) => providers.has(o.provider || "gmail")).slice(0, 6);
    for (const op of sample) {
      expect(Array.isArray(op.patterns?.en)).toBe(true);
      expect(Array.isArray(op.patterns?.pt)).toBe(true);
      expect(op.patterns.en.length).toBeGreaterThanOrEqual(10);
      expect(op.patterns.pt.length).toBeGreaterThanOrEqual(10);
      expect(op.examples?.en?.length).toBeGreaterThanOrEqual(8);
      expect(op.examples?.pt?.length).toBeGreaterThanOrEqual(8);
    }
  });
});

