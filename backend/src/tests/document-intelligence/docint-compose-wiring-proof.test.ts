import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

const ROOT = path.resolve(__dirname, "..", "..");

function read(filePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, filePath), "utf8");
}

describe("Document intelligence compose wiring proof", () => {
  test("compose microcopy service consumes required compose banks", () => {
    const source = read(
      "services/core/enforcement/composeMicrocopy.service.ts",
    );
    const requiredBankIds = [
      "anti_robotic_style_rules",
      "citation_policy",
      "closers",
      "format_guardrails",
      "help_microcopy",
      "openers",
      "response_templates",
      "table_render_policy",
      "tone_profiles",
      "verbosity_ladder",
      "voice_personality_profiles",
      "followup_suggestions_v1c6269cc",
      "fallback_messages",
    ];
    for (const bankId of requiredBankIds) {
      expect(source).toContain(`"${bankId}"`);
    }
    expect(source).not.toContain(
      'getOptionalBank<FollowupSuggestionsBank>("followup_suggestions")',
    );
  });

  test("response enforcer delegates analytical copy + not-found to compose service", () => {
    const source = read(
      "services/core/enforcement/responseContractEnforcer.v2.service.ts",
    );
    expect(source).toContain("new ComposeMicrocopyService()");
    expect(source).toContain("resolveAnalyticalCopy");
    expect(source).toContain("resolveNotFoundLine");
  });
});
