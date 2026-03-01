import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import {
  LlmRequestBuilderService,
  type BuildRequestInput,
} from "../../services/llm/core/llmRequestBuilder.service";
import { PromptRegistryService } from "../../services/llm/prompts/promptRegistry.service";

function createPromptLoader() {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  const bankIds = ["prompt_registry", "system_base", "mode_chat", "fallback_prompt"];
  const banks = Object.fromEntries(
    bankIds.map((bankId) => [
      bankId,
      JSON.parse(
        fs.readFileSync(path.join(promptRoot, `${bankId}.any.json`), "utf8"),
      ),
    ]),
  );
  return {
    getBank<T = any>(bankId: string): T {
      return (banks[bankId as keyof typeof banks] ?? null) as T;
    },
  };
}

function createInput(overrides?: Partial<BuildRequestInput>): BuildRequestInput {
  return {
    env: "local" as any,
    route: {
      provider: "openai",
      model: "gpt-5-mini",
      reason: "quality_finish",
      stage: "final",
      constraints: {},
    },
    outputLanguage: "en",
    userText: "Find this in my locked document",
    signals: {
      answerMode: "general_answer",
      intentFamily: "documents",
      operator: "extract",
      operatorFamily: "qa",
      fallback: {
        triggered: true,
        reasonCode: "scope_hard_constraints_empty",
      },
      productHelpTopic: "limitations_memory_scope",
      productHelpSnippet:
        "Editing is selection/range first; resolve targets before broad changes.",
    },
    ...overrides,
  } as BuildRequestInput;
}

describe("Integration: help/fallback prompt wiring", () => {
  test("fallback prompt path preserves reason code and carries product-help slots", () => {
    const loader = createPromptLoader();
    const realPrompts = new PromptRegistryService(loader as any);
    let capturedPromptCtx: Record<string, unknown> | null = null;
    const promptProxy = {
      buildPrompt(kind: any, ctx: any) {
        capturedPromptCtx = ctx;
        return realPrompts.buildPrompt(kind, ctx);
      },
    };
    const builder = new LlmRequestBuilderService(promptProxy as any);

    const req = builder.build(createInput());
    const meta = (req.kodaMeta || {}) as Record<string, any>;
    const trace = meta.promptTrace as
      | { orderedPrompts?: Array<{ bankId: string }> }
      | undefined;

    expect(meta.promptType).toBe("fallback");
    expect(meta.reasonCodes).toContain("scope_hard_constraints_empty");
    expect(
      (trace?.orderedPrompts || []).some((entry) => entry.bankId === "fallback_prompt"),
    ).toBe(true);
    expect((capturedPromptCtx?.slots as Record<string, string>)?.productHelpTopic).toBe(
      "limitations_memory_scope",
    );
    expect(
      (capturedPromptCtx?.slots as Record<string, string>)?.productHelpSnippet,
    ).toContain("selection/range");
  });
});
