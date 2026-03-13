import { describe, expect, test } from "@jest/globals";
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

  test("keeps doc lock on followup and limits disambiguation to one question", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: () => ({}),
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.99 } }),
        getDocAliasPhrases: () => ["budget"],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
        getScopeResolutionRules: () => ({ config: { enabled: true } }),
        getFollowupPolicy: () => ({ config: { actionsContract: { thresholds: { followupScoreMin: 0.65 } } } }),
        getDocLockPolicy: () => ({ policy: { retainHardLockAcrossFollowups: true } }),
        getFolderScopePatterns: () => ({ rules: [] }),
        getOneBestQuestionPolicy: () => ({ config: { maxQuestions: 1 } }),
      } as any,
    );

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
        query: "and the next line?",
        env: "dev",
        signals: { isFollowup: true },
      },
    );

    expect(decision.signals.activeDocId).toBe("doc-1");
    expect(decision.signals.explicitDocLock).toBe(true);
  });

  test("uses colloquial phrasing to keep scope on the active doc", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: () => ({}),
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.99 } }),
        getLanguageBank: () => ({ phrases: { en: ["this one", "stay on this"] } }),
        getDocAliasPhrases: () => [],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
        getScopeResolutionRules: () => ({ config: { enabled: true } }),
        getFollowupPolicy: () => ({ config: { actionsContract: { thresholds: { followupScoreMin: 0.65 } } } }),
        getDocLockPolicy: () => ({ policy: { retainHardLockAcrossFollowups: true } }),
        getFolderScopePatterns: () => ({ rules: [] }),
        getOneBestQuestionPolicy: () => ({ config: { maxQuestions: 1 } }),
        getContextContainerProfiles: () => ({
          profiles: [
            { id: "single_doc", requiresActiveDoc: true },
            { id: "corpus", requiresActiveDoc: false },
          ],
        }),
        getConversationStateCarryover: () => ({
          rules: { followupKeepsActiveDoc: true, topicShiftBreaksSoftCarryover: true },
        }),
        getMultiDocCompareRules: () => ({ config: { enabled: true, requireTwoDocs: true } }),
        getProjectMemoryPolicy: () => ({ policy: { docLockBlocksBroadMemoryBleed: true } }),
      } as any,
    );

    const decision = await service.evaluate(
      buildState({
        persistent: {
          scope: {
            activeDocId: "doc-1",
            hardDocLock: false,
            hardSheetLock: false,
          },
        },
      } as any),
      {
        query: "stay on this",
        env: "dev",
        signals: {},
      },
    );

    expect(decision.scope.candidateDocIds).toEqual(["doc-1"]);
    expect(decision.signals.activeDocId).toBe("doc-1");
  });

  test("uses compare rules to widen a soft single-doc scope to two docs", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: () => ({}),
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.99 } }),
        getLanguageBank: () => ({ phrases: { en: [] } }),
        getDocAliasPhrases: () => [],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
        getScopeResolutionRules: () => ({ config: { enabled: true } }),
        getFollowupPolicy: () => ({ config: { actionsContract: { thresholds: { followupScoreMin: 0.65 } } } }),
        getDocLockPolicy: () => ({ policy: { retainHardLockAcrossFollowups: false } }),
        getFolderScopePatterns: () => ({ rules: [] }),
        getOneBestQuestionPolicy: () => ({ config: { maxQuestions: 1 } }),
        getContextContainerProfiles: () => ({
          profiles: [
            { id: "single_doc", requiresActiveDoc: true },
            { id: "corpus", requiresActiveDoc: false },
          ],
        }),
        getConversationStateCarryover: () => ({
          rules: { followupKeepsActiveDoc: true, topicShiftBreaksSoftCarryover: true },
        }),
        getMultiDocCompareRules: () => ({
          config: { enabled: true, requireTwoDocs: true, allowCorpusTrendMode: true },
        }),
        getProjectMemoryPolicy: () => ({ policy: { docLockBlocksBroadMemoryBleed: true } }),
      } as any,
    );

    const decision = await service.evaluate(
      buildState({
        persistent: {
          scope: {
            activeDocId: "doc-1",
            hardDocLock: false,
            hardSheetLock: false,
          },
        },
      } as any),
      {
        query: "compare this against forecast",
        env: "dev",
        signals: { isFollowup: true, operator: "compare" },
      },
    );

    expect(decision.scope.candidateDocIds).toEqual(["doc-1", "doc-2"]);
  });

  test("uses project memory policy to block corpus bleed when hard doc lock is active", async () => {
    const docs = buildDocs();
    const bankLoader = {
      getBank: () => ({}),
    };
    const docStore = {
      listDocs: async () => docs,
      getDocMeta: async () => null,
    };
    const service = new ScopeGateService(
      bankLoader as any,
      docStore as any,
      {
        getMergedDocAliasesBank: () => ({ config: { minAliasConfidence: 0.99 } }),
        getLanguageBank: () => ({ phrases: { en: [] } }),
        getDocAliasPhrases: () => [],
        getDocTaxonomy: () => ({ typeDefinitions: [] }),
        getScopeResolutionRules: () => ({ config: { enabled: true } }),
        getFollowupPolicy: () => ({ config: { actionsContract: { thresholds: { followupScoreMin: 0.65 } } } }),
        getDocLockPolicy: () => ({ policy: { retainHardLockAcrossFollowups: true } }),
        getFolderScopePatterns: () => ({ rules: [] }),
        getOneBestQuestionPolicy: () => ({ config: { maxQuestions: 1 } }),
        getContextContainerProfiles: () => ({
          profiles: [
            { id: "single_doc", requiresActiveDoc: true },
            { id: "corpus", requiresActiveDoc: false },
          ],
        }),
        getConversationStateCarryover: () => ({
          rules: { followupKeepsActiveDoc: true, topicShiftBreaksSoftCarryover: true },
        }),
        getMultiDocCompareRules: () => ({
          config: { enabled: true, requireTwoDocs: true, allowCorpusTrendMode: true },
        }),
        getProjectMemoryPolicy: () => ({ policy: { docLockBlocksBroadMemoryBleed: true } }),
      } as any,
    );

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
        query: "search across everything",
        env: "dev",
        signals: { corpusSearchAllowed: true },
      },
    );

    expect(decision.scope.candidateDocIds).toEqual(["doc-1"]);
    expect(decision.signals.explicitDocLock).toBe(true);
  });
});
