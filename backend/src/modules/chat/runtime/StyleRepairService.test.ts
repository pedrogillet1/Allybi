import { describe, expect, test } from "@jest/globals";
import { StyleRepairService } from "./StyleRepairService";

describe("StyleRepairService", () => {
  test("strips macro openers and canned empathy", () => {
    const service = new StyleRepairService();

    const repaired = service.repair({
      content:
        "Short answer: I know this can be difficult. The document shows the clause applies.",
      evidenceStrength: "low",
      styleDecision: { openerFamily: "evidence_anchor" },
    });

    expect(repaired.content).not.toMatch(/^Short answer:/i);
    expect(repaired.content).not.toContain("I know this can be difficult");
    expect(repaired.repairs).toEqual(
      expect.arrayContaining([
        "strip_short_answer_prefix",
        "remove_fake_empathy",
        "downgrade_confidence_opening",
      ]),
    );
    expect(repaired.content).toContain("The document points to");
  });

  test("rotates opener when it repeats a recent turn lead signature", () => {
    const service = new StyleRepairService();

    const repaired = service.repair({
      content: "The document shows the clause applies.",
      evidenceStrength: "high",
      styleDecision: { openerFamily: "evidence_anchor" },
      turnStyleState: {
        assistantTurnsSeen: 2,
        recentLeadSignatures: ["the document shows"],
        recentCloserSignatures: [],
        lastAssistantPreview: "The document shows the prior clause applies.",
        repeatedLeadRisk: true,
        repeatedCloserRisk: false,
      },
    });

    expect(repaired.repairs).toContain("rotate_turn_opener");
    expect(repaired.content).toMatch(/^The text supports this:/);
  });
});
