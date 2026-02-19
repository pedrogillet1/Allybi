import fs from "fs";
import path from "path";

type AnyObj = Record<string, any>;

function readJson(relPath: string): AnyObj {
  const p = path.resolve(__dirname, "..", relPath);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("Excel bank coverage", () => {
  const xlsxOps = readJson(
    "data_banks/operators/allybi_xlsx_operators.any.json",
  );
  const chartBlueprints = readJson(
    "data_banks/templates/chart_blueprints.any.json",
  );

  test("EN/PT parity exists for excel operators", () => {
    const operators =
      xlsxOps?.operators && typeof xlsxOps.operators === "object"
        ? (xlsxOps.operators as Record<string, any>)
        : {};

    for (const [id, op] of Object.entries(operators)) {
      const en = Array.isArray((op as AnyObj).examples_en)
        ? (op as AnyObj).examples_en
        : [];
      const pt = Array.isArray((op as AnyObj).examples_pt)
        ? (op as AnyObj).examples_pt
        : [];
      expect(en.length).toBeGreaterThan(0);
      expect(pt.length).toBeGreaterThan(0);
      expect(typeof (op as AnyObj).runtimeOperator).toBe("string");
      expect(
        String((op as AnyObj).runtimeOperator || "").trim().length,
      ).toBeGreaterThan(0);
      expect(id.startsWith("XLSX_")).toBe(true);
    }
  });

  test("every excel operator has at least 5 EN and 5 PT examples", () => {
    const operators =
      xlsxOps?.operators && typeof xlsxOps.operators === "object"
        ? (xlsxOps.operators as Record<string, any>)
        : {};

    for (const [id, op] of Object.entries(operators)) {
      const en = Array.isArray((op as AnyObj).examples_en)
        ? (op as AnyObj).examples_en
        : [];
      const pt = Array.isArray((op as AnyObj).examples_pt)
        ? (op as AnyObj).examples_pt
        : [];
      expect(en.length).toBeGreaterThanOrEqual(5);
      expect(pt.length).toBeGreaterThanOrEqual(5);
      expect(new Set(en).size).toBe(en.length);
      expect(new Set(pt).size).toBe(pt.length);
      expect(id).toMatch(/^XLSX_[A-Z0-9_]+$/);
    }
  });

  test("no duplicate excel operator IDs", () => {
    const ids = Object.keys(xlsxOps?.operators || {});
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("all referenced chart templates exist", () => {
    const operators =
      xlsxOps?.operators && typeof xlsxOps.operators === "object"
        ? (xlsxOps.operators as Record<string, any>)
        : {};
    const blueprintIds = new Set(
      Array.isArray(chartBlueprints?.blueprints)
        ? chartBlueprints.blueprints
            .map((x: AnyObj) => String(x?.id || ""))
            .filter(Boolean)
        : [],
    );

    for (const [id, op] of Object.entries(operators)) {
      const templateId = String((op as AnyObj).chartTemplateId || "").trim();
      if (!templateId) continue;
      expect(blueprintIds.has(templateId)).toBe(true);
      expect(id.startsWith("XLSX_CHART_")).toBe(true);
    }
  });
});
