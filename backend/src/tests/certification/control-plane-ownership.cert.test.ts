import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { PromptRegistryService } from "../../services/llm/prompts/promptRegistry.service";

function readFile(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(process.cwd(), relativePath),
    "utf8",
  );
}

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
    "compose_style_contract",
    "task_plan_generation",
    "editing_task_prompts",
    "policy_citations",
    "retrieval_prompt",
    "disambiguation_prompt",
    "fallback_prompt",
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

describe("Certification: control plane ownership", () => {
  test("runtime-applied prompt banks are registry declared", () => {
    const registry = JSON.parse(
      readFile("src/data_banks/prompts/prompt_registry.any.json"),
    );
    const declared = new Set<string>([
      "prompt_registry",
      ...((registry.promptFiles || []).map((row: any) => String(row?.id || "").trim())),
    ]);
    const service = new PromptRegistryService(loadPromptBanks());
    const checks = [
      {
        kind: "compose_answer" as const,
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "doc_grounded_single",
          operator: "extract",
        },
      },
      {
        kind: "retrieval" as const,
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "doc_grounded_single",
          operator: "locate_docs",
          intentFamily: "retrieval",
          slots: {
            userQuery: "find revenue",
            scope: "{lock:soft}",
            docContext: "{docs:2}",
          },
        },
      },
      {
        kind: "disambiguation" as const,
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "rank_disambiguate",
          operator: "locate_docs",
          disambiguation: {
            active: true,
            candidateType: "document",
            options: [{ id: "d1", label: "Budget 2025" }],
          },
        },
      },
      {
        kind: "fallback" as const,
        ctx: {
          env: "local",
          outputLanguage: "en",
          answerMode: "general_answer",
          fallback: { triggered: true, reasonCode: "no_docs_indexed" },
        },
      },
    ];

    const failures: string[] = [];
    for (const check of checks) {
      const bundle = service.buildPrompt(check.kind, check.ctx as any);
      for (const bankId of bundle.debug?.usedBankIds || []) {
        if (!declared.has(bankId)) {
          failures.push(`UNDECLARED_RUNTIME_PROMPT_BANK:${check.kind}:${bankId}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("required prompt concerns are covered exactly through declared layers", () => {
    const registry = JSON.parse(
      readFile("src/data_banks/prompts/prompt_registry.any.json"),
    );
    const concernByBankId = new Map<string, Set<string>>();
    for (const row of registry.promptFiles || []) {
      concernByBankId.set(
        String(row?.id || "").trim(),
        new Set(
          Array.isArray(row?.concerns)
            ? row.concerns.map((value: unknown) => String(value || "").trim())
            : [],
        ),
      );
    }

    const failures: string[] = [];
    for (const [kind, requiredConcerns] of Object.entries(
      registry.requiredConcernsByKind || {},
    )) {
      const covered = new Set<string>();
      for (const bankId of registry.layersByKind?.[kind] || []) {
        for (const concern of concernByBankId.get(bankId) || []) {
          covered.add(concern);
        }
      }
      for (const concern of requiredConcerns as string[]) {
        if (!covered.has(concern)) {
          failures.push(`MISSING_REQUIRED_CONCERN:${kind}:${concern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("retrieval prompt composition stays machine-json safe", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const bundle = service.buildPrompt("retrieval", {
      env: "local",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
      operator: "locate_docs",
      disallowJsonOutput: false,
      runtimeSignals: {
        retrievalPlanning: true,
        machineJsonOutput: true,
      },
      slots: {
        userQuery: "find revenue",
        scope: "{lock:soft}",
        docContext: "{docs:2}",
      },
    } as any);
    const systemText = bundle.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");

    expect(bundle.debug?.selectedTemplateIds || []).toContain(
      "machine_json_runtime_contract",
    );
    expect(systemText).toContain("return only the requested JSON object");
    expect(systemText).not.toContain("never output raw user-facing JSON;");
  });

  test("builder and enforcer consume centralized budget resolution directly", () => {
    const builderSource = readFile(
      "src/services/llm/core/llmRequestBuilder.service.ts",
    );
    const enforcerSource = readFile(
      "src/services/core/enforcement/responseContractEnforcer.service.ts",
    );

    expect(builderSource).toContain("resolveOutputBudget({");
    expect(enforcerSource).toContain("resolveOutputBudget({");
    expect(builderSource).not.toContain("docGroundedMinOutputTokensByMode");
    expect(builderSource).not.toContain("styleClampModes");
    expect(builderSource).not.toContain("options.maxOutputTokens = Math.min(");
    expect(enforcerSource).not.toContain(
      "Math.min(this.resolveSoftTokenLimitInternal(ctx), 180)",
    );
  });

  test("quality gates stay verifier-only for formatting and brevity", () => {
    const qualityBank = readFile("src/data_banks/quality/quality_gates.any.json");
    const qualityRunner = readFile(
      "src/services/core/enforcement/qualityGateRunner.service.ts",
    );
    const qualityRegistry = readFile(
      "src/services/core/enforcement/qualityGateRegistry.ts",
    );

    expect(qualityBank).not.toMatch(/"maxSentences"\s*:/);
    expect(qualityBank).not.toMatch(/"maxChars"\s*:/);
    expect(qualityRunner).not.toContain("sentenceCount > 1");
    expect(qualityRunner).not.toContain("Navigation mode body must be a single sentence intro.");
    expect(qualityRunner).not.toContain("DocumentIntelligence");
    expect(qualityRunner).not.toContain("runDocumentIntelligencePolicyGates");
    expect(qualityRegistry).not.toContain("wrong_doc_lock_enforcement");
    expect(qualityRegistry).not.toContain("source_policy_navigation_mode");
  });

  test("policy services expose normalized decisions without inline copy generation", () => {
    const refusalSource = readFile(
      "src/services/core/policy/refusalPolicy.service.ts",
    );
    const complianceSource = readFile(
      "src/services/core/policy/compliancePolicy.service.ts",
    );
    const clarificationSource = readFile(
      "src/services/core/policy/clarificationPolicy.service.ts",
    );
    const compliancePhraseResolverSource = readFile(
      "src/services/core/policy/compliancePhraseResolver.service.ts",
    );
    const complianceBank = readFile(
      "src/data_banks/policies/compliance_policy.any.json",
    );
    const runtimeSource = readFile(
      "src/modules/chat/runtime/ChatTurnExecutor.ts",
    );

    expect(readFile("src/services/core/policy/policyDecision.ts")).toContain(
      "export type PolicyDecision",
    );
    expect(refusalSource).not.toContain("buildUserFacingText(");
    expect(complianceSource).not.toContain("userMessage");
    expect(complianceBank).not.toContain("userMessage");
    expect(compliancePhraseResolverSource).toContain(
      "CompliancePhraseResolverService",
    );
    expect(runtimeSource).not.toContain(
      "I need explicit consent before continuing with this request.",
    );
    expect(runtimeSource).not.toContain(
      "This action is restricted by compliance policy for your workspace.",
    );
    expect(clarificationSource).toContain("decide(input?");
    expect(clarificationSource).not.toContain("defaultQuestion(");
    expect(clarificationSource).not.toContain("stripApologyTone(");
  });

  test("file_list shape cap is declared in truncation_and_limits", () => {
    const budgetSource = readFile(
      "src/services/core/enforcement/tokenBudget.service.ts",
    );
    const truncationBank = readFile(
      "src/data_banks/formatting/truncation_and_limits.any.json",
    );

    expect(truncationBank).toContain("\"outputShapeLimits\"");
    expect(truncationBank).toContain("\"file_list\"");
    expect(truncationBank).toContain("\"maxCharsHard\": 220");
    expect(budgetSource).toContain("resolveOutputShapeCharBudget");
  });

  test("scope and runtime failure helpers stay single-owner and compatibility-scoped", () => {
    const scopeServiceSource = readFile(
      "src/modules/chat/runtime/ScopeService.ts",
    );
    const runtimePolicyErrorSource = readFile(
      "src/modules/chat/runtime/runtimePolicyError.ts",
    );
    const legacyFallbackSource = readFile(
      "src/modules/chat/runtime/legacyRuntimeErrorFallback.ts",
    );

    expect(scopeServiceSource).not.toContain("getBankLoaderInstance");
    expect(scopeServiceSource).toContain("shouldClearScope(");
    expect(runtimePolicyErrorSource).not.toContain("message.includes(");
    expect(legacyFallbackSource).toContain("message.includes(");
  });
});
