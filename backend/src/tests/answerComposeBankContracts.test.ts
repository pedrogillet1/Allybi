import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";

function loadBank(relativePath: string): any {
  const full = path.resolve(process.cwd(), "src/data_banks", relativePath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function flattenMessages(obj: any): string {
  return JSON.stringify(obj).toLowerCase();
}

describe("answer composition bank contracts", () => {
  it("enforces attachment-only citation language across prompt banks", () => {
    const task = loadBank("prompts/task_answer_with_sources.any.json");
    const citations = loadBank("prompts/policy_citations.any.json");

    const taskText = flattenMessages(task);
    const citationText = flattenMessages(citations);

    expect(taskText).not.toMatch(/end with a [`']?sources[`']? section/);
    expect(taskText).not.toMatch(/append a [`']?sources[`']? section/);
    expect(citationText).not.toMatch(/append a [`']?sources[`']? section/);
    expect(citationText).toMatch(
      /never render an inline [`']?sources[`']? section/,
    );
  });

  it("keeps compose prompt contract aligned with no-json and no-inline-sources policy", () => {
    const compose = loadBank("prompts/compose_answer_prompt.any.json");
    const composeText = flattenMessages(compose);

    expect(compose.placeholders?.optional || []).toContain("{{brandName}}");
    expect(compose.config?.strictNoJsonOutput).toBe(true);
    expect(compose.config?.strictNoInlineSources).toBe(true);
    expect(composeText).not.toMatch(/output only the json object/);
  });

  it("references only registered integration hook bank ids in answer_style_policy", () => {
    const stylePolicy = loadBank("formatting/answer_style_policy.any.json");
    const registry = loadBank("manifest/bank_registry.any.json");
    const registeredIds = new Set(
      (registry.banks || []).map((b: any) => String(b.id || "")),
    );

    const hookIds = Object.values(stylePolicy.config?.integrationHooks || {});
    expect(hookIds.length).toBeGreaterThan(0);
    for (const hookId of hookIds) {
      expect(registeredIds.has(String(hookId))).toBe(true);
    }
  });
});
