import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as fs from "fs";

// ---- module-level mocks -------------------------------------------------------

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Import after mocks are registered so the service picks up the mocked versions.
import { getOptionalBank } from "./bankLoader.service";
import {
  RuntimeWiringIntegrityService,
  RUNTIME_REQUIRED_BANKS,
} from "./runtimeWiringIntegrity.service";

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
      selectionRules: { rules: [] },
    },
    language_triggers: { triggers: [] },
    processing_messages: { messages: [] },
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
    MEMORY_POLICY_PATHS_SUFFIX.some((suffix) => String(p).endsWith(suffix)),
  );

  mockedReadFileSync.mockImplementation((p) => {
    if (
      MEMORY_POLICY_PATHS_SUFFIX.some((suffix) => String(p).endsWith(suffix))
    ) {
      return CLEAN_MEMORY_POLICY_CONTENT as unknown as Buffer;
    }
    return "" as unknown as Buffer;
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
      "missingOperatorContracts",
      "missingOperatorOutputShapes",
      "missingEditingCatalogOperators",
      "missingEditingCapabilities",
      "unreachablePromptSelectionRules",
      "legacyChatRuntimeImports",
      "dormantCoreRoutingImports",
      "turnRoutePolicyDynamicFallback",
      "hardcodedRuntimeHeuristics",
      "rawConsoleRuntimeUsage",
      "memoryDelegateDirectInstantiation",
      "memoryRawPersistencePatterns",
      "memoryPolicyHookEngineMissing",
      "dormantIntentConfigUsage",
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

  test("missingBanks is empty when all required banks are present", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.missingBanks).toHaveLength(0);
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
// 6. Prompt registry unreachable rules
// ==============================================================================

describe("RuntimeWiringIntegrityService – unreachable prompt selection rules", () => {
  test("unreachablePromptSelectionRules is empty when no catch-all rule exists", () => {
    wireCleanBanks();
    const result = buildService().validate();
    expect(result.unreachablePromptSelectionRules).toHaveLength(0);
  });

  test("rules after a catch-all (when.any = true) are reported as unreachable", () => {
    const banks = makeCleanBanks();
    (banks["prompt_registry"] as any).selectionRules = {
      rules: [
        { id: "rule_normal", when: { any: false } },
        { id: "catch_all_rule", when: { any: true } },
        { id: "dead_rule_1", when: {} },
        { id: "dead_rule_2", when: {} },
      ],
    };

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.unreachablePromptSelectionRules).toContain("dead_rule_1");
    expect(result.unreachablePromptSelectionRules).toContain("dead_rule_2");
    expect(result.unreachablePromptSelectionRules).not.toContain(
      "catch_all_rule",
    );
    expect(result.unreachablePromptSelectionRules).not.toContain("rule_normal");
    expect(result.ok).toBe(false);
  });

  test("the catch-all rule itself is not reported as unreachable", () => {
    const banks = makeCleanBanks();
    (banks["prompt_registry"] as any).selectionRules = {
      rules: [{ id: "only_catch_all", when: { any: true } }],
    };

    mockedGetOptionalBank.mockImplementation(
      (id: string) => (banks[id] ?? null) as ReturnType<typeof getOptionalBank>,
    );

    const result = buildService().validate();

    expect(result.unreachablePromptSelectionRules).toHaveLength(0);
  });
});

// ==============================================================================
// 7. Legacy chat runtime import check
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
// 16. ok flag is the conjunction of all issue arrays
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
