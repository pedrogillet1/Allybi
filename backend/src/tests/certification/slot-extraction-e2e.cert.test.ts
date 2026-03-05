import { describe, expect, test } from "@jest/globals";
import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "../../services/core/scope/scopeGate.service";
import { writeCertificationGateReport } from "./reporting";

function buildState(overrides?: Partial<ConversationStateLike>): ConversationStateLike {
  return {
    session: { env: "dev", userLanguage: "en" },
    persistent: {
      scope: {
        activeDocId: "doc-budget",
        hardDocLock: true,
        hardSheetLock: false,
      },
    },
    history: { recentReasonCodes: [] },
    ephemeral: { turn: { turnId: 1 } },
    ...(overrides || {}),
  } as ConversationStateLike;
}

function createScopeService() {
  const docs: DocMeta[] = [
    { docId: "doc-budget", filename: "Budget.xlsx", title: "Budget" },
    { docId: "doc-forecast", filename: "Forecast.xlsx", title: "Forecast" },
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
            thresholds: {
              minToApplyHardConstraint: 0.74,
              explicitFilenameHardMin: 0.8,
            },
            policy: { preferExplicitDocRefOverState: true },
          },
          resolution: {
            apply_explicit_doc_refs: { enabled: true },
            apply_user_choice: { enabled: true },
            apply_hard_locked_doc: { enabled: true },
            apply_followup_active_doc: { enabled: true },
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

describe("Certification: slot-extraction-e2e", () => {
  test("extracts docRef from explicit filename mention", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "open Budget.xlsx",
      env: "dev",
      signals: {},
    });
    expect(decision.scope.candidateDocIds).toContain("doc-budget");
    expect(decision.signals.activeDocId).toBe("doc-budget");
  });

  test("extracts docRef from explicit filename mention in PT", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "abrir Budget.xlsx",
      env: "dev",
      signals: {},
    });
    expect(decision.scope.candidateDocIds).toContain("doc-budget");
    expect(decision.signals.activeDocId).toBe("doc-budget");
  });

  test("extracts sectionRef via section hinting", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "go to section 3.1",
      env: "dev",
      signals: { intentFamily: "documents", operator: "locate_content" },
    });
    expect(Boolean(decision.signals.activeSectionHint)).toBe(true);
    expect(decision.signals.needsSectionChoice).toBe(false);
  });

  test("extracts period and unit hints", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "show FY2025 revenue in millions",
      env: "dev",
      signals: { intentFamily: "documents", operator: "compute" },
    });
    expect(Boolean(decision.signals.periodHint)).toBe(true);
    expect(Boolean(decision.signals.unitHint)).toBe(true);
  });

  test("extracts sectionRef via PT section hinting", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "ir para secao 3.1",
      env: "dev",
      signals: { intentFamily: "documents", operator: "locate_content" },
    });
    expect(Boolean(decision.signals.activeSectionHint)).toBe(true);
    expect(decision.signals.needsSectionChoice).toBe(false);
  });

  test("extracts period and unit hints in PT", async () => {
    const scope = createScopeService();
    const decision = await scope.evaluate(buildState(), {
      query: "mostrar FY2025 receita em milhoes",
      env: "dev",
      signals: { intentFamily: "documents", operator: "compute" },
    });
    expect(Boolean(decision.signals.periodHint)).toBe(true);
    expect(Boolean(decision.signals.unitHint)).toBe(true);
  });

  test("write certification gate report", async () => {
    const failures: string[] = [];
    const scope = createScopeService();

    const docDecision = await scope.evaluate(buildState(), {
      query: "open Budget.xlsx",
      env: "dev",
      signals: {},
    });
    const hasDocRef =
      docDecision.scope.candidateDocIds.includes("doc-budget") &&
      docDecision.signals.activeDocId === "doc-budget";
    if (!hasDocRef) failures.push("DOCREF_NOT_EXTRACTED");

    const docDecisionPt = await scope.evaluate(buildState(), {
      query: "abrir Budget.xlsx",
      env: "dev",
      signals: {},
    });
    const hasDocRefPt =
      docDecisionPt.scope.candidateDocIds.includes("doc-budget") &&
      docDecisionPt.signals.activeDocId === "doc-budget";
    if (!hasDocRefPt) failures.push("DOCREF_PT_NOT_EXTRACTED");

    const sectionDecision = await scope.evaluate(buildState(), {
      query: "go to section 3.1",
      env: "dev",
      signals: { intentFamily: "documents", operator: "locate_content" },
    });
    const hasSectionRef =
      Boolean(sectionDecision.signals.activeSectionHint) &&
      sectionDecision.signals.needsSectionChoice === false;
    if (!hasSectionRef) failures.push("SECTIONREF_NOT_EXTRACTED");

    const periodUnitDecision = await scope.evaluate(buildState(), {
      query: "show FY2025 revenue in millions",
      env: "dev",
      signals: { intentFamily: "documents", operator: "compute" },
    });
    const hasPeriod = Boolean(periodUnitDecision.signals.periodHint);
    const hasUnit = Boolean(periodUnitDecision.signals.unitHint);
    if (!hasPeriod) failures.push("PERIOD_NOT_EXTRACTED");
    if (!hasUnit) failures.push("UNIT_NOT_EXTRACTED");

    const sectionDecisionPt = await scope.evaluate(buildState(), {
      query: "ir para secao 3.1",
      env: "dev",
      signals: { intentFamily: "documents", operator: "locate_content" },
    });
    const hasSectionRefPt =
      Boolean(sectionDecisionPt.signals.activeSectionHint) &&
      sectionDecisionPt.signals.needsSectionChoice === false;
    if (!hasSectionRefPt) failures.push("SECTIONREF_PT_NOT_EXTRACTED");

    const periodUnitDecisionPt = await scope.evaluate(buildState(), {
      query: "mostrar FY2025 receita em milhoes",
      env: "dev",
      signals: { intentFamily: "documents", operator: "compute" },
    });
    const hasPeriodPt = Boolean(periodUnitDecisionPt.signals.periodHint);
    const hasUnitPt = Boolean(periodUnitDecisionPt.signals.unitHint);
    if (!hasPeriodPt) failures.push("PERIOD_PT_NOT_EXTRACTED");
    if (!hasUnitPt) failures.push("UNIT_PT_NOT_EXTRACTED");

    writeCertificationGateReport("slot-extraction-e2e", {
      passed: failures.length === 0,
      metrics: {
        docRefExtracted: hasDocRef,
        docRefExtractedPt: hasDocRefPt,
        sectionRefExtracted: hasSectionRef,
        periodExtracted: hasPeriod,
        unitExtracted: hasUnit,
        sectionRefExtractedPt: hasSectionRefPt,
        periodExtractedPt: hasPeriodPt,
        unitExtractedPt: hasUnitPt,
      },
      thresholds: {
        allSlotsRequired: true,
        maxFailures: 0,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
