import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";
import {
  createDefaultPromptRegistryTelemetry,
  PromptBankLoadError,
  PromptBankMissingError,
  PromptRegistryConfigError,
  type PromptMetricSink,
  PromptRegistryService,
  PromptRoleValidationError,
  type PromptRegistryTelemetry,
} from "./promptRegistry.service";
import { COMPOSE_ANSWER_TEMPLATE_MODES } from "../../../modules/chat/domain/answerModes";

function loadPromptBanks() {
  const promptRoot = path.resolve(process.cwd(), "src/data_banks/prompts");
  const bankIds = [
    "prompt_registry",
    "system_base",
    "mode_chat",
    "mode_editing",
    "llm_global_guards",
    "rag_policy",
    "compose_style_contract",
    "task_answer_with_sources",
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

describe("PromptRegistryService compose_answer mode coverage", () => {
  test("never falls back to meta.description for active runtime answer modes", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const activeModes = [...COMPOSE_ANSWER_TEMPLATE_MODES];
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
      expect(bundle.debug?.selectedTemplateIds || []).toContain(
        expectedTemplate,
      );
    }
  });

  test("injects compose style contract with runtime style decisions", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const bundle = service.buildPrompt("compose_answer", {
      env: "local",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
      operator: "extract",
      operatorFamily: "qa",
      runtimeSignals: {
        styleDecision: {
          voiceProfile: "executive_brief",
          domainVoiceModifier: "finance_analytic",
          interactionModifier: "compressed",
          answerStrategy: "direct_answer_then_support",
          templateFamily: "direct_answer",
          uncertaintyBand: "medium_confidence",
          paragraphPlan: "single_paragraph_compressed",
          clarificationPolicy: "answer_directly_without_clarifier",
          fallbackPosture: "direct_answer",
          antiRoboticFocus: ["no_generic_leadins", "synthesize_then_support"],
          empathyMode: null,
        },
        turnStyleState: {
          recentLeadSignatures: ["the document shows"],
        },
      },
    });

    expect(bundle.debug?.selectedTemplateIds ?? []).toContain(
      "compose_style_contract_default",
    );

    const systemText = bundle.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");

    expect(systemText).toContain("executive_brief");
    expect(systemText).toContain("finance_analytic");
    expect(systemText).toContain("direct_answer_then_support");
    expect(systemText).toContain("medium_confidence");
    expect(systemText).toContain("single_paragraph_compressed");
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

  test("uses concrete template for retrieval kind", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const bundle = service.buildPrompt("retrieval", {
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
    });
    const selected = bundle.debug?.selectedTemplateIds ?? [];
    expect(
      selected.some((templateId) => templateId.endsWith(":meta.description")),
    ).toBe(false);
  });

  test("uses concrete template for disambiguation kind", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const bundle = service.buildPrompt("disambiguation", {
      env: "local",
      outputLanguage: "en",
      answerMode: "rank_disambiguate",
      operator: "locate_docs",
      intentFamily: "retrieval",
      slots: {
        userQuery: "open budget file",
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
    });
    const selected = bundle.debug?.selectedTemplateIds ?? [];
    expect(
      selected.some((templateId) => templateId.endsWith(":meta.description")),
    ).toBe(false);
  });

  test("uses concrete template for fallback kind reason codes", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const expectations: Record<string, string> = {
      no_docs_indexed: "fallback_no_docs_indexed",
      scope_hard_constraints_empty: "fallback_scope_hard_constraints_empty",
      no_relevant_chunks_in_scoped_docs:
        "fallback_no_relevant_chunks_in_scoped_docs",
      indexing_in_progress: "fallback_indexing_in_progress",
      extraction_failed: "fallback_extraction_failed",
      low_confidence: "fallback_low_confidence",
    };

    for (const [reasonCode, expectedTemplate] of Object.entries(expectations)) {
      const bundle = service.buildPrompt("fallback", {
        env: "local",
        outputLanguage: "en",
        answerMode: "general_answer",
        intentFamily: "documents",
        fallback: {
          triggered: true,
          reasonCode,
        },
      });
      const selected = bundle.debug?.selectedTemplateIds ?? [];
      expect(selected).toContain(expectedTemplate);
      expect(
        selected.some((templateId) => templateId === "fallback_prompt:meta.description"),
      ).toBe(false);
    }
  });

  test("resolves tool_prompts entries from tools[] shape", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: { tool: ["tool_prompts"] },
          } as T;
        }
        if (bankId === "tool_prompts") {
          return JSON.parse(
            fs.readFileSync(
              path.resolve(
                process.cwd(),
                "src/data_banks/prompts/tool_prompts.any.json",
              ),
              "utf8",
            ),
          ) as T;
        }
        throw new Error(`missing bank: ${bankId}`);
      },
    };
    const service = new PromptRegistryService(loader);
    const bundle = service.buildPrompt("tool", {
      env: "local",
      outputLanguage: "en",
      answerMode: "nav_pills",
      operator: "open",
      operatorFamily: "file_actions",
      intentFamily: "file_actions",
      slots: { userQuery: "open budget" },
    });
    const selected = bundle.debug?.selectedTemplateIds ?? [];
    expect(selected).toContain("nav_pills_open");
  });

  test("covers every tool_prompts tool id with deterministic selection", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: { tool: ["tool_prompts"] },
          } as T;
        }
        if (bankId === "tool_prompts") {
          return JSON.parse(
            fs.readFileSync(
              path.resolve(
                process.cwd(),
                "src/data_banks/prompts/tool_prompts.any.json",
              ),
              "utf8",
            ),
          ) as T;
        }
        throw new Error(`missing bank: ${bankId}`);
      },
    };
    const service = new PromptRegistryService(loader);

    const checks: Array<{
      expected: string;
      ctx: Record<string, any>;
    }> = [
      {
        expected: "nav_pills_open",
        ctx: {
          answerMode: "nav_pills",
          operator: "open",
          intentFamily: "file_actions",
        },
      },
      {
        expected: "nav_pills_where",
        ctx: {
          answerMode: "nav_pills",
          operator: "locate_file",
          intentFamily: "file_actions",
        },
      },
      {
        expected: "nav_pills_discover",
        ctx: {
          answerMode: "nav_pills",
          operator: "locate_docs",
          intentFamily: "retrieval",
        },
      },
      {
        expected: "file_list_show_more_entrypoint",
        ctx: {
          answerMode: "general_answer",
          operator: "list",
          intentFamily: "file_actions",
        },
      },
      {
        expected: "file_list_screen_title_generator",
        ctx: {
          answerMode: "general_answer",
          operator: "noop",
          intentFamily: "file_actions",
          uiSurface: "files_screen",
          usedBy: ["show_more_button"],
        },
      },
      {
        expected: "locate_content_breadcrumbs",
        ctx: {
          answerMode: "doc_grounded_multi",
          operator: "locate_content",
          intentFamily: "documents",
        },
      },
      {
        expected: "extract_micro_value_helper",
        ctx: {
          answerMode: "doc_grounded_single",
          operator: "extract",
          intentFamily: "documents",
          semanticFlags: ["microValue"],
        },
      },
    ];

    for (const check of checks) {
      const bundle = service.buildPrompt("tool", {
        env: "local",
        outputLanguage: "en",
        ...check.ctx,
        slots: {
          userQuery: "find requested value",
          runtimeSignals: {
            microValue: check.expected === "extract_micro_value_helper",
          },
        },
      } as any);
      expect(bundle.debug?.selectedTemplateIds || []).toContain(check.expected);
    }
  });

  test("fails closed for unsupported tool appliesTo keys", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: { tool: ["tool_prompts"] },
          } as T;
        }
        if (bankId === "tool_prompts") {
          return {
            _meta: { id: "tool_prompts", version: "test" },
            config: { enabled: true },
            tools: [
              {
                id: "bad_tool",
                appliesTo: {
                  operators: ["open"],
                  unsupportedKey: "x",
                },
                system: { en: ["bad"] },
              },
            ],
          } as T;
        }
        throw new Error(`missing bank: ${bankId}`);
      },
    };
    const service = new PromptRegistryService(loader);

    expect(() =>
      service.buildPrompt("tool", {
        env: "local",
        outputLanguage: "en",
        answerMode: "nav_pills",
        operator: "open",
      }),
    ).toThrow(/prompt_tool_applies_to_unsupported_keys/);
  });

  test("throws when unresolved placeholders remain after interpolation", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: [
              {
                id: "bad_placeholder",
                priority: 100,
                when: { answerModes: ["doc_grounded_single"] },
                messages: [
                  {
                    role: "system",
                    content: { any: "Use {{missing-slot}} and answer." },
                  },
                ],
              },
            ],
          } as T;
        }
        return { config: { enabled: true, messages: [] } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(/prompt_unresolved_placeholders/);
  });

  test("does not inject no-json guard when disallowJsonOutput is false", () => {
    const service = new PromptRegistryService(loadPromptBanks());
    const bundle = service.buildPrompt("retrieval", {
      env: "local",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
      operator: "locate_docs",
      disallowJsonOutput: false,
      constraints: { disallowJsonOutput: false },
      slots: {
        userQuery: "find total revenue",
        scope: "{lock:soft}",
        docContext: "{docs:2}",
      },
    } as any);
    const systemText = bundle.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    expect(systemText).not.toContain("Do NOT output raw JSON to the user");
  });

  test("fails fast when layersByKind references unknown prompt file ids", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources" }],
            layersByKind: {
              compose_answer: ["task_answer_with_sources", "missing_prompt_file"],
            },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: [
              {
                id: "answer_with_sources",
                priority: 100,
                when: { answerModes: ["doc_grounded_single"] },
                messages: [{ role: "system", content: { any: "ok" } }],
              },
            ],
          } as T;
        }
        return { config: { enabled: true, messages: [] } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(/invalid layered configuration/);
  });

  test("fails fast when layersByKind has duplicate layer ids for one kind", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources" }],
            layersByKind: {
              compose_answer: [
                "task_answer_with_sources",
                "task_answer_with_sources",
              ],
            },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: [
              {
                id: "answer_with_sources",
                priority: 100,
                when: { answerModes: ["doc_grounded_single"] },
                messages: [{ role: "system", content: { any: "ok" } }],
              },
            ],
          } as T;
        }
        return { config: { enabled: true, messages: [] } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(/duplicate_layer_id/);
  });

  test("fails fast when one prompt file declares a forbidden concern pair", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            config: { enabled: true },
            promptFiles: [
              {
                id: "task_answer_with_sources",
                concerns: ["grounding", "answer_shape"],
              },
            ],
            forbiddenConcernOverlaps: [
              { left: "grounding", right: "answer_shape" },
            ],
            layersByKind: {
              compose_answer: ["task_answer_with_sources"],
            },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: [
              {
                id: "answer_with_sources",
                priority: 100,
                when: { answerModes: ["doc_grounded_single"] },
                messages: [{ role: "system", content: { any: "ok" } }],
              },
            ],
          } as T;
        }
        return { config: { enabled: true, messages: [] } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptRegistryConfigError);
  });

  test("fails closed with typed missing-bank error for required layer", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources", required: true }],
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        return null as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptBankMissingError);
  });

  test("reports loader exceptions as typed load error for required bank", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources", required: true }],
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        throw new TypeError("loader exploded");
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptBankLoadError);
  });

  test("classifies thrown required-bank error as missing when hasBank reports false", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources", required: true }],
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        throw new TypeError("lookup failed");
      },
      hasBank(bankId: string): boolean {
        return bankId === "prompt_registry";
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptBankMissingError);
  });

  test("classifies thrown required-bank error as load failure when hasBank reports true", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources", required: true }],
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        throw new TypeError("lookup failed");
      },
      hasBank(): boolean {
        return true;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptBankLoadError);
  });

  test("throws typed invalid-role error when prompt message role is unsupported", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: [
              {
                id: "bad_role",
                priority: 100,
                when: { answerModes: ["doc_grounded_single"] },
                messages: [{ role: "assistant", content: { any: "invalid role" } }],
              },
            ],
          } as T;
        }
        return { _meta: { id: bankId }, config: { enabled: true } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    expect(() =>
      service.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow(PromptRoleValidationError);
  });

  test("trace records actual localized template key for template fallback", () => {
    const loader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        if (bankId === "task_answer_with_sources") {
          return {
            _meta: { id: "task_answer_with_sources", version: "test" },
            config: { enabled: true },
            templates: { any: { system: "hello from any" } },
          } as T;
        }
        return { _meta: { id: bankId }, config: { enabled: true } } as T;
      },
    };
    const service = new PromptRegistryService(loader);
    const bundle = service.buildPrompt("compose_answer", {
      env: "local",
      outputLanguage: "pt",
      answerMode: "doc_grounded_single",
    });
    expect(bundle.debug?.selectedTemplateIds ?? []).toContain(
      "task_answer_with_sources:templates.any",
    );
  });

  test("emits telemetry for success and failure paths", () => {
    const events: string[] = [];
    const telemetry: PromptRegistryTelemetry = {
      recordBuildStart() {
        events.push("start");
      },
      recordBuildSuccess() {
        events.push("success");
      },
      recordBuildFailure() {
        events.push("failure");
      },
    };
    const okService = new PromptRegistryService(loadPromptBanks(), telemetry);
    okService.buildPrompt("retrieval", {
      env: "local",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
    });
    expect(events).toEqual(["start", "success"]);

    const badLoader = {
      getBank<T = any>(bankId: string): T {
        if (bankId === "prompt_registry") {
          return {
            _meta: { id: "prompt_registry", version: "test" },
            config: { enabled: true },
            promptFiles: [{ id: "task_answer_with_sources", required: true }],
            layersByKind: { compose_answer: ["task_answer_with_sources"] },
          } as T;
        }
        throw new Error("boom");
      },
    };
    const failService = new PromptRegistryService(badLoader, telemetry);
    expect(() =>
      failService.buildPrompt("compose_answer", {
        env: "local",
        outputLanguage: "en",
        answerMode: "doc_grounded_single",
      }),
    ).toThrow();
    expect(events.slice(-2)).toEqual(["start", "failure"]);
  });

  test("emits metric sink counters and timings", () => {
    const calls: Array<{ kind: "inc" | "timing"; metric: string }> = [];
    const sink: PromptMetricSink = {
      increment(metric) {
        calls.push({ kind: "inc", metric });
      },
      timing(metric) {
        calls.push({ kind: "timing", metric });
      },
    };
    const telemetry = createDefaultPromptRegistryTelemetry(sink);
    const service = new PromptRegistryService(loadPromptBanks(), telemetry);
    service.buildPrompt("retrieval", {
      env: "local",
      outputLanguage: "en",
      answerMode: "doc_grounded_single",
    });

    expect(calls.some((c) => c.kind === "inc" && c.metric === "prompt_registry_build_total")).toBe(true);
    expect(calls.some((c) => c.kind === "timing" && c.metric === "prompt_registry_build_duration_ms")).toBe(true);
  });
});
