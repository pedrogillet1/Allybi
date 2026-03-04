import { describe, expect, test } from "@jest/globals";
import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "../../services/core/scope/scopeGate.service";
import { writeCertificationGateReport } from "./reporting";

/**
 * Disambiguation E2E Certification
 *
 * 5-step proof that one-best-question disambiguation works:
 * 1. Ambiguous query → needs_doc_choice with 3 options, maxQuestions: 1
 * 2. User choice → resolves to single doc
 * 3. Follow-up → inherits chosen doc
 * 4. Unambiguous query → auto-pick, no disambiguation
 * 5. Section-level disambiguation → needsSectionChoice: true
 */

// ---------------------------------------------------------------------------
// Shared helpers (same pattern as scope-integrity)
// ---------------------------------------------------------------------------

const DISAMBIG_DOCS: DocMeta[] = [
  { docId: "doc-Q1", filename: "Report-Q1.pdf", title: "Report Q1" },
  { docId: "doc-Q2", filename: "Report-Q2.pdf", title: "Report Q2" },
  { docId: "doc-Q3", filename: "Report-Q3.pdf", title: "Report Q3" },
  { docId: "doc-budget", filename: "Budget-2024.xlsx", title: "Budget 2024" },
];

function buildState(
  overrides?: Partial<ConversationStateLike>,
): ConversationStateLike {
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

function makeBankLoader() {
  return {
    getBank: (bankId: string): any => {
      if (bankId === "scope_hints") {
        return {
          config: {
            actionsContract: { thresholds: { minHintConfidence: 0.75 } },
          },
        };
      }
      if (bankId === "scope_resolution") {
        return {
          config: {
            enabled: true,
            thresholds: {
              minToEmit: 0.55,
              minToApplySoftConstraint: 0.64,
              minToApplyHardConstraint: 0.74,
              explicitFilenameHardMin: 0.8,
              explicitDocIdHardMin: 0.85,
              activeDocSoftMin: 0.6,
            },
            limits: {
              maxDocAllowlist: 8,
              maxDocDenylist: 24,
              maxTokenExclusions: 30,
            },
            policy: {
              preferExplicitDocRefOverState: true,
            },
          },
          resolution: {
            apply_explicit_doc_refs: { enabled: true },
            apply_user_choice: { enabled: true },
            apply_hard_locked_doc: { enabled: true },
            apply_lock_request: { enabled: true },
            apply_followup_active_doc: { enabled: true },
            apply_entities_and_time: { enabled: true },
            apply_negatives: { enabled: true },
            finalize: { enabled: true },
          },
        };
      }
      if (bankId === "disambiguation_policies") {
        return {
          config: {
            thresholds: {
              autopickTopScore: 0.85,
              autopickGap: 0.25,
              autopickMinScopeCompliance: 0.8,
              disambiguateIfScoreBelow: 0.7,
              disambiguateIfGapBelow: 0.15,
              maxOptions: 4,
              minOptions: 2,
              maxQuestions: 1,
            },
          },
        };
      }
      return {};
    },
  };
}

function makeDocStore(docs: DocMeta[] = DISAMBIG_DOCS) {
  return {
    listDocs: async () => docs,
    getDocMeta: async (docId: string) =>
      docs.find((d) => d.docId === docId) || null,
  };
}

function makeDocIntelligenceBanks() {
  return {
    getMergedDocAliasesBank: () => ({
      config: { minAliasConfidence: 0.75 },
    }),
    getDocAliasPhrases: () => [],
    getDocTaxonomy: () => ({ typeDefinitions: [] }),
  } as any;
}

function makeService(docs?: DocMeta[]) {
  return new ScopeGateService(
    makeBankLoader() as any,
    makeDocStore(docs) as any,
    makeDocIntelligenceBanks(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Certification: disambiguation-e2e", () => {
  // -----------------------------------------------------------------------
  // Step 1: Ambiguous query triggers needs_doc_choice
  // -----------------------------------------------------------------------
  test("step 1: ambiguous query 'open the quarterly report' triggers needs_doc_choice with 3 options", async () => {
    const service = makeService();

    const decision = await service.evaluate(buildState(), {
      query: "open the quarterly report",
      env: "dev",
      signals: {},
    });

    // The query matches "Report" in 3 doc titles but not uniquely
    // Expected: needs_doc_choice with multiple options
    expect(decision.reasonCodes).toContain("needs_doc_choice");
    expect(decision.signals.needsDocChoice).toBe(true);
    expect(decision.disambiguation).toBeDefined();
    expect(decision.disambiguation!.options.length).toBeGreaterThanOrEqual(2);
    expect(decision.disambiguation!.maxQuestions).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Step 2: User choice resolves to single doc
  // -----------------------------------------------------------------------
  test("step 2: user choice resolves to doc-Q2", async () => {
    const service = makeService();

    const state = buildState({
      lastDisambiguation: { chosenDocumentId: "doc-Q2" },
    } as any);

    const decision = await service.evaluate(state, {
      query: "continue",
      env: "dev",
      signals: {},
    });

    expect(decision.scope.candidateDocIds).toContain("doc-Q2");
    expect(decision.signals.activeDocId).toBe("doc-Q2");
    expect(decision.signals.explicitDocLock).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Step 3: Follow-up inherits doc-Q2
  // -----------------------------------------------------------------------
  test("step 3: follow-up 'what were the key findings?' inherits doc-Q2", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-Q2",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "what were the key findings?",
      env: "dev",
      signals: {
        isFollowup: true,
        followupStrength: "strong",
      },
    });

    expect(decision.action).toBe("allow");
    expect(decision.scope.candidateDocIds).toContain("doc-Q2");
    expect(decision.signals.activeDocId).toBe("doc-Q2");
  });

  // -----------------------------------------------------------------------
  // Step 4: Unambiguous query auto-picks without disambiguation
  // -----------------------------------------------------------------------
  test("step 4: unambiguous query 'open Budget-2024.xlsx' auto-picks", async () => {
    const service = makeService();

    const decision = await service.evaluate(buildState(), {
      query: "open Budget-2024.xlsx",
      env: "dev",
      signals: {},
    });

    // Budget-2024.xlsx is unique — should auto-resolve
    expect(decision.scope.candidateDocIds).toContain("doc-budget");
    expect(decision.signals.activeDocId).toBe("doc-budget");
    // Should NOT trigger disambiguation
    expect(decision.signals.needsDocChoice).toBeFalsy();
  });

  // -----------------------------------------------------------------------
  // Step 5: Section-level disambiguation
  // -----------------------------------------------------------------------
  test("step 5: section-level disambiguation for 'go to section 2'", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-Q2",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "go to section 2",
      env: "dev",
      signals: {},
    });

    // Bare section number "2" is ambiguous (2, 2.1, 2.2, 2.3)
    expect(decision.signals.needsSectionChoice).toBe(true);
    expect(decision.disambiguation).toBeDefined();
    expect(decision.disambiguation!.candidateType).toBe("section");
  });

  // -----------------------------------------------------------------------
  // Gate report
  // -----------------------------------------------------------------------
  test("write certification gate report", async () => {
    const failures: string[] = [];
    const service = makeService();

    // Step 1
    const step1 = await service.evaluate(buildState(), {
      query: "open the quarterly report",
      env: "dev",
      signals: {},
    });
    const step1NeedsChoice = step1.reasonCodes.includes("needs_doc_choice");
    if (!step1NeedsChoice) failures.push("STEP1_NO_DOC_CHOICE");
    const step1MaxQ = step1.disambiguation?.maxQuestions === 1;
    if (!step1MaxQ) failures.push("STEP1_MAX_QUESTIONS_NOT_1");

    // Step 2
    const step2State = buildState({
      lastDisambiguation: { chosenDocumentId: "doc-Q2" },
    } as any);
    const step2 = await service.evaluate(step2State, {
      query: "continue",
      env: "dev",
      signals: {},
    });
    const step2Resolved = step2.signals.activeDocId === "doc-Q2";
    if (!step2Resolved) failures.push("STEP2_DOC_NOT_RESOLVED");

    // Step 3
    const step3State = buildState({
      persistent: {
        scope: { activeDocId: "doc-Q2", hardDocLock: true, hardSheetLock: false },
      },
    } as any);
    const step3 = await service.evaluate(step3State, {
      query: "what were the key findings?",
      env: "dev",
      signals: { isFollowup: true, followupStrength: "strong" },
    });
    const step3Inherited = step3.scope.candidateDocIds.includes("doc-Q2");
    if (!step3Inherited) failures.push("STEP3_DOC_NOT_INHERITED");

    // Step 4
    const step4 = await service.evaluate(buildState(), {
      query: "open Budget-2024.xlsx",
      env: "dev",
      signals: {},
    });
    const step4AutoPicked = step4.scope.candidateDocIds.includes("doc-budget");
    if (!step4AutoPicked) failures.push("STEP4_BUDGET_NOT_AUTOPICKED");

    // Step 5
    const step5 = await service.evaluate(step3State, {
      query: "go to section 2",
      env: "dev",
      signals: {},
    });
    const step5SectionChoice = step5.signals.needsSectionChoice === true;
    if (!step5SectionChoice) failures.push("STEP5_NO_SECTION_CHOICE");

    writeCertificationGateReport("disambiguation-e2e", {
      passed: failures.length === 0,
      metrics: {
        step1NeedsChoice,
        step1MaxQ,
        step2Resolved,
        step3Inherited,
        step4AutoPicked,
        step5SectionChoice,
        totalSteps: 5,
      },
      thresholds: {
        allStepsMustPass: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
