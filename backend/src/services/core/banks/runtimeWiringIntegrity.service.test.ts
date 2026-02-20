import { describe, expect, it, jest } from "@jest/globals";

import { RuntimeWiringIntegrityService } from "./runtimeWiringIntegrity.service";
import { getOptionalBank } from "./bankLoader.service";

jest.mock("./bankLoader.service", () => ({
  getOptionalBank: jest.fn(),
}));

const mockedGetOptionalBank = getOptionalBank as jest.MockedFunction<
  typeof getOptionalBank
>;

describe("RuntimeWiringIntegrityService", () => {
  it("passes when runtime wiring is aligned", () => {
    const banks: Record<string, any> = {
      intent_config: {
        intentFamilies: [
          { id: "documents", operatorsAllowed: ["extract", "locate_docs"] },
        ],
      },
      intent_patterns: {
        patterns: [{ id: "p1", operator: "extract" }],
      },
      operator_families: {
        families: [{ id: "documents", operators: ["extract", "locate_docs"] }],
      },
      operator_contracts: {
        operators: [{ id: "extract" }, { id: "locate_docs" }],
      },
      operator_output_shapes: {
        mapping: { extract: {}, locate_docs: {} },
      },
      language_triggers: { config: { enabled: true }, rules: [] },
      processing_messages: { config: { enabled: true }, messages: {} },
      edit_error_catalog: { config: { enabled: true }, errors: {} },
      prompt_registry: {
        selectionRules: {
          rules: [
            {
              id: "specific",
              when: { path: "answerMode", op: "eq", value: "x" },
            },
            { id: "default", when: { any: true } },
          ],
        },
      },
      operator_catalog: {
        operators: {
          DOCX_REWRITE_PARAGRAPH: {},
        },
      },
      allybi_capabilities: {
        operators: {
          DOCX_REWRITE_PARAGRAPH: {},
        },
      },
      intent_patterns_docx_en: {
        patterns: [
          { id: "d1", planTemplate: [{ op: "DOCX_REWRITE_PARAGRAPH" }] },
        ],
      },
      intent_patterns_docx_pt: { patterns: [] },
      intent_patterns_excel_en: { patterns: [] },
      intent_patterns_excel_pt: { patterns: [] },
    };

    mockedGetOptionalBank.mockImplementation((id: string) => banks[id] ?? null);

    const result = new RuntimeWiringIntegrityService().validate();
    expect(result.missingBanks).toEqual([]);
    expect(result.missingOperatorContracts).toEqual([]);
    expect(result.missingOperatorOutputShapes).toEqual([]);
    expect(result.missingEditingCatalogOperators).toEqual([]);
    expect(result.missingEditingCapabilities).toEqual([]);
    expect(result.unreachablePromptSelectionRules).toEqual([]);
    expect(result.legacyChatRuntimeImports).toEqual([]);
    expect(result.dormantCoreRoutingImports).toEqual([]);
    expect(result.turnRoutePolicyDynamicFallback).toEqual([]);
    expect(result.hardcodedRuntimeHeuristics).toEqual([]);
    expect(result.rawConsoleRuntimeUsage).toEqual([]);
    expect(Array.isArray(result.memoryDelegateDirectInstantiation)).toBe(true);
    expect(Array.isArray(result.memoryRawPersistencePatterns)).toBe(true);
    expect(Array.isArray(result.memoryPolicyHookEngineMissing)).toBe(true);
  });

  it("flags missing contracts, shapes, and unreachable prompt rules", () => {
    const banks: Record<string, any> = {
      intent_config: {
        intentFamilies: [{ id: "documents", operatorsAllowed: ["extract"] }],
      },
      intent_patterns: { patterns: [{ id: "p1", operator: "extract" }] },
      operator_families: {
        families: [{ id: "documents", operators: ["extract"] }],
      },
      operator_contracts: { operators: [] },
      operator_output_shapes: { mapping: {} },
      language_triggers: { config: { enabled: true }, rules: [] },
      processing_messages: { config: { enabled: true }, messages: {} },
      edit_error_catalog: { config: { enabled: true }, errors: {} },
      prompt_registry: {
        selectionRules: {
          rules: [
            { id: "catch_all", when: { any: true } },
            {
              id: "never_reached",
              when: { path: "answerMode", op: "eq", value: "x" },
            },
          ],
        },
      },
      operator_catalog: { operators: {} },
      allybi_capabilities: { operators: {} },
      intent_patterns_docx_en: {
        patterns: [
          { id: "d1", planTemplate: [{ op: "DOCX_REWRITE_PARAGRAPH" }] },
        ],
      },
      intent_patterns_docx_pt: { patterns: [] },
      intent_patterns_excel_en: { patterns: [] },
      intent_patterns_excel_pt: { patterns: [] },
    };

    mockedGetOptionalBank.mockImplementation((id: string) => banks[id] ?? null);

    const result = new RuntimeWiringIntegrityService().validate();
    expect(result.ok).toBe(false);
    expect(result.missingOperatorContracts).toContain("extract");
    expect(result.missingOperatorOutputShapes).toContain("extract");
    expect(result.missingEditingCatalogOperators).toContain(
      "DOCX_REWRITE_PARAGRAPH",
    );
    expect(result.missingEditingCapabilities).toContain(
      "DOCX_REWRITE_PARAGRAPH",
    );
    expect(result.unreachablePromptSelectionRules).toContain("never_reached");
    expect(Array.isArray(result.legacyChatRuntimeImports)).toBe(true);
    expect(Array.isArray(result.dormantCoreRoutingImports)).toBe(true);
    expect(Array.isArray(result.turnRoutePolicyDynamicFallback)).toBe(true);
    expect(Array.isArray(result.hardcodedRuntimeHeuristics)).toBe(true);
    expect(Array.isArray(result.rawConsoleRuntimeUsage)).toBe(true);
    expect(Array.isArray(result.memoryDelegateDirectInstantiation)).toBe(true);
    expect(Array.isArray(result.memoryRawPersistencePatterns)).toBe(true);
    expect(Array.isArray(result.memoryPolicyHookEngineMissing)).toBe(true);
  });
});
