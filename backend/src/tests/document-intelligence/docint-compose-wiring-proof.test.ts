import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

const ROOT = path.resolve(__dirname, "..", "..");

function read(filePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, filePath), "utf8");
}

function readJson(filePath: string): any {
  return JSON.parse(read(filePath));
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

  test("compose bank usage policy maps every required compose bank id", () => {
    const source = read(
      "services/core/enforcement/composeMicrocopy.service.ts",
    );
    expect(source).toContain("COMPOSE_REQUIRED_BANK_IDS");
    expect(source).toContain("COMPOSE_BANK_USAGE_POLICY");
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
      expect(source).toContain(`${bankId}:`);
    }
  });

  test("compose critical banks keep EN/PT/ES locale coverage", () => {
    const bankPaths = [
      "data_banks/document_intelligence/compose/openers.any.json",
      "data_banks/document_intelligence/compose/followup_suggestions.any.json",
      "data_banks/document_intelligence/compose/fallback_messages.any.json",
      "data_banks/document_intelligence/compose/help_microcopy.any.json",
      "data_banks/document_intelligence/compose/response_templates.any.json",
      "data_banks/document_intelligence/compose/tone_profiles.any.json",
      "data_banks/document_intelligence/compose/voice_personality_profiles.any.json",
      "data_banks/document_intelligence/compose/verbosity_ladder.any.json",
      "data_banks/document_intelligence/compose/anti_robotic_style_rules.any.json",
      "data_banks/document_intelligence/compose/format_guardrails.any.json",
      "data_banks/document_intelligence/compose/table_render_policy.any.json",
      "data_banks/document_intelligence/compose/citation_policy.any.json",
    ];
    for (const bankPath of bankPaths) {
      const bank = readJson(bankPath);
      const languages = Array.isArray(bank?._meta?.languages)
        ? bank._meta.languages.map((entry: unknown) => String(entry || ""))
        : [];
      expect(languages).toEqual(expect.arrayContaining(["en", "pt", "es"]));
    }
  });

  test("follow-up manifest wiring keeps legacy id non-required and alias pinned to versioned id", () => {
    const aliases = readJson("data_banks/manifest/bank_aliases.any.json");
    const registry = readJson("data_banks/manifest/bank_registry.any.json");
    const dependencies = readJson("data_banks/manifest/bank_dependencies.any.json");

    const aliasRows = Array.isArray(aliases?.aliases) ? aliases.aliases : [];
    const legacyAlias = aliasRows.find(
      (entry: any) => String(entry?.alias || "") === "followup_suggestions",
    );
    expect(legacyAlias?.canonicalId).toBe("followup_suggestions_v1c6269cc");

    const registryRows = Array.isArray(registry?.banks) ? registry.banks : [];
    const legacyRegistry = registryRows.find(
      (entry: any) => String(entry?.id || "") === "followup_suggestions",
    );
    const versionedRegistry = registryRows.find(
      (entry: any) => String(entry?.id || "") === "followup_suggestions_v1c6269cc",
    );
    expect(legacyRegistry?.requiredByEnv?.production).toBe(false);
    expect(legacyRegistry?.requiredByEnv?.staging).toBe(false);
    expect(versionedRegistry?.requiredByEnv?.production).toBe(true);
    expect(versionedRegistry?.requiredByEnv?.staging).toBe(true);

    const dependencyRows = Array.isArray(dependencies?.banks) ? dependencies.banks : [];
    const legacyDependency = dependencyRows.find(
      (entry: any) => String(entry?.id || "") === "followup_suggestions",
    );
    expect(legacyDependency?.optional).toBe(true);
  });
});
