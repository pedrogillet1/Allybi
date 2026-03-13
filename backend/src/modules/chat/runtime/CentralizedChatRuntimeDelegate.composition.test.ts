import "reflect-metadata";
import { describe, expect, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";

describe("CentralizedChatRuntimeDelegate composition brain wiring", () => {
  test("uses bank-driven followup suggestions instead of generic fallback text", () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.compositionBrain = {
      buildFollowups: () => [
        {
          label: "Check whether the same amount appears in another section or period.",
          query: "Show the same amount in the adjacent period from Q1 Report.",
        },
      ],
    };
    delegate.extractQueryKeywords = () => ["revenue"];

    const followups = delegate.generateFollowups(
      {
        userId: "user-1",
        message: "Explain the revenue variance",
        preferredLanguage: "en",
      },
      "doc_grounded_single",
      {
        evidence: [{ docId: "doc-1", title: "Q1 Report" }],
      },
    );

    expect(followups).toEqual([
      {
        label: "Check whether the same amount appears in another section or period.",
        query: "Show the same amount in the adjacent period from Q1 Report.",
      },
    ]);
  });

  test("clarification bypass uses composition-brain framing", () => {
    const delegate = Object.create(CentralizedChatRuntimeDelegate.prototype) as any;
    delegate.clarificationPolicy = {
      enforceClarificationQuestion: ({ question }: { question: string }) => question,
    };
    delegate.compositionBrain = {
      resolveClarificationBypass: ({ question }: { question: string }) =>
        `I need one clarification to answer precisely: ${question}`,
    };

    const result = delegate.resolveEvidenceGateBypass(
      {
        suggestedAction: "clarify",
        clarifyQuestion: "Which period should I use?",
      },
      "en",
      {
        attachedDocumentIds: [],
        evidenceCount: 0,
      },
    );

    expect(result).toEqual({
      text: "I need one clarification to answer precisely: Which period should I use?",
      failureCode: "EVIDENCE_NEEDS_CLARIFICATION",
    });
  });
});
