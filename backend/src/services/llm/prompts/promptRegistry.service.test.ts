import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import { PromptRegistryService } from "./promptRegistry.service";

function loadPromptBanks() {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  const bankIds = [
    "prompt_registry",
    "system_base",
    "mode_chat",
    "rag_policy",
    "task_answer_with_sources",
    "policy_citations",
  ];
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
      return banks[bankId as keyof typeof banks] as T;
    },
  };
}

describe("PromptRegistryService compose_answer mode coverage", () => {
  test("never falls back to meta.description for active runtime answer modes", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const activeModes = [
      "doc_grounded_single",
      "doc_grounded_multi",
      "doc_grounded_quote",
      "doc_grounded_table",
      "general_answer",
      "help_steps",
      "nav_pills",
      "rank_disambiguate",
    ];
    for (const answerMode of activeModes) {
      const bundle = service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode,
        operator: "extract",
        operatorFamily: "qa",
      });
      const selected = bundle.debug?.selectedTemplateIds ?? [];
      expect(
        selected.some((templateId) => templateId.endsWith(":meta.description")),
      ).toBe(false);
    }
  });

  test("uses explicit templates for quote/table/help_steps modes", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const expectations: Record<string, string> = {
      doc_grounded_quote: "answer_with_quote_sources",
      doc_grounded_table: "answer_with_table_sources",
      help_steps: "answer_help_steps_scoped",
    };
    for (const [answerMode, expectedTemplate] of Object.entries(expectations)) {
      const bundle = service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode,
        operator: "extract",
        operatorFamily: "qa",
      });
      expect(bundle.debug?.selectedTemplateIds || []).toContain(expectedTemplate);
    }
  });

  test("fails fast for uncovered strict compose mode when strict flag is enabled", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: {
              compose_answer: ["task_answer_with_sources"],
            },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: {
              id: "task_answer_with_sources",
              version: "test",
              description: "fallback",
            },
            config: { enabled: true },
            templates: [],
          } as T;
        }
        return { config: { enabled: true } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    const prev = process.env.PROMPT_MODE_COVERAGE_STRICT;
    process.env.PROMPT_MODE_COVERAGE_STRICT = "1";
    try {
      expect(() =>
        service.buildPrompt("compose_answer", {
          env: "local",
          outputLanguage: "en",
          answerMode: "doc_grounded_quote",
        }),
      ).toThrow(/prompt_contract_uncovered_mode/);
    } finally {
      if (prev === undefined) delete process.env.PROMPT_MODE_COVERAGE_STRICT;
      else process.env.PROMPT_MODE_COVERAGE_STRICT = prev;
    }
  });

  test("allows uncovered strict mode when strict flag is disabled", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: {
              compose_answer: ["task_answer_with_sources"],
            },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: {
              id: "task_answer_with_sources",
              version: "test",
              description: "fallback",
            },
            config: { enabled: true },
            templates: [],
          } as T;
        }
        return { config: { enabled: true } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    const prev = process.env.PROMPT_MODE_COVERAGE_STRICT;
    process.env.PROMPT_MODE_COVERAGE_STRICT = "0";
    try {
      const bundle = service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_quote",
      });
      expect(bundle.messages.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.PROMPT_MODE_COVERAGE_STRICT;
      else process.env.PROMPT_MODE_COVERAGE_STRICT = prev;
    }
  });
});
