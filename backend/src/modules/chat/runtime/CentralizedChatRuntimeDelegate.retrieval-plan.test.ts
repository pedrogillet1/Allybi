import "reflect-metadata";
import { describe, expect, jest, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";
import { RetrievalPlanParserService } from "../../../services/core/retrieval/retrievalPlanParser.service";

describe("CentralizedChatRuntimeDelegate retrieval planner wiring", () => {
  test("parses planner JSON and returns validated retrieval plan", async () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.engine = {
      generateRetrievalPlan: jest.fn(async () => ({
        text: JSON.stringify({
          schemaVersion: "koda_retrieval_plan_v1",
          queryVariants: ["Revenue By Vendor"],
          requiredTerms: ["CapEx"],
          excludedTerms: ["draft"],
          entities: [],
          metrics: [],
          timeHints: [],
          docTypePreferences: [],
          locationTargets: [],
          confidenceNotes: [],
        }),
      })),
    };
    delegate.retrievalPlanParser = new RetrievalPlanParserService();

    const out = await delegate.generateRetrievalPlanForEvidence({
      req: {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Find revenue by vendor",
        meta: { requestId: "trace-1" },
      },
      runtimeCtx: { traceId: "trace-1", conversationId: "conv-1" },
      intentFamily: "documents",
      operator: "extract",
      answerMode: "doc_grounded_single",
      docScopeSignals: {
        docScopeLock: null,
        explicitDocLock: false,
        activeDocId: null,
        explicitDocRef: false,
        resolvedDocId: null,
        hardScopeActive: false,
        singleDocIntent: false,
      },
      semanticSignals: {
        hasQuotedText: false,
        hasFilename: false,
        userAskedForTable: false,
        userAskedForQuote: false,
        sheetHintPresent: false,
        rangeExplicit: false,
        timeConstraintsPresent: false,
        explicitYearOrQuarterComparison: false,
        tableExpected: false,
      },
      allowGlobalScope: false,
      attachedDocumentIds: ["doc-1"],
      docStore: {
        async getDocMeta() {
          return { title: "Budget FY25", filename: "budget.xlsx" };
        },
      },
    });

    expect(delegate.engine.generateRetrievalPlan).toHaveBeenCalledTimes(1);
    const call = delegate.engine.generateRetrievalPlan.mock.calls[0][0];
    expect(call.meta.promptMode).toBe("retrieval_plan");
    expect(call.meta.purpose).toBe("retrieval_planning");
    expect(out?.queryVariants).toEqual(["revenue by vendor"]);
    expect(out?.requiredTerms).toEqual(["capex"]);
  });

  test("returns null when planner output is invalid", async () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.engine = {
      generateRetrievalPlan: jest.fn(async () => ({
        text: "queryVariants:\n- revenue",
      })),
    };
    delegate.retrievalPlanParser = new RetrievalPlanParserService();

    const out = await delegate.generateRetrievalPlanForEvidence({
      req: {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Find revenue",
      },
      intentFamily: "documents",
      operator: "extract",
      answerMode: "doc_grounded_single",
      docScopeSignals: {
        docScopeLock: null,
        explicitDocLock: false,
        activeDocId: null,
        explicitDocRef: false,
        resolvedDocId: null,
        hardScopeActive: false,
        singleDocIntent: false,
      },
      semanticSignals: {
        hasQuotedText: false,
        hasFilename: false,
        userAskedForTable: false,
        userAskedForQuote: false,
        sheetHintPresent: false,
        rangeExplicit: false,
        timeConstraintsPresent: false,
        explicitYearOrQuarterComparison: false,
        tableExpected: false,
      },
      allowGlobalScope: false,
      attachedDocumentIds: [],
      docStore: {
        async getDocMeta() {
          return null;
        },
      },
    });

    expect(out).toBeNull();
  });
});
