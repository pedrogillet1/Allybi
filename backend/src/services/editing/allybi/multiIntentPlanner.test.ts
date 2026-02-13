import { describe, expect, test } from "@jest/globals";
import { buildMultiIntentPlan } from "./multiIntentPlanner";

describe("buildMultiIntentPlan", () => {
  test("creates stable multi-op order for DOCX mixed intents", () => {
    const plan = buildMultiIntentPlan({
      domain: "docx",
      message: "translate to portuguese and make this bold and replace Orion with Aster",
      liveSelection: { paragraphId: "p1" },
    });

    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const ops = plan.steps.map((s) => s.canonicalOperator);
    const replaceIdx = ops.findIndex((x) => x.includes("REPLACE") || x.includes("FIND_REPLACE"));
    const translateIdx = ops.findIndex((x) => x.includes("TRANSLATE"));
    const formatIdx = ops.findIndex((x) => x.includes("STYLE") || x.includes("FORMAT"));
    if (replaceIdx >= 0 && formatIdx >= 0) expect(replaceIdx).toBeLessThan(formatIdx);
    if (translateIdx >= 0 && formatIdx >= 0) expect(translateIdx).toBeLessThan(formatIdx);
  });

  test("supports PT multi-intent joiners", () => {
    const plan = buildMultiIntentPlan({
      domain: "docx",
      message: "traduza para inglês e deixe em negrito e substitua Orion por Aster",
      liveSelection: { paragraphId: "p1" },
    });

    expect(plan.directives.length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
  });

  test("fans out steps across all selected XLSX ranges", () => {
    const plan = buildMultiIntentPlan({
      domain: "sheets",
      message: "set selected cells to 0",
      liveSelection: { selectedRanges: ["A1:A2", "C1:C2"] },
    });
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0]?.targetHint).toBe("A1:A2");
    expect(plan.steps[1]?.targetHint).toBe("C1:C2");
  });

  test("honors explicit translate-first wording", () => {
    const plan = buildMultiIntentPlan({
      domain: "docx",
      message: "first translate to portuguese, then replace Orion with Aster and make this bold",
      liveSelection: { paragraphId: "p1" },
    });
    const ops = plan.steps.map((s) => s.canonicalOperator);
    const translateIdx = ops.findIndex((x) => x.includes("TRANSLATE"));
    const replaceIdx = ops.findIndex((x) => x.includes("REPLACE") || x.includes("FIND_REPLACE"));
    if (translateIdx >= 0 && replaceIdx >= 0) expect(translateIdx).toBeLessThan(replaceIdx);
  });
});
