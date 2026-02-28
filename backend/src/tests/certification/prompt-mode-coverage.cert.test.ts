import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import { PromptRegistryService } from "../../services/llm/prompts/promptRegistry.service";
import { writeCertificationGateReport } from "./reporting";

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

describe("Certification: prompt mode coverage", () => {
  test("compose-answer prompt selection covers all active runtime modes", () => {
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

    const uncovered: string[] = [];
    for (const answerMode of activeModes) {
      const bundle = service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode,
        operator: "extract",
        operatorFamily: "qa",
      });
      const selected = bundle.debug?.selectedTemplateIds || [];
      if (selected.some((templateId) => templateId.endsWith(":meta.description"))) {
        uncovered.push(answerMode);
      }
    }

    const failures = uncovered.map((mode) => `UNCOVERED_MODE:${mode}`);
    writeCertificationGateReport("prompt-mode-coverage", {
      passed: failures.length === 0,
      metrics: {
        coveredModes: activeModes.length - uncovered.length,
        totalModes: activeModes.length,
      },
      thresholds: {
        coveredModes: activeModes.length,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
