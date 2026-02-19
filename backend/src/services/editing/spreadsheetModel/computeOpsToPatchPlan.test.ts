import { describe, expect, test } from "@jest/globals";
import { computeOpsToPatchPlan } from "./computeOpsToPatchPlan";

describe("computeOpsToPatchPlan", () => {
  test("normalizes noisy sheet name like 'Make Sheet1' to known sheet", () => {
    const out = computeOpsToPatchPlan({
      ops: [
        {
          kind: "set_values",
          rangeA1: "Make Sheet1!F5",
          values: [[123]],
        },
      ],
      activeSheetName: "Sheet1",
      semanticIndex: {
        Sheet1: {
          sheetName: "Sheet1",
          columns: {},
          rowGroups: [],
          keyCells: {},
        },
      },
    });

    expect(out.patchOps.length).toBe(1);
    expect(out.patchOps[0]?.op).toBe("SET_VALUE");
    expect((out.patchOps[0] as any)?.range).toBe("Sheet1!F5");
    expect((out.patchOps[0] as any)?.sheet).toBe("Sheet1");
  });

  test("supports create_chart specs with two ranges", () => {
    const out = computeOpsToPatchPlan({
      ops: [
        {
          kind: "create_chart",
          spec: {
            type: "BAR",
            range: "SUMMARY1!C5:C12",
            labelRange: "SUMMARY1!C5:C12",
            valueRange: "SUMMARY1!G5:G12",
          },
        },
      ],
      activeSheetName: "SUMMARY1",
      semanticIndex: {
        SUMMARY1: {
          sheetName: "SUMMARY1",
          columns: {},
          rowGroups: [],
          keyCells: {},
        },
      },
    });

    expect(out.patchOps.length).toBe(1);
    expect(out.patchOps[0]?.op).toBe("CREATE_CHART_CARD");
    expect(((out.patchOps[0] as any)?.chart || {}).settings?.labelRange).toBe(
      "SUMMARY1!C5:C12",
    );
    expect(((out.patchOps[0] as any)?.chart || {}).settings?.valueRange).toBe(
      "SUMMARY1!G5:G12",
    );
  });
});
