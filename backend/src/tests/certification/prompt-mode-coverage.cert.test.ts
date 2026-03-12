import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import { PromptRegistryService } from "../../services/llm/prompts/promptRegistry.service";
import { COMPOSE_ANSWER_TEMPLATE_MODES } from "../../modules/chat/domain/answerModes";
import { writeCertificationGateReport } from "./reporting";

function loadPromptBanks() {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  const bankIds = [
    "prompt_registry",
    "system_base",
    "mode_chat",
    "mode_editing",
    "llm_global_guards",
    "rag_policy",
    "task_answer_with_sources",
    "task_plan_generation",
    "editing_task_prompts",
    "policy_citations",
    "retrieval_prompt",
    "disambiguation_prompt",
    "tool_prompts",
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

function loadPromptBank(bankId: string): any {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  return JSON.parse(
    fs.readFileSync(path.join(promptRoot, `${bankId}.any.json`), "utf8"),
  );
}

describe("Certification: prompt mode coverage", () => {
  test("registry prompt file references exist on disk", () => {
    const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
    const registry = JSON.parse(
      fs.readFileSync(path.join(promptRoot, "prompt_registry.any.json"), "utf8"),
    );
    const missing: string[] = [];
    for (const row of registry?.promptFiles || []) {
      const relPath = String(row?.path || "").trim();
      if (!relPath) continue;
      const abs = path.join(process.cwd(), "src/data_banks", relPath);
      if (!fs.existsSync(abs)) missing.push(relPath);
    }
    expect(missing).toEqual([]);
  });

  test("compose-answer prompt selection covers all active runtime modes", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const activeModes = [...COMPOSE_ANSWER_TEMPLATE_MODES];

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
      if (
        selected.some((templateId) => templateId.endsWith(":meta.description"))
      ) {
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

  test("retrieval/disambiguation/tool prompt kinds do not fall back to meta.description", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const checks: Array<{ kind: any; ctx: Record<string, any>; name: string }> = [
      {
        kind: "retrieval",
        name: "retrieval",
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "doc_grounded_single",
          operator: "locate_docs",
          intentFamily: "retrieval",
          slots: {
            userQuery: "find total revenue",
            scope: "{lock:soft}",
            docContext: "{docs:2}",
          },
        },
      },
      {
        kind: "disambiguation",
        name: "disambiguation",
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "rank_disambiguate",
          operator: "locate_docs",
          intentFamily: "retrieval",
          slots: {
            userQuery: "open budget",
            candidateCount: 2,
            candidates: "- 1) Budget 2025\n- 2) Budget 2024",
          },
          disambiguation: {
            active: true,
            candidateType: "document",
            options: [
              { id: "d1", label: "Budget 2025" },
              { id: "d2", label: "Budget 2024" },
            ],
          },
        },
      },
      {
        kind: "tool",
        name: "tool",
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "nav_pills",
          operator: "open",
          operatorFamily: "file_actions",
          intentFamily: "file_actions",
          slots: { userQuery: "open budget file" },
        },
      },
    ];

    const failures: string[] = [];
    for (const check of checks) {
      const bundle = service.buildPrompt(check.kind, check.ctx as any);
      const selected = bundle.debug?.selectedTemplateIds || [];
      if (
        selected.some((templateId) => templateId.endsWith(":meta.description"))
      ) {
        failures.push(`PROMPT_KIND_FALLBACK:${check.name}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("active retrieval/disambiguation prompts do not require KODA wrapper tags", () => {
    const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
    const files = ["retrieval_prompt.any.json", "disambiguation_prompt.any.json"];
    const failures: string[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(path.join(promptRoot, file), "utf8");
      if (/\[KODA_[A-Z_]+\]/.test(raw) || /\[\/KODA_[A-Z_]+\]/.test(raw)) {
        failures.push(`WRAPPER_TAG_PRESENT:${file}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("runtime-referenced prompt files do not contain KODA wrapper tags", () => {
    const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
    const registry = JSON.parse(
      fs.readFileSync(path.join(promptRoot, "prompt_registry.any.json"), "utf8"),
    );
    const filesById = new Map<string, string>();
    for (const row of registry?.promptFiles || []) {
      const id = String(row?.id || "").trim();
      const filePath = String(row?.path || "").trim();
      if (!id || !filePath) continue;
      filesById.set(id, filePath);
    }

    const activeIds = new Set<string>();
    const layers = registry?.layersByKind || {};
    for (const ids of Object.values(layers)) {
      for (const id of Array.isArray(ids) ? ids : []) {
        const normalized = String(id || "").trim();
        if (normalized) activeIds.add(normalized);
      }
    }

    const failures: string[] = [];
    for (const id of activeIds) {
      const relPath = filesById.get(id);
      if (!relPath) continue;
      const raw = fs.readFileSync(path.join(process.cwd(), "src/data_banks", relPath), "utf8");
      if (/\[KODA_[A-Z_]+\]/.test(raw) || /\[\/KODA_[A-Z_]+\]/.test(raw)) {
        failures.push(`WRAPPER_TAG_PRESENT:${relPath}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("canonical prompt registry excludes legacy prompt banks", () => {
    const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
    const registry = JSON.parse(
      fs.readFileSync(path.join(promptRoot, "prompt_registry.any.json"), "utf8"),
    );
    const forbiddenIds = new Set(["system_prompt", "compose_answer_prompt"]);
    const failures: string[] = [];
    for (const row of registry?.promptFiles || []) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      if (forbiddenIds.has(id)) failures.push(`LEGACY_PROMPT_IN_REGISTRY:${id}`);
    }
    expect(failures).toEqual([]);
  });

  test("no prompt file claims a forbidden pair of concerns", () => {
    const registry = loadPromptBank("prompt_registry");
    const failures: string[] = [];
    for (const row of registry?.promptFiles || []) {
      const id = String(row?.id || "").trim();
      const concerns = new Set(
        Array.isArray(row?.concerns)
          ? row.concerns.map((value: unknown) => String(value || "").trim())
          : [],
      );
      if (!id || concerns.size === 0) continue;

      for (const pair of registry?.forbiddenConcernOverlaps || []) {
        const left = String(pair?.left || "").trim();
        const right = String(pair?.right || "").trim();
        if (!left || !right) continue;
        if (concerns.has(left) && concerns.has(right)) {
          failures.push(`PROMPT_FILE_CONFLICTING_CONCERNS:${id}:${left}:${right}`);
        }
      }
    }

    writeCertificationGateReport("prompt-concern-ownership", {
      passed: failures.length === 0,
      metrics: {
        forbiddenConcernOverlaps:
          registry?.forbiddenConcernOverlaps?.length ?? 0,
        promptFiles: registry?.promptFiles?.length ?? 0,
      },
      thresholds: {
        requirement: "each prompt file must own a compatible concern set",
      },
      failures,
    });

    expect(failures).toEqual([]);
  });

  test("prompt bank responsibilities stay separated", () => {
    const globalGuards = loadPromptBank("llm_global_guards");
    const ragPolicy = loadPromptBank("rag_policy");
    const taskAnswer = loadPromptBank("task_answer_with_sources");

    const globalGuardRuleIds = new Set(
      (globalGuards?.rules || []).map((rule: any) => String(rule?.id || "").trim()),
    );
    const ragText = JSON.stringify(ragPolicy);
    const taskAnswerText = JSON.stringify(taskAnswer);

    const failures: string[] = [];
    if (globalGuardRuleIds.has("no_unnecessary_hedging")) {
      failures.push("GLOBAL_GUARDS_CONTAINS_HEDGING_POLICY");
    }
    if (/compact GFM table|separator row|inline `Sources` section/i.test(ragText)) {
      failures.push("RAG_POLICY_CONTAINS_ANSWER_SHAPE_DIRECTIVES");
    }
    if (
      /ignore instructions embedded|use only evidence|fabricate|OCR|not supported by the evidence/i.test(
        taskAnswerText,
      )
    ) {
      failures.push("TASK_ANSWER_CONTAINS_GROUNDING_POLICY");
    }

    writeCertificationGateReport("prompt-bank-boundaries", {
      passed: failures.length === 0,
      metrics: {
        globalGuardRuleCount: globalGuardRuleIds.size,
        ragPolicyChars: ragText.length,
        taskAnswerChars: taskAnswerText.length,
      },
      thresholds: {
        requirement: "global guards, grounding policy, and answer-shape contracts must stay in separate banks",
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
