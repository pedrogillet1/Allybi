import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

import { PromptRegistryService } from "../services/llm/prompts/promptRegistry.service";
import {
  LlmRequestBuilderService,
  type BuildRequestInput,
} from "../services/llm/core/llmRequestBuilder.service";

type BankLoader = { getBank<T = any>(bankId: string): T };

function loadJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function makeFileBankLoader(): BankLoader {
  const root = path.resolve(process.cwd(), "src/data_banks/prompts");
  return {
    getBank<T = any>(bankId: string): T {
      const file = path.join(root, `${bankId}.any.json`);
      if (!fs.existsSync(file)) {
        throw new Error(`Missing bank file for ${bankId}`);
      }
      return loadJson(file) as T;
    },
  };
}

function mkInput(overrides: Partial<BuildRequestInput>): BuildRequestInput {
  return {
    env: "dev",
    route: {
      provider: "google",
      model: "gemini-2.0-flash",
      reason: "fast_path",
      stage: "final",
      constraints: {
        requireStreaming: false,
        disallowTools: true,
        disallowImages: true,
        maxLatencyMs: 5000,
      },
    },
    outputLanguage: "en",
    userText: "Summarize the key findings.",
    signals: {
      answerMode: "general_answer",
      intentFamily: "qa",
      operator: "answer",
      operatorFamily: null,
      disallowJsonOutput: true,
      maxQuestions: 1,
      fallback: { triggered: false },
    },
    ...overrides,
  };
}

describe("prompt compilation + selection regression", () => {
  const registry = new PromptRegistryService(makeFileBankLoader() as any);
  const builder = new LlmRequestBuilderService(registry);

  const scenarios: Array<{ id: string; input: BuildRequestInput }> = [
    {
      id: "chat_no_rag",
      input: mkInput({
        userText: "What is this document about?",
        signals: {
          answerMode: "general_answer",
          operator: "answer",
          operatorFamily: null,
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
      }),
    },
    {
      id: "chat_rag",
      input: mkInput({
        userText: "What is net income in the report?",
        signals: {
          answerMode: "doc_grounded_single",
          operator: "answer",
          operatorFamily: null,
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
        evidencePack: {
          evidence: [
            {
              docId: "doc-1",
              title: "Q4 Financials",
              snippet: "Net income for Q4 was $3,200,000.",
              evidenceType: "text",
            },
          ],
          stats: {
            evidenceItems: 1,
            uniqueDocsInEvidence: 1,
          },
        } as any,
      }),
    },
    {
      id: "docx_edit_plan",
      input: mkInput({
        userText: "Rewrite these bullets for clarity.",
        signals: {
          answerMode: "action_receipt",
          operator: "plan_edit",
          operatorFamily: "file_actions",
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
        toolContext: {
          toolName: "docx_edit_planner",
          toolArgs: { target: "paragraphs" },
        },
      }),
    },
    {
      id: "xlsx_edit_plan",
      input: mkInput({
        userText: "Plan updates for cells B2:B10.",
        signals: {
          answerMode: "action_receipt",
          operator: "plan_edit",
          operatorFamily: "file_actions",
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
        toolContext: {
          toolName: "xlsx_edit_planner",
          toolArgs: { range: "B2:B10" },
        },
      }),
    },
    {
      id: "multi_intent_plan",
      input: mkInput({
        userText:
          "First summarize, then rewrite the intro and update table values.",
        signals: {
          answerMode: "action_receipt",
          operator: "plan_multi_intent",
          operatorFamily: "file_actions",
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
        toolContext: {
          toolName: "multi_intent_planner",
          toolArgs: { steps: 3 },
        },
      }),
    },
  ];

  for (const s of scenarios) {
    test(`${s.id} compiles deterministically with prompt trace`, () => {
      const first = builder.build(s.input);
      const second = builder.build(s.input);

      expect(first.messages.length).toBeGreaterThan(0);
      expect(second.messages.length).toBeGreaterThan(0);

      const joined = first.messages.map((m) => m.content || "").join("\n\n");
      expect(joined).not.toMatch(/\{\{\w+\}\}/);
      expect(joined).not.toMatch(/\$\{\w+\}/);
      expect(joined.length).toBeLessThan(18000);

      const t1 = (first.kodaMeta as any)?.promptTrace;
      const t2 = (second.kodaMeta as any)?.promptTrace;

      expect(Array.isArray(t1?.orderedPrompts)).toBe(true);
      expect((t1?.orderedPrompts || []).length).toBeGreaterThan(0);
      expect(t1).toEqual(t2);
    });
  }

  test("chat fallback does not shadow retrieval/disambiguation-specific rules", () => {
    const retrievalReq = builder.build(
      mkInput({
        signals: {
          answerMode: "general_answer",
          operator: "locate_docs",
          operatorFamily: null,
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
      }),
    );

    expect((retrievalReq.kodaMeta as any)?.promptType).toBe("retrieval");

    const disambReq = builder.build(
      mkInput({
        signals: {
          answerMode: "rank_disambiguate",
          operator: "answer",
          operatorFamily: null,
          disallowJsonOutput: true,
          maxQuestions: 1,
          disambiguation: {
            active: true,
            candidateType: "document",
            options: [
              { id: "a", label: "Doc A" },
              { id: "b", label: "Doc B" },
            ],
            maxOptions: 4,
            maxQuestions: 1,
          },
          fallback: { triggered: false },
        } as any,
      }),
    );

    expect((disambReq.kodaMeta as any)?.promptType).toBe("disambiguation");
  });

  test("citation contract enforces attachment-based citations", () => {
    const rag = builder.build(
      mkInput({
        userText: "List the key revenue numbers.",
        signals: {
          answerMode: "doc_grounded_single",
          operator: "answer",
          operatorFamily: null,
          disallowJsonOutput: true,
          maxQuestions: 1,
          fallback: { triggered: false },
        } as any,
        evidencePack: {
          evidence: [
            {
              docId: "d1",
              title: "R",
              snippet: "Revenue is 10",
              evidenceType: "text",
            },
          ],
          stats: { evidenceItems: 1, uniqueDocsInEvidence: 1 },
        } as any,
      }),
    );
    const noRag = builder.build(mkInput({}));

    const ragPrompt = rag.messages.map((m) => m.content || "").join("\n");
    const noRagPrompt = noRag.messages.map((m) => m.content || "").join("\n");

    expect(ragPrompt).toMatch(/Do NOT include.*Sources section/i);
    expect(noRagPrompt).toMatch(/Do NOT include.*Sources section/i);
    expect(ragPrompt).not.toMatch(/append a [`']?Sources/i);
    expect(noRagPrompt).not.toMatch(/append a [`']?Sources/i);
    const ragTemplateIds = (
      (rag.kodaMeta as any)?.promptTrace?.orderedPrompts || []
    ).map((p: any) => String(p?.templateId || ""));
    const noRagTemplateIds = (
      (noRag.kodaMeta as any)?.promptTrace?.orderedPrompts || []
    ).map((p: any) => String(p?.templateId || ""));
    expect(ragTemplateIds).toContain("answer_with_sources");
    expect(noRagTemplateIds).toContain("answer_without_sources");
    expect(
      (rag.kodaMeta as any)?.promptTrace?.orderedPrompts?.length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      (noRag.kodaMeta as any)?.promptTrace?.orderedPrompts?.length ?? 0,
    ).toBeGreaterThan(0);
  });
});
