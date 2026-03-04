import { describe, expect, test } from "@jest/globals";
import {
  ScopeGateService,
  type ConversationStateLike,
  type DocMeta,
} from "../../services/core/scope/scopeGate.service";
import { writeCertificationGateReport } from "./reporting";

/**
 * Scope Integrity Certification
 *
 * Proves critical scope correctness scenarios:
 * 1. Discovery exception releases single-doc lock
 * 2. Explicit ref beats hard lock (topic shift)
 * 3. Compare mode covers both docs
 * 4. Followup continuity inherits active doc
 * 5. No-docs-indexed fallback
 * 6. Compare mode — hard lock with intra-doc compare
 * 7. Compare mode — explicit two-doc refs
 * 8. Section isolation — specific section ref
 * 9. Section isolation — ambiguous section ref
 * 10. Section isolation — PT section keyword
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const DOCS: DocMeta[] = [
  { docId: "doc-A", filename: "ContractA.pdf", title: "Contract A" },
  { docId: "doc-B", filename: "ContractB.pdf", title: "Contract B" },
  { docId: "doc-C", filename: "InvoiceC.pdf", title: "Invoice C" },
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
      // Return empty for unknown banks (fail-open)
      return {};
    },
  };
}

function makeDocStore(docs: DocMeta[] = DOCS) {
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

describe("Certification: scope-integrity", () => {
  // -----------------------------------------------------------------------
  // 1. Discovery exception
  // -----------------------------------------------------------------------
  test("discovery query releases single-doc lock and returns multiple candidates", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "find all invoices",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "locate_docs",
        corpusSearchAllowed: true,
      },
    });

    expect(decision.action).toBe("allow");
    // Discovery should return multiple docs, not just the locked one
    expect(decision.scope.candidateDocIds.length).toBeGreaterThan(1);
  });

  // -----------------------------------------------------------------------
  // 2. Topic shift / explicit ref beats lock
  // -----------------------------------------------------------------------
  test("explicit reference to doc-B overrides hard lock on doc-A", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "open ContractB.pdf",
      env: "dev",
      signals: {
        explicitDocRef: true,
        resolvedDocId: "doc-B",
      },
    });

    expect(decision.scope.candidateDocIds).toContain("doc-B");
    expect(decision.signals.activeDocId).toBe("doc-B");
  });

  // -----------------------------------------------------------------------
  // 3. Compare mode (multi-doc scope)
  // -----------------------------------------------------------------------
  test("compare intent with corpus search covers multiple docs without single-doc lock", async () => {
    const service = makeService();

    const decision = await service.evaluate(buildState(), {
      query: "compare these contracts",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        corpusSearchAllowed: true,
      },
    });

    // Corpus search allows multiple docs — no single-doc hard lock.
    expect(decision.scope.candidateDocIds.length).toBeGreaterThanOrEqual(2);
    expect(decision.signals.explicitDocLock).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 4. Followup continuity
  // -----------------------------------------------------------------------
  test("bare followup inherits active doc from state", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "tell me more",
      env: "dev",
      signals: {
        isFollowup: true,
        followupStrength: "strong",
      },
    });

    expect(decision.action).toBe("allow");
    expect(decision.scope.candidateDocIds).toContain("doc-A");
    expect(decision.signals.activeDocId).toBe("doc-A");
  });

  // -----------------------------------------------------------------------
  // 5. No-docs-indexed fallback
  // -----------------------------------------------------------------------
  test("no docs indexed routes to fallback_processing", async () => {
    const service = makeService();

    const decision = await service.evaluate(buildState(), {
      query: "summarize the contract",
      env: "dev",
      signals: {},
      overrides: { forceNoDocsIndexed: true },
    });

    expect(decision.action).toBe("route");
    expect(decision.reasonCodes).toContain("no_docs_indexed");
    expect(decision.routeTo).toBe("fallback_processing");
    expect(decision.scope.candidateDocIds).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // 6. Compare mode — hard lock with intra-doc compare
  // -----------------------------------------------------------------------
  test("compare with hard lock and intra-doc stays locked to single doc", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "compare section 1 and section 2",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        // corpusSearchAllowed NOT set — intra-doc compare
      },
    });

    // Intra-doc compare: should stay on doc-A (hard lock, no corpus search)
    expect(decision.scope.candidateDocIds).toContain("doc-A");
    expect(decision.scope.candidateDocIds.length).toBe(1);
    expect(decision.signals.activeDocId).toBe("doc-A");
  });

  // -----------------------------------------------------------------------
  // 7. Compare mode — explicit two-doc refs
  // -----------------------------------------------------------------------
  test("compare with explicit two-doc refs resolves correctly", async () => {
    const service = makeService();

    const decision = await service.evaluate(buildState(), {
      query: "compare ContractA.pdf and ContractB.pdf",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        corpusSearchAllowed: true,
      },
    });

    // With corpus search, should have multiple docs
    expect(decision.scope.candidateDocIds.length).toBeGreaterThanOrEqual(2);
    expect(decision.signals.explicitDocLock).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 8. Section isolation — specific section ref
  // -----------------------------------------------------------------------
  test("specific section ref sets activeSectionHint without needsSectionChoice", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "go to section 3.1",
      env: "dev",
      signals: {},
    });

    // Specific section ref (3.1) should resolve to a single section
    expect(decision.signals.activeSectionHint).toBeTruthy();
    expect(decision.signals.needsSectionChoice).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 9. Section isolation — ambiguous section ref
  // -----------------------------------------------------------------------
  test("ambiguous section ref triggers needsSectionChoice with 2+ options", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "go to section 3",
      env: "dev",
      signals: {},
    });

    // Bare number section ref is ambiguous (3, 3.1, 3.2, 3.3)
    expect(decision.signals.needsSectionChoice).toBe(true);
    expect(decision.disambiguation).toBeDefined();
    expect(decision.disambiguation!.options.length).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // 10. Section isolation — PT section keyword
  // -----------------------------------------------------------------------
  test("PT section keyword sets activeSectionHint", async () => {
    const service = makeService();

    const state = buildState({
      persistent: {
        scope: {
          activeDocId: "doc-A",
          hardDocLock: true,
          hardSheetLock: false,
        },
      },
    } as any);

    const decision = await service.evaluate(state, {
      query: "ir para seção 4.2",
      env: "dev",
      signals: {},
    });

    // PT keyword "seção" with specific number should resolve
    expect(decision.signals.activeSectionHint).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Gate report
  // -----------------------------------------------------------------------
  test("write certification gate report", async () => {
    const failures: string[] = [];
    const service = makeService();

    // Test 1: Discovery exception
    const discoveryState = buildState({
      persistent: {
        scope: { activeDocId: "doc-A", hardDocLock: true, hardSheetLock: false },
      },
    } as any);
    const discoveryDecision = await service.evaluate(discoveryState, {
      query: "find all invoices",
      env: "dev",
      signals: {
        intentFamily: "documents",
        operator: "locate_docs",
        corpusSearchAllowed: true,
      },
    });
    if (discoveryDecision.scope.candidateDocIds.length <= 1) {
      failures.push("DISCOVERY_DID_NOT_RELEASE_LOCK");
    }

    // Test 2: Explicit ref beats lock
    const refDecision = await service.evaluate(discoveryState, {
      query: "open ContractB.pdf",
      env: "dev",
      signals: { explicitDocRef: true, resolvedDocId: "doc-B" },
    });
    if (!refDecision.scope.candidateDocIds.includes("doc-B")) {
      failures.push("EXPLICIT_REF_DID_NOT_OVERRIDE_LOCK");
    }

    // Test 3: Followup continuity
    const followupDecision = await service.evaluate(discoveryState, {
      query: "tell me more",
      env: "dev",
      signals: { isFollowup: true, followupStrength: "strong" },
    });
    if (!followupDecision.scope.candidateDocIds.includes("doc-A")) {
      failures.push("FOLLOWUP_DID_NOT_INHERIT_ACTIVE_DOC");
    }

    // Test 4: No-docs fallback
    const noDocsDecision = await service.evaluate(buildState(), {
      query: "summarize the contract",
      env: "dev",
      signals: {},
      overrides: { forceNoDocsIndexed: true },
    });
    if (!noDocsDecision.reasonCodes.includes("no_docs_indexed")) {
      failures.push("NO_DOCS_MISSING_REASON_CODE");
    }
    if (noDocsDecision.routeTo !== "fallback_processing") {
      failures.push("NO_DOCS_WRONG_ROUTE_TARGET");
    }

    // Test 5: Compare intra-doc stays locked
    const intraCompareState = buildState({
      persistent: {
        scope: { activeDocId: "doc-A", hardDocLock: true, hardSheetLock: false },
      },
    } as any);
    const intraCompareDecision = await service.evaluate(intraCompareState, {
      query: "compare section 1 and section 2",
      env: "dev",
      signals: { intentFamily: "documents", operator: "compare" },
    });
    if (intraCompareDecision.scope.candidateDocIds.length !== 1) {
      failures.push("INTRA_COMPARE_DID_NOT_STAY_LOCKED");
    }

    // Test 6: Section isolation — specific ref
    const sectionSpecificDecision = await service.evaluate(intraCompareState, {
      query: "go to section 3.1",
      env: "dev",
      signals: {},
    });
    if (!sectionSpecificDecision.signals.activeSectionHint) {
      failures.push("SPECIFIC_SECTION_REF_NO_HINT");
    }

    // Test 7: Section isolation — ambiguous ref
    const sectionAmbiguousDecision = await service.evaluate(intraCompareState, {
      query: "go to section 3",
      env: "dev",
      signals: {},
    });
    if (!sectionAmbiguousDecision.signals.needsSectionChoice) {
      failures.push("AMBIGUOUS_SECTION_REF_NO_CHOICE");
    }

    writeCertificationGateReport("scope-integrity", {
      passed: failures.length === 0,
      metrics: {
        discoveryReleasedLock: discoveryDecision.scope.candidateDocIds.length > 1,
        explicitRefOverrodeLock: refDecision.scope.candidateDocIds.includes("doc-B"),
        followupInheritedDoc: followupDecision.scope.candidateDocIds.includes("doc-A"),
        noDocsRouteCorrect: noDocsDecision.routeTo === "fallback_processing",
        intraCompareStaysLocked: intraCompareDecision.scope.candidateDocIds.length === 1,
        specificSectionResolved: Boolean(sectionSpecificDecision.signals.activeSectionHint),
        ambiguousSectionTriggered: Boolean(sectionAmbiguousDecision.signals.needsSectionChoice),
      },
      thresholds: {
        allScenariosMustPass: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
