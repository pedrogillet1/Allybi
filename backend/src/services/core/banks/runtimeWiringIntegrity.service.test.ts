import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as fs from "fs";

// ---- module-level mocks -------------------------------------------------------

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
}));

// Import after mocks are registered so the service picks up the mocked versions.
import { getOptionalBank } from "./bankLoader.service";
import {
  RuntimeWiringIntegrityService,
  RUNTIME_REQUIRED_BANKS,
  RUNTIME_REQUIRED_POLICIES,
} from "./runtimeWiringIntegrity.service";
import {
  COMPOSE_ANSWER_TEMPLATE_MODES,
  RETRIEVAL_ANSWER_MODES,
} from "../../../modules/chat/domain/answerModes";

// ---- typed mock helpers -------------------------------------------------------

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockedReadFileSync = fs.readFileSync as jest.MockedFunction<
  typeof fs.readFileSync
>;
const mockedReaddirSync = fs.readdirSync as jest.MockedFunction<
  typeof fs.readdirSync
>;

// ---- minimal "clean" bank fixtures -------------------------------------------

/**
 * Returns a stub bank map for every required bank ID.
 * All routing banks expose a single operator "op_a" so the contract and
 * output-shape banks can cover it, keeping the cross-checks green.
 */
function makeCleanBanks(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    intent_config: {
      intentFamilies: [{ operatorsAllowed: ["op_a"] }],
    },
    intent_patterns: {
      patterns: [{ operator: "op_a" }],
      overlays: {
        followupIndicators: {
          en: ["\\band\\b"],
          pt: ["\\be\\b"],
          es: ["\\by\\b"],
        },
      },
    },
    followup_indicators: {
      config: { enabled: true },
      rules: [
        {
          id: "continuation_markers",
          triggerPatterns: {
            en: ["\\b(and|also|continue)\\b"],
            pt: ["\\b(e|tambem|continuar)\\b"],
            es: ["\\b(y|tambien|continuar)\\b"],
          },
        },
      ],
    },
    operator_families: {
      families: [{ operators: ["op_a"] }],
    },
    operator_contracts: {
      operators: [{ id: "op_a" }],
    },
    operator_output_shapes: {
      mapping: { op_a: {} },
    },
    prompt_registry: {
      promptFiles: [{ id: "system_base" }, { id: "task_answer_with_sources" }],
      layersByKind: {
        compose_answer: ["task_answer_with_sources"],
        system: ["system_base"],
      },
    },
    language_triggers: { triggers: [] },
    processing_messages: { messages: [] },
    no_docs_messages: { config: { enabled: true }, scenarios: {} },
    scoped_not_found_messages: { config: { enabled: true }, scenarios: {} },
    disambiguation_microcopy: { config: { enabled: true }, rules: [] },
    edit_error_catalog: { errors: [] },
    // operator_catalog and allybi_capabilities need uppercase keys to match
    // the normalizeUpper() path used for editing ops.  The editing pattern
    // banks are empty so no editing operator cross-check fires.
    operator_catalog: { operators: {} },
    allybi_capabilities: { operators: {} },
    intent_patterns_docx_en: { patterns: [] },
    intent_patterns_docx_pt: { patterns: [] },
    intent_patterns_excel_en: { patterns: [] },
    intent_patterns_excel_pt: { patterns: [] },
    document_intelligence_bank_map: {
      requiredCoreBankIds: [],
      optionalBankIds: [],
    },
    task_answer_with_sources: {
      templates: COMPOSE_ANSWER_TEMPLATE_MODES.map((mode) => ({
        id: `t_${mode}`,
        when: { answerModes: [mode] },
        messages: [{ role: "system", content: "ok" }],
      })),
    },
    task_plan_generation: {
      templates: [
        {
          id: "planner_json_contract",
          outputMode: "machine_json",
          when: { operators: ["plan_edit"] },
          messages: [{ role: "system", content: "json" }],
        },
      ],
    },
    editing_task_prompts: {
      templates: [
        {
          id: "rewrite_paragraph",
          outputMode: "user_text",
          when: { operators: ["rewrite_paragraph"] },
          messages: [{ role: "system", content: "text" }],
        },
        {
          id: "docx_line_rewrite",
          outputMode: "machine_json",
          when: { operators: ["docx_line_rewrite"] },
          messages: [{ role: "system", content: "json" }],
        },
      ],
    },
    llm_builder_policy: {
      config: {
        docGroundedMinOutputTokensByMode: {
          doc_grounded_single: 1600,
        },
        styleClampModes: ["rank_disambiguate"],
        payloadCaps: {
          memoryCharsDefault: 6000,
          memoryCharsDocGrounded: 9000,
          userSectionCharsMax: 5000,
          toolContextCharsMax: 1400,
          totalUserPayloadCharsMax: 24000,
        },
        evidenceCapsByMode: {
          doc_grounded_single: {
            maxItems: 8,
            maxSnippetChars: 260,
            maxSectionChars: 3400,
          },
        },
      },
    },
    fallback_prompt: { templates: [] },
    fallback_router: { rules: [] },
    fallback_processing: { config: { enabled: true } },
    fallback_scope_empty: { config: { enabled: true } },
    fallback_not_found_scope: { config: { enabled: true } },
    fallback_extraction_recovery: { config: { enabled: true } },
    koda_product_help: { config: { enabled: true } },
  };
  for (const id of RUNTIME_REQUIRED_BANKS) {
    if (!(id in out)) out[id] = {};
  }
  return out;
}

// ---- shared setup ------------------------------------------------------------

/**
 * Paths that the memoryPolicyHookEngineMissing check treats as *required to
 * exist* (the function pushes them as failures when they are absent).  In the
 * clean-state baseline we must make them exist and return content that passes
 * both marker tests.
 */
const MEMORY_POLICY_PATHS_SUFFIX = [
  "backend/src/services/memory/memoryPolicyEngine.service.ts",
  "src/services/memory/memoryPolicyEngine.service.ts",
];

function hasMemoryPolicySuffix(value: unknown): boolean {
  const normalized = String(value || "").replace(/\\/g, "/");
  return MEMORY_POLICY_PATHS_SUFFIX.some((suffix) =>
    normalized.endsWith(suffix),
  );
}

const CLEAN_MEMORY_POLICY_CONTENT = [
  "// integrationHooks: wired from policy bank",
  "// 'memory_policy integration hook banks missing' guard active",
].join("\n");

beforeEach(() => {
  jest.clearAllMocks();

  // By default most candidate paths do not exist → those fs checks are skipped.
  // Exception: memoryPolicyEngine.service.ts paths must exist with clean content
  // because that check reports missing-file as a failure (inverted logic).
  mockedExistsSync.mockImplementation((p) =>
    hasMemoryPolicySuffix(p),
  );

  mockedReadFileSync.mockImplementation((p) => {
    if (hasMemoryPolicySuffix(p)) {
      return CLEAN_MEMORY_POLICY_CONTENT as unknown as Buffer;
    }
    return "" as unknown as Buffer;
  });
  mockedReaddirSync.mockImplementation(() => {
    throw new Error("ENOENT");
  });
});

// ---- helper ------------------------------------------------------------------

function buildService(): RuntimeWiringIntegrityService {
  return new RuntimeWiringIntegrityService();
}

function wireCleanBanks(): void {
  const banks = makeCleanBanks();
  mockedGetOptionalBank.mockImplementation(
    (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
  );
}

// ==============================================================================
// 1. Structural contract
// ==============================================================================

describe("RuntimeWiringIntegrityService – structural contract", () => {
  test("result contains all expected top-level fields", () => {
    wireCleanBanks();
    const result = buildService().validate();

    const expectedFields: Array<keyof typeof result> = [
      "ok",
      "missingBanks",
      "missingLlmRoutingPolicyBanks",
      "missingRuntimePolicyConsumers",
      "missingRoutingBankConsumers",
      "runtimePolicyEnvGaps",
      "missingOperatorContracts",
      "missingOperatorOutputShapes",
      "missingEditingCatalogOperators",
      "missingEditingCapabilities",
      "invalidPromptLayers",
      "invalidPromptTemplateOutputModes",
      "missingBuilderPolicyBank",
      "invalidBuilderPolicy",
      "legacyChatRuntimeImports",
      "dormantCoreRoutingImports",
      "turnRoutePolicyDynamicFallback",
      "hardcodedRuntimeHeuristics",
      "rawConsoleRuntimeUsage",
      "memoryDelegateDirectInstantiation",
      "memoryRawPersistencePatterns",
      "memoryPolicyHookEngineMissing",
      "dormantIntentConfigUsage",
      "composeAnswerModeTemplateGaps",
      "answerModeContractDrift",
      "productHelpRuntimeUsageMissing",
      "followupOverlayCoverageGaps",
      "composeMicrocopyBankUsageGaps",
    ];

    for (const field of expectedFields) {
      expect(result).toHaveProperty(field);
    }
  });

  test("ok is a boolean and every other field is an array", () => {
    wireCleanBanks();
    const result = buildService().validate();

    expect(typeof result.ok).toBe("boolean");

    const arrayFields = Object.entries(result).filter(
      ([key]) => key !== "ok",
    ) as [string, unknown][];

    for (const [field, value] of arrayFields) {
      expect(Array.isArray(value)).toBe(true);
      // Extra diagnostic on failure:
      if (!Array.isArray(value)) {
        throw new Error(`Field "${field}" is not an array: ${typeof value}`);
      }
    }
  });
});

// ==============================================================================
// 2. Happy path – everything clean
// ==============================================================================

describe("RuntimeWiringIntegrityService – all-clean scenario", () => {
  test("ok is true when all banks are present and all source files are clean", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.ok).toBe(true);
  });

  test("all issue arrays are empty when everything is clean", () => {
    wireCleanBanks();
    const result = buildService().validate();

    const arrayFields = Object.entries(result).filter(
      ([key]) => key !== "ok",
    ) as [string, unknown[]][];

    for (const [field, value] of arrayFields) {
      expect(value).toHaveLength(0);
      if (value.length !== 0) {
        throw new Error(
          `Field "${field}" expected to be empty but got: ${JSON.stringify(value)}`,
        );
      }
    }
  });

  test("all required banks are queried during validate()", () => {
    wireCleanBanks();
    buildService().validate();

    const queriedIds = new Set(
      mockedGetOptionalBank.mock.calls.map(([id]) => id),
    );
    const required = [...RUNTIME_REQUIRED_BANKS];
    for (const id of required) {
      expect(queriedIds.has(id)).toBe(true);
    }
  });
});

// ==============================================================================
// 3. Missing banks
// ==============================================================================

describe("RuntimeWiringIntegrityService – missing banks", () => {
  test("ok is false when any required bank is missing", () => {
    // Return null for every bank → all required banks are missing
    mockedGetOptionalBank.mockReturnValue(null);
    const result = buildService().validate();
    expect(result.ok).toBe(false);
  });

  test("missingBanks lists every bank that getOptionalBank returns null for", () => {
    mockedGetOptionalBank.mockReturnValue(null);
    const result = buildService().validate();

    const expectedMissing = [...RUNTIME_REQUIRED_BANKS];

    for (const bankId of expectedMissing) {
      expect(result.missingBanks).toContain(bankId);
    }
    expect(result.missingBanks).toHaveLength(expectedMissing.length);
  });

  test("missingBanks contains exactly the missing bank when one bank is absent", () => {
    const banks = makeCleanBanks();
    // Remove a single bank
    delete (banks as Record<string, unknown>)["prompt_registry"];

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingBanks).toContain("prompt_registry");
    expect(result.missingBanks).toHaveLength(1);
    expect(result.ok).toBe(false);
  });

  test("missingBanks includes viewer_assistant_routing when the bank is absent", () => {
    const banks = makeCleanBanks();
    delete (banks as Record<string, unknown>)["viewer_assistant_routing"];

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.missingBanks).toContain("viewer_assistant_routing");
    expect(result.ok).toBe(false);
  });

  test("missingBanks includes nav_intents_en when the bank is absent", () => {
    const banks = makeCleanBanks();
    delete (banks as Record<string, unknown>)["nav_intents_en"];

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.missingBanks).toContain("nav_intents_en");
    expect(result.ok).toBe(false);
  });

  test("missingBanks is empty when all required banks are present", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.missingBanks).toHaveLength(0);
  });

  test("missingLlmRoutingPolicyBanks reports missing llm policy banks explicitly", () => {
    const banks = makeCleanBanks();
    delete banks.provider_capabilities;
    delete banks.provider_fallbacks;
    delete banks.composition_lane_policy;
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.missingLlmRoutingPolicyBanks).toEqual(
      expect.arrayContaining([
        "provider_capabilities",
        "provider_fallbacks",
        "composition_lane_policy",
      ]),
    );
  });
});


// ==============================================================================
// 4. Runtime policy requiredByEnv integrity
// ==============================================================================

describe("RuntimeWiringIntegrityService - runtimePolicyEnvGaps", () => {
  function wireRegistry(
    requiredByEnvForPolicy: (
      policyId: string,
    ) => { production: boolean; staging: boolean },
  ): void {
    const registry = {
      banks: RUNTIME_REQUIRED_POLICIES.map((id) => ({
        id,
        requiredByEnv: requiredByEnvForPolicy(id),
      })),
    };

    mockedExistsSync.mockImplementation((p) => {
      const normalized = String(p || "").replace(/\\/g, "/");
      if (hasMemoryPolicySuffix(normalized)) return true;
      return normalized.endsWith(
        "/backend/src/data_banks/manifest/bank_registry.any.json",
      );
    });
    mockedReadFileSync.mockImplementation((p) => {
      const normalized = String(p || "").replace(/\\/g, "/");
      if (hasMemoryPolicySuffix(normalized)) {
        return CLEAN_MEMORY_POLICY_CONTENT as unknown as Buffer;
      }
      if (
        normalized.endsWith(
          "/backend/src/data_banks/manifest/bank_registry.any.json",
        )
      ) {
        return JSON.stringify(registry) as unknown as Buffer;
      }
      return "" as unknown as Buffer;
    });
  }

  test("runtimePolicyEnvGaps is empty when runtime policies are required in production and staging", () => {
    wireCleanBanks();
    wireRegistry(() => ({ production: true, staging: true }));

    const result = buildService().validate();

    expect(result.runtimePolicyEnvGaps).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  test("runtimePolicyEnvGaps flags access_control_policy when requiredByEnv is false for production/staging", () => {
    wireCleanBanks();
    wireRegistry((policyId) =>
      policyId === "access_control_policy"
        ? { production: false, staging: false }
        : { production: true, staging: true },
    );

    const result = buildService().validate();

    expect(result.runtimePolicyEnvGaps).toContain(
      "access_control_policy:requiredByEnv.production!=true",
    );
    expect(result.runtimePolicyEnvGaps).toContain(
      "access_control_policy:requiredByEnv.staging!=true",
    );
    expect(result.ok).toBe(false);
  });
});


// ============================================================================== 
// 5. Routing bank consumer wiring
// ==============================================================================

describe("RuntimeWiringIntegrityService – routing bank consumer wiring", () => {
  function dirEntry(name: string): fs.Dirent {
    return {
      name,
      isDirectory: () => true,
      isFile: () => false,
    } as unknown as fs.Dirent;
  }

  function fileEntry(name: string): fs.Dirent {
    return {
      name,
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as fs.Dirent;
  }

  function wireSingleRouterSourceFile(content: string): void {
    mockedExistsSync.mockImplementation((p) => {
      const normalized = String(p || "").replace(/\\/g, "/");
      if (hasMemoryPolicySuffix(normalized)) return true;
      return (
        normalized.endsWith("/backend/src") ||
        normalized.endsWith("/backend/src/services") ||
        normalized.endsWith("/backend/src/services/chat")
      );
    });
    mockedReaddirSync.mockImplementation((p) => {
      const normalized = String(p || "").replace(/\\/g, "/");
      if (normalized.endsWith("/backend/src")) return [dirEntry("services")] as any;
      if (normalized.endsWith("/backend/src/services")) return [dirEntry("chat")] as any;
      if (normalized.endsWith("/backend/src/services/chat")) {
        return [fileEntry("turnRouter.service.ts")] as any;
      }
      return [] as any;
    });
    mockedReadFileSync.mockImplementation((p) => {
      if (hasMemoryPolicySuffix(p)) {
        return CLEAN_MEMORY_POLICY_CONTENT as unknown as Buffer;
      }
      if (String(p || "").replace(/\\/g, "/").endsWith("/turnRouter.service.ts")) {
        return content as unknown as Buffer;
      }
      return "" as unknown as Buffer;
    });
  }

  test("missingRoutingBankConsumers flags viewer_assistant_routing when runtime consumer marker is absent", () => {
    wireCleanBanks();
    wireSingleRouterSourceFile("export class TurnRouterService {}");

    const result = buildService().validate();

    expect(result.missingRoutingBankConsumers).toContain(
      "viewer_assistant_routing",
    );
  });

  test("missingRoutingBankConsumers clears when runtime source references all required routing banks", () => {
    wireCleanBanks();
    wireSingleRouterSourceFile(
      [
        'const viewer = this.routingBankProvider("viewer_assistant_routing");',
        'const cEn = this.routingBankProvider("connect_intents_en");',
        'const cPt = this.routingBankProvider("connect_intents_pt");',
        'const sEn = this.routingBankProvider("search_intents_en");',
        'const sPt = this.routingBankProvider("search_intents_pt");',
        'const sendEn = this.routingBankProvider("send_intents_en");',
        'const sendPt = this.routingBankProvider("send_intents_pt");',
        'const syncEn = this.routingBankProvider("sync_intents_en");',
        'const syncPt = this.routingBankProvider("sync_intents_pt");',
        'const navBank = this.getNavIntentsBank(locale);',
        'const navRaw = `nav_intents_${locale}`;',
      ].join("\n"),
    );

    const result = buildService().validate();

    expect(result.missingRoutingBankConsumers).toHaveLength(0);
  });

  test("missingRoutingBankConsumers flags integration intent bank when its marker is absent", () => {
    wireCleanBanks();
    wireSingleRouterSourceFile(
      'const bank = this.routingBankProvider("viewer_assistant_routing");',
    );

    const result = buildService().validate();

    expect(result.missingRoutingBankConsumers).toContain("connect_intents_en");
  });
});
// ==============================================================================
// 4. Operator cross-checks (contracts & output shapes)
// ==============================================================================

describe("RuntimeWiringIntegrityService – operator cross-checks", () => {
  test("missingOperatorContracts is empty when all routing operators appear in operator_contracts", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.missingOperatorContracts).toHaveLength(0);
  });

  test("missingOperatorContracts flags an operator present in routing banks but absent from operator_contracts", () => {
    const banks = makeCleanBanks();
    // Add a second operator to intent_config that is NOT in operator_contracts
    (banks["intent_config"] as any).intentFamilies[0].operatorsAllowed.push(
      "op_unknown",
    );

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingOperatorContracts).toContain("op_unknown");
    expect(result.ok).toBe(false);
  });

  test("missingOperatorOutputShapes flags an operator absent from operator_output_shapes", () => {
    const banks = makeCleanBanks();
    (banks["operator_families"] as any).families[0].operators.push("op_ghost");

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingOperatorOutputShapes).toContain("op_ghost");
    expect(result.ok).toBe(false);
  });

  test("operator lookup is case-insensitive (upper-cased routing op is normalised to lower)", () => {
    const banks = makeCleanBanks();
    // Supply operator id in mixed case in the routing bank
    (banks["intent_patterns"] as any).patterns[0].operator = "OP_A";
    // operator_contracts has lower-case "op_a" already → should still match

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingOperatorContracts).not.toContain("op_a");
    expect(result.missingOperatorContracts).not.toContain("OP_A");
  });
});

// ==============================================================================
// 5. Editing catalog / capability cross-checks
// ==============================================================================

describe("RuntimeWiringIntegrityService – editing catalog cross-checks", () => {
  test("missingEditingCatalogOperators is empty when editing pattern ops all appear in operator_catalog", () => {
    const banks = makeCleanBanks();
    // Add an editing pattern that references BOLD
    (banks["intent_patterns_docx_en"] as any).patterns = [
      { operator: "BOLD", planTemplate: [] },
    ];
    // Register BOLD in the catalog
    (banks["operator_catalog"] as any).operators = { BOLD: {} };
    (banks["allybi_capabilities"] as any).operators = { BOLD: {} };

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingEditingCatalogOperators).toHaveLength(0);
    expect(result.missingEditingCapabilities).toHaveLength(0);
  });

  test("missingEditingCatalogOperators flags an editing op not in operator_catalog", () => {
    const banks = makeCleanBanks();
    (banks["intent_patterns_excel_en"] as any).patterns = [
      { operator: "FORMAT_CELLS", planTemplate: [] },
    ];
    // operator_catalog does NOT have FORMAT_CELLS

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingEditingCatalogOperators).toContain("FORMAT_CELLS");
    expect(result.ok).toBe(false);
  });

  test("planTemplate steps are also collected as editing operators", () => {
    const banks = makeCleanBanks();
    (banks["intent_patterns_docx_pt"] as any).patterns = [
      {
        operator: "WRAPPER_OP",
        planTemplate: [{ op: "INNER_OP" }, { op: "ANOTHER_OP" }],
      },
    ];
    // None of these are in the catalog

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.missingEditingCatalogOperators).toContain("WRAPPER_OP");
    expect(result.missingEditingCatalogOperators).toContain("INNER_OP");
    expect(result.missingEditingCatalogOperators).toContain("ANOTHER_OP");
  });
});

// ==============================================================================
// 6. Prompt registry layered integrity
// ==============================================================================

describe("RuntimeWiringIntegrityService – prompt registry layered integrity", () => {
  test("invalidPromptLayers is empty for valid prompt-layer wiring", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.invalidPromptLayers).toHaveLength(0);
  });

  test("unknown layer ids are reported when layer references missing prompt files", () => {
    const banks = makeCleanBanks();
    (banks["prompt_registry"] as any).layersByKind = {
      compose_answer: ["task_answer_with_sources", "missing_prompt_id"],
      retrieval: ["system_base"],
    };

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.invalidPromptLayers).toContain(
      "unknown_layer_id:compose_answer:missing_prompt_id",
    );
    expect(result.ok).toBe(false);
  });

  test("duplicate layer ids are reported per kind", () => {
    const banks = makeCleanBanks();
    (banks["prompt_registry"] as any).layersByKind = {
      compose_answer: ["task_answer_with_sources", "task_answer_with_sources"],
    };

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.invalidPromptLayers).toContain(
      "duplicate_layer_id:compose_answer:task_answer_with_sources",
    );
  });
});

// ==============================================================================
// 7. Prompt output mode + builder policy integrity
// ==============================================================================

describe("RuntimeWiringIntegrityService – output mode and builder policy integrity", () => {
  test("invalidPromptTemplateOutputModes is empty when prompt templates declare valid outputMode", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.invalidPromptTemplateOutputModes).toHaveLength(0);
  });

  test("flags missing outputMode in editing task templates", () => {
    const banks = makeCleanBanks();
    (banks["editing_task_prompts"] as any).templates = [
      {
        id: "rewrite_paragraph",
        when: { operators: ["rewrite_paragraph"] },
        messages: [{ role: "system", content: "text" }],
      },
    ];

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.invalidPromptTemplateOutputModes).toContain(
      "missing_output_mode:editing_task_prompts:rewrite_paragraph",
    );
    expect(result.ok).toBe(false);
  });

  test("flags non-machine-json outputMode for planner templates", () => {
    const banks = makeCleanBanks();
    (banks["task_plan_generation"] as any).templates = [
      {
        id: "planner_json_contract",
        outputMode: "user_text",
        when: { operators: ["plan_edit"] },
        messages: [{ role: "system", content: "text" }],
      },
    ];

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.invalidPromptTemplateOutputModes).toContain(
      "planner_requires_machine_json:task_plan_generation:planner_json_contract",
    );
  });

  test("flags invalid builder policy config", () => {
    const banks = makeCleanBanks();
    (banks["llm_builder_policy"] as any).config = {
      styleClampModes: [],
      payloadCaps: { memoryCharsDefault: 0 },
    };
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.invalidBuilderPolicy.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 8. Legacy chat runtime import check
// ==============================================================================

describe("RuntimeWiringIntegrityService – legacyChatRuntimeImports", () => {
  test("legacyChatRuntimeImports is empty when the candidate file does not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.legacyChatRuntimeImports).toHaveLength(0);
  });

  test("legacyChatRuntimeImports is empty when the file exists but contains no legacy import", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("chat-runtime.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "// clean file\nimport { something } from './modern.service';" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.legacyChatRuntimeImports).toHaveLength(0);
  });

  test("legacyChatRuntimeImports contains the file path when legacy import is present", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("chat-runtime.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "import { x } from './chatRuntime.legacy.service';" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.legacyChatRuntimeImports.length).toBeGreaterThan(0);
    expect(
      result.legacyChatRuntimeImports.some((p) =>
        p.includes("chat-runtime.service.ts"),
      ),
    ).toBe(true);
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 8. Dormant core routing imports
// ==============================================================================

describe("RuntimeWiringIntegrityService – dormantCoreRoutingImports", () => {
  test("dormantCoreRoutingImports is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.dormantCoreRoutingImports).toHaveLength(0);
  });

  test("dormantCoreRoutingImports flags a file that imports from services/core/routing/", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("prismaChat.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "import { Router } from '../../services/core/routing/someRouter';" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.dormantCoreRoutingImports.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("dormantCoreRoutingImports is empty when file exists but contains no dormant routing import", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("prismaChat.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "import { Router } from '../../services/routing/cleanRouter';" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.dormantCoreRoutingImports).toHaveLength(0);
  });
});

// ==============================================================================
// 9. Turn route policy dynamic fallback
// ==============================================================================

describe("RuntimeWiringIntegrityService – turnRoutePolicyDynamicFallback", () => {
  test("turnRoutePolicyDynamicFallback is empty when candidate file does not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.turnRoutePolicyDynamicFallback).toHaveLength(0);
  });

  test("turnRoutePolicyDynamicFallback flags a file using loadRoutingBankFallback", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("turnRoutePolicy.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const x = loadRoutingBankFallback();" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.turnRoutePolicyDynamicFallback.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("turnRoutePolicyDynamicFallback flags a file using require(", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("turnRoutePolicy.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const data = require('./some-bank.json');" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.turnRoutePolicyDynamicFallback.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 10. Hardcoded runtime heuristics
// ==============================================================================

describe("RuntimeWiringIntegrityService – hardcodedRuntimeHeuristics", () => {
  test("hardcodedRuntimeHeuristics is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.hardcodedRuntimeHeuristics).toHaveLength(0);
  });

  test("hardcodedRuntimeHeuristics flags a file containing FILE_EXT_RE", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("ChatRuntimeOrchestrator.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const FILE_EXT_RE = /\\.(xlsx|docx)$/i;" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.hardcodedRuntimeHeuristics.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("hardcodedRuntimeHeuristics flags EVIDENCE_KEYWORDS", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("evidenceGate.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const EVIDENCE_KEYWORDS = ['contract', 'invoice'];" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.hardcodedRuntimeHeuristics.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("hardcodedRuntimeHeuristics is empty when file is clean", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("ChatRuntimeOrchestrator.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "// fully data-driven, no hardcoded constants here" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.hardcodedRuntimeHeuristics).toHaveLength(0);
  });
});

// ==============================================================================
// 11. Raw console runtime usage
// ==============================================================================

describe("RuntimeWiringIntegrityService – rawConsoleRuntimeUsage", () => {
  test("rawConsoleRuntimeUsage is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.rawConsoleRuntimeUsage).toHaveLength(0);
  });

  test("rawConsoleRuntimeUsage flags a file with console.log(", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("ChatRuntimeOrchestrator.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "console.log('debug value', x);" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.rawConsoleRuntimeUsage.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("rawConsoleRuntimeUsage flags console.error( and console.warn(", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("previewOrchestrator.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "console.error('oops');\nconsole.warn('careful');" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.rawConsoleRuntimeUsage.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("rawConsoleRuntimeUsage is empty when file contains no console calls", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("creativeOrchestrator.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "logger.info('structured log');" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.rawConsoleRuntimeUsage).toHaveLength(0);
  });

  test("rawConsoleRuntimeUsage uses logging_policy runtime paths when configured", () => {
    const banks = makeCleanBanks();
    banks.logging_policy = {
      config: {
        enabled: true,
        runtimePathsNoRawConsole: ["src/services/llm/core/llmGateway.service.ts"],
      },
    };
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("llmGateway.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "console.warn('debug path');" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.rawConsoleRuntimeUsage.length).toBeGreaterThan(0);
  });
});

// ==============================================================================
// 12. Memory delegate direct instantiation
// ==============================================================================

describe("RuntimeWiringIntegrityService – memoryDelegateDirectInstantiation", () => {
  test("memoryDelegateDirectInstantiation is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.memoryDelegateDirectInstantiation).toHaveLength(0);
  });

  test("memoryDelegateDirectInstantiation flags new ConversationMemoryService(", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("CentralizedChatRuntimeDelegate.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const svc = new ConversationMemoryService(prisma);" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.memoryDelegateDirectInstantiation.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("memoryDelegateDirectInstantiation is empty when no direct instantiation present", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("CentralizedChatRuntimeDelegate.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const svc = container.resolve(ConversationMemoryService);" as unknown as Buffer,
    );

    const result = buildService().validate();
    expect(result.memoryDelegateDirectInstantiation).toHaveLength(0);
  });
});

// ==============================================================================
// 13. Memory raw persistence patterns
// ==============================================================================

describe("RuntimeWiringIntegrityService – memoryRawPersistencePatterns", () => {
  test("memoryRawPersistencePatterns is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.memoryRawPersistencePatterns).toHaveLength(0);
  });

  test("memoryRawPersistencePatterns flags content: sanitizeSnippet(input.content pattern", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("CentralizedChatRuntimeDelegate.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const entry = { content: sanitizeSnippet(input.content) };" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.memoryRawPersistencePatterns.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("memoryRawPersistencePatterns flags summary: summary pattern", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("CentralizedChatRuntimeDelegate.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "return { summary: summary };" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.memoryRawPersistencePatterns.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 14. Memory policy hook engine missing
// ==============================================================================

describe("RuntimeWiringIntegrityService – memoryPolicyHookEngineMissing", () => {
  test("memoryPolicyHookEngineMissing contains the candidate path when the file does not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();

    // Both candidate paths should be reported missing
    expect(result.memoryPolicyHookEngineMissing.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("memoryPolicyHookEngineMissing flags a file that exists but lacks integrationHooks", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("memoryPolicyEngine.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "export function evaluate() { return true; }" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.memoryPolicyHookEngineMissing.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("memoryPolicyHookEngineMissing is empty when file contains both required markers", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("memoryPolicyEngine.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      [
        "// integrationHooks: wired from policy bank",
        "// 'memory_policy integration hook banks missing' guard active",
      ].join("\n") as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.memoryPolicyHookEngineMissing).toHaveLength(0);
  });
});

// ==============================================================================
// 15. Dormant intent config usage
// ==============================================================================

describe("RuntimeWiringIntegrityService – dormantIntentConfigUsage", () => {
  test("dormantIntentConfigUsage is empty when candidate files do not exist", () => {
    wireCleanBanks();
    mockedExistsSync.mockReturnValue(false);

    const result = buildService().validate();
    expect(result.dormantIntentConfigUsage).toHaveLength(0);
  });

  test("dormantIntentConfigUsage flags a file that has IntentConfigService but no decide() call", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("turnRouter.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "const svc = new IntentConfigService(opts);\nsvc.load();" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.dormantIntentConfigUsage.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("dormantIntentConfigUsage flags a file that has decide() call but no IntentConfigService reference", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("turnRouter.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "intentConfig.decide(turn);" as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.dormantIntentConfigUsage.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("dormantIntentConfigUsage is empty when file has both IntentConfigService and decide() call", () => {
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("turnRouter.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      [
        "const router = new IntentConfigService(opts);",
        "const decision = intentConfig.decide(turn);",
      ].join("\n") as unknown as Buffer,
    );

    const result = buildService().validate();

    expect(result.dormantIntentConfigUsage).toHaveLength(0);
  });
});

// ==============================================================================
// 16. Compose answer mode template coverage
// ==============================================================================

describe("RuntimeWiringIntegrityService – composeAnswerModeTemplateGaps", () => {
  test("composeAnswerModeTemplateGaps is empty when all canonical compose modes are covered", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.composeAnswerModeTemplateGaps).toHaveLength(0);
  });

  test("composeAnswerModeTemplateGaps flags modes missing from task_answer_with_sources templates", () => {
    const banks = makeCleanBanks();
    (banks["task_answer_with_sources"] as any).templates = [
      {
        id: "only_general",
        when: { answerModes: ["general_answer"] },
        messages: [{ role: "system", content: "ok" }],
      },
    ];
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.composeAnswerModeTemplateGaps).toContain(
      "doc_grounded_single",
    );
    expect(result.composeAnswerModeTemplateGaps).toContain("help_steps");
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 17. Answer mode parity + product-help wiring checks
// ==============================================================================

describe("RuntimeWiringIntegrityService – answer mode parity and product help wiring", () => {
  test("answerModeContractDrift is empty in canonical mode graph", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.answerModeContractDrift).toHaveLength(0);
    for (const mode of RETRIEVAL_ANSWER_MODES) {
      expect(result.answerModeContractDrift).not.toContain(
        `retrieval_not_in_chat:${mode}`,
      );
    }
  });

  test("productHelpRuntimeUsageMissing flags gateway when product help markers are absent", () => {
    wireCleanBanks();
    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("llmGateway.service.ts"),
    );
    mockedReadFileSync.mockImplementation((p) => {
      if (String(p).includes("llmGateway.service.ts")) {
        return "const x = 1; // no product help wiring" as unknown as Buffer;
      }
      if (
        hasMemoryPolicySuffix(p)
      ) {
        return CLEAN_MEMORY_POLICY_CONTENT as unknown as Buffer;
      }
      return "" as unknown as Buffer;
    });

    const result = buildService().validate();
    expect(result.productHelpRuntimeUsageMissing.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 18. Follow-up overlay coverage
// ==============================================================================

describe("RuntimeWiringIntegrityService â€“ followupOverlayCoverageGaps", () => {
  test("followupOverlayCoverageGaps is empty when intent_patterns and followup_indicators cover all locales", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.followupOverlayCoverageGaps).toHaveLength(0);
  });

  test("followupOverlayCoverageGaps flags missing intent_patterns followup locale overlays", () => {
    const banks = makeCleanBanks();
    (banks["intent_patterns"] as any).overlays.followupIndicators.es = [];
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.followupOverlayCoverageGaps).toContain(
      "intent_patterns.overlays.followupIndicators.es:missing",
    );
    expect(result.ok).toBe(false);
  });

  test("followupOverlayCoverageGaps flags missing followup_indicators rule locale patterns when enabled", () => {
    const banks = makeCleanBanks();
    (banks["followup_indicators"] as any).rules = [
      {
        id: "continuation_markers",
        triggerPatterns: {
          en: ["\\b(and|also)\\b"],
          pt: ["\\b(e|tambem)\\b"],
          es: [],
        },
      },
    ];
    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();
    expect(result.followupOverlayCoverageGaps).toContain(
      "followup_indicators.rules.continuation_markers.triggerPatterns.es:missing",
    );
    expect(result.ok).toBe(false);
  });
});

// ==============================================================================
// 19. ok flag is the conjunction of all issue arrays
// ==============================================================================

describe("RuntimeWiringIntegrityService – ok flag invariant", () => {
  test("ok is false when any single issue array is non-empty", () => {
    // Use only legacyChatRuntimeImports as the one failing check
    wireCleanBanks();

    mockedExistsSync.mockImplementation((p) =>
      String(p).includes("chat-runtime.service.ts"),
    );
    mockedReadFileSync.mockReturnValue(
      "import { x } from './chatRuntime.legacy.service';" as unknown as Buffer,
    );

    const result = buildService().validate();

    // Only legacy import should be non-empty
    expect(result.legacyChatRuntimeImports.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  test("ok is true only when every issue array is empty", () => {
    wireCleanBanks();
    // All fs checks skipped because existsSync returns false (default in beforeEach)
    const result = buildService().validate();

    const allArraysEmpty = Object.entries(result)
      .filter(([key]) => key !== "ok")
      .every(([, value]) => Array.isArray(value) && value.length === 0);

    expect(allArraysEmpty).toBe(true);
    expect(result.ok).toBe(true);
  });
});


