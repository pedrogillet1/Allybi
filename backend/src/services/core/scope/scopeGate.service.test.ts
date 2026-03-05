import fs from "fs";
import path from "path";
import { describe, expect, test, it, jest } from "@jest/globals";
import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "./scopeGate.service";

function buildState(overrides?: Partial<ConversationStateLike>): ConversationStateLike {
  return {
    session: { env: "dev", userLanguage: "en" },
    persistent: {
      scope: {
        activeDocId: null,
        hardDocLock: false,
        hardSheetLock: false,
      },
    },
    history: { recentReasonCodes: [] },
    ephemeral: { turn: { turnId: 1 } },
    ...(overrides || {}),
  } as ConversationStateLike;
}

function buildDocs(): DocMeta[] {
  return [
    { docId: "doc-1", filename: "Budget.xlsx", title: "Budget" },
    { docId: "doc-2", filename: "Forecast.xlsx", title: "Forecast" },
  ];
}

describe("ScopeGateService", () => {
  test("respects scope_resolution stage toggle for explicit document refs", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: (bankId: string): any => {
        if (bankId === "scope_hints") {
          return {
            config: { actionsContract: { thresholds: { minHintConfidence: 0.75 } } },
          };
        }
        if (bankId === "scope_resolution") {
          return {
            config: {
              enabled: true,
              thresholds: {
                minToApplyHardConstraint: 0.74,
                explicitFilenameHardMin: 0.8,
              },
            },
            resolution: {
              apply_explicit_doc_refs: { enabled: false },
            },
          };
        }
        return {};
      },
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.75 } }),
        getDocAliasPhrases: () => [],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
      } as any,
    );

    const decision = await service.evaluate(buildState(), {
      query: "Open Budget.xlsx",
      env: "dev",
      signals: {},
    });

    expect(decision.action).toBe("allow");
    expect(decision.scope.candidateDocIds).toEqual(["doc-1", "doc-2"]);
    expect(decision.reasonCodes).not.toContain("explicit_doc_required");
  });

  test("applies user choice stage from scope_resolution before hard lock fallback", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: (bankId: string): any => {
        if (bankId === "scope_hints") {
          return {
            config: { actionsContract: { thresholds: { minHintConfidence: 0.75 } } },
          };
        }
        if (bankId === "scope_resolution") {
          return {
            config: {
              enabled: true,
              policy: { preferExplicitDocRefOverState: true },
            },
            resolution: {
              apply_user_choice: { enabled: true },
              apply_hard_locked_doc: { enabled: true },
            },
          };
        }
        return {};
      },
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.75 } }),
        getDocAliasPhrases: () => [],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
      } as any,
    );

    const state = buildState({
      lastDisambiguation: { chosenDocumentId: "doc-2" } as any,
    } as any);
    const decision = await service.evaluate(state, {
      query: "continue",
      env: "dev",
      signals: {},
    });

    expect(decision.scope.candidateDocIds).toEqual(["doc-2"]);
    expect(decision.signals.activeDocId).toBe("doc-2");
    expect(decision.signals.explicitDocLock).toBe(true);
  });

  describe("section-level disambiguation", () => {
    it("ScopeDecision type supports section candidateType", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "./scopeGate.service.ts"),
        "utf-8",
      );
      expect(src).toContain('"section"');
      expect(src).toContain("activeSectionHint");
      expect(src).toContain("needs_section_choice");
    });
  });

  describe("section_disambiguation_policy wiring", () => {
    function makeSectionPolicyService(sectionPolicy: Record<string, unknown>) {
      const docs: DocMeta[] = [
        { docId: "doc-1", filename: "MSA_Acme_2024.pdf", title: "MSA Acme 2024" },
      ];
      const bankLoader = {
        getBank: (bankId: string): any => {
          if (bankId === "scope_hints") {
            return {
              config: { actionsContract: { thresholds: { minHintConfidence: 0.75 } } },
            };
          }
          if (bankId === "scope_resolution") {
            return {
              config: {
                enabled: true,
                policy: { preferExplicitDocRefOverState: true },
              },
              resolution: {
                apply_hard_locked_doc: { enabled: true },
              },
            };
          }
          if (bankId === "section_disambiguation_policy") {
            return sectionPolicy;
          }
          return {};
        },
      };
      const docStore = {
        listDocs: async () => docs,
        getDocMeta: async () => docs[0],
      };
      return new ScopeGateService(
        bankLoader as any,
        docStore as any,
        {
          getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.75 } }),
          getDocAliasPhrases: () => [],
          getDocTaxonomy: () => ({ typeDefinitions: [] }),
          getDiOntology: () => ({ sections: [] }),
        } as any,
      );
    }

    it("autopicks ambiguous section when policy gap threshold allows it", async () => {
      const service = makeSectionPolicyService({
        config: {
          enabled: true,
          maxQuestions: 1,
          sectionMatchThresholds: {
            autopickMinConfidence: 0.9,
            autopickMinGap: 0.05,
            disambiguateIfBelow: 0.75,
          },
        },
        rules: [
          {
            id: "SDP_002_section_alias_ambiguity",
            action: "ASK_WHICH_SECTION",
            candidateType: "section",
            maxOptions: 2,
            maxQuestions: 1,
          },
        ],
      });

      const sectionSpy = jest
        .spyOn(service as any, "extractSectionHint")
        .mockReturnValue({
          candidates: [
            { sectionId: "doc-1#termination", label: "termination", score: 0.93 },
            { sectionId: "doc-1#term_and_renewal", label: "term and renewal", score: 0.87 },
          ],
        });

      const decision = await service.evaluate(
        buildState({
          persistent: {
            scope: {
              activeDocId: "doc-1",
              hardDocLock: true,
              hardSheetLock: false,
            },
          },
        } as any),
        {
          query: "show the termination clause",
          env: "dev",
          signals: {},
        },
      );

      expect(decision.action).toBe("allow");
      expect(decision.signals.activeSectionHint).toBe("termination");
      expect(decision.reasonCodes).not.toContain("needs_section_choice");
      sectionSpy.mockRestore();
    });

    it("routes section disambiguation and honors policy maxOptions/maxQuestions", async () => {
      const service = makeSectionPolicyService({
        config: {
          enabled: true,
          maxQuestions: 1,
          sectionMatchThresholds: {
            autopickMinConfidence: 0.9,
            autopickMinGap: 0.25,
            disambiguateIfBelow: 0.75,
          },
        },
        rules: [
          {
            id: "SDP_002_section_alias_ambiguity",
            action: "ASK_WHICH_SECTION",
            candidateType: "section",
            maxOptions: 2,
            maxQuestions: 1,
          },
        ],
      });

      const sectionSpy = jest
        .spyOn(service as any, "extractSectionHint")
        .mockReturnValue({
          candidates: [
            { sectionId: "doc-1#liability_and_indemnity", label: "liability and indemnity", score: 0.93 },
            { sectionId: "doc-1#limitation_of_liability", label: "limitation of liability", score: 0.87 },
            { sectionId: "doc-1#warranty", label: "warranty", score: 0.79 },
          ],
        });

      const decision = await service.evaluate(
        buildState({
          persistent: {
            scope: {
              activeDocId: "doc-1",
              hardDocLock: true,
              hardSheetLock: false,
            },
          },
        } as any),
        {
          query: "show the liability clause",
          env: "dev",
          signals: {},
        },
      );

      expect(decision.action).toBe("route");
      expect(decision.reasonCodes).toContain("needs_section_choice");
      expect(decision.disambiguation?.candidateType).toBe("section");
      expect(decision.disambiguation?.maxOptions).toBe(2);
      expect(decision.disambiguation?.maxQuestions).toBe(1);
      expect(decision.disambiguation?.options.length).toBe(2);
      sectionSpy.mockRestore();
    });
  });

  describe("period/unit extraction wiring", () => {
    function makeTestService() {
      const docs: DocMeta[] = [
        { docId: "doc-1", filename: "Report-FY2025.pdf", title: "FY2025 Report" },
      ];
      const bankLoader = {
        getBank: (bankId: string): any => {
          if (bankId === "scope_hints") {
            return { config: { actionsContract: { thresholds: { minHintConfidence: 0.75 } } } };
          }
          if (bankId === "scope_resolution") {
            return {
              config: {
                enabled: true,
                thresholds: { minToApplyHardConstraint: 0.74, explicitFilenameHardMin: 0.8 },
              },
              resolution: { apply_explicit_doc_refs: { enabled: true } },
            };
          }
          return {};
        },
      };
      const docStore = {
        listDocs: async () => docs,
        getDocMeta: async () => null,
      };
      return new ScopeGateService(
        bankLoader as any,
        docStore as any,
        {
          getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.75 } }),
          getDocAliasPhrases: () => [],
          getDocTaxonomy: () => ({ typeDefinitions: [] }),
        } as any,
      );
    }

    it("detects FY period from query", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "show me FY2025 revenue breakdown",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.periodHint).toBeTruthy();
      expect(decision.signals.timeConstraintsPresent).toBe(true);
    });

    it("detects currency hint USD", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "convert amounts to USD",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.currencyHint).toBe("USD");
    });

    it("detects unit millions", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "show revenue in millions",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.unitHint).toMatch(/millions?/i);
    });

    it("detects quarter comparison mode", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "compare Q1 vs budget performance",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.comparisonModeHint).toBeTruthy();
      expect(decision.signals.timeConstraintsPresent).toBe(true);
    });

    it("detects year-over-year comparison", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "show YoY growth rate",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.comparisonModeHint).toBeTruthy();
      expect(decision.signals.periodHint).toBeTruthy();
    });

    it("returns null hints for query without period/unit references", async () => {
      const service = makeTestService();
      const decision = await service.evaluate(buildState(), {
        query: "summarize the key points",
        env: "dev",
        signals: {},
      });
      expect(decision.signals.periodHint).toBeNull();
      expect(decision.signals.unitHint).toBeNull();
      expect(decision.signals.currencyHint).toBeNull();
      expect(decision.signals.comparisonModeHint).toBeNull();
      expect(decision.signals.timeConstraintsPresent).toBe(false);
    });
  });
});
