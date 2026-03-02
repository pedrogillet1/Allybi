import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { writeCertificationGateReport } from "./reporting";

function loadPromptBank(fileName: string): any {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  return JSON.parse(fs.readFileSync(path.join(promptRoot, fileName), "utf8"));
}

describe("Certification: gateway JSON routing metadata", () => {
  test("planner/editing prompt templates declare explicit outputMode contracts", () => {
    const planner = loadPromptBank("task_plan_generation.any.json");
    const editing = loadPromptBank("editing_task_prompts.any.json");
    const failures: string[] = [];
    const metrics: Record<string, number> = {};

    const validateBank = (
      bank: any,
      bankId: string,
      opts?: { plannerMustBeMachineJson?: boolean },
    ) => {
      const templates = Array.isArray(bank?.templates) ? bank.templates : [];
      let machineJsonCount = 0;
      for (const template of templates) {
        const templateId = String(template?.id || "template");
        const outputMode = String(template?.outputMode || "")
          .trim()
          .toLowerCase();
        if (!outputMode) {
          failures.push(`MISSING_OUTPUT_MODE:${bankId}:${templateId}`);
          continue;
        }
        if (!["machine_json", "user_text"].includes(outputMode)) {
          failures.push(`INVALID_OUTPUT_MODE:${bankId}:${templateId}:${outputMode}`);
          continue;
        }
        if (outputMode === "machine_json") machineJsonCount += 1;
        if (opts?.plannerMustBeMachineJson && outputMode !== "machine_json") {
          failures.push(`PLANNER_NOT_MACHINE_JSON:${bankId}:${templateId}`);
        }
      }
      metrics[`${bankId}TemplateCount`] = templates.length;
      metrics[`${bankId}MachineJsonCount`] = machineJsonCount;
    };

    validateBank(planner, "task_plan_generation", {
      plannerMustBeMachineJson: true,
    });
    validateBank(editing, "editing_task_prompts");

    writeCertificationGateReport("gateway-json-routing", {
      passed: failures.length === 0,
      metrics,
      thresholds: {
        task_plan_generation_requires_machine_json: true,
        editing_task_prompts_requires_explicit_output_mode: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
