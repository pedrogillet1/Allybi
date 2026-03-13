import "reflect-metadata";
import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../../../services/core/enforcement/responseContractEnforcer.service", () => ({
  __esModule: true,
  getResponseContractEnforcer: () => ({
    enforce: ({ content, attachments }: { content: string; attachments: unknown[] }) => ({
      content,
      attachments,
      enforcement: {
        repairs: [],
        warnings: [],
        violations: [],
      },
    }),
  }),
}));

import type { ChatRequest } from "../domain/chat.contracts";
import { TurnFinalizationService } from "./TurnFinalizationService";
import type { TurnExecutionDraft } from "./turnExecutionDraft";

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Show me the answer",
    attachedDocumentIds: [],
    preferredLanguage: "en",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<TurnExecutionDraft> = {}): TurnExecutionDraft {
  const request = overrides.request || makeRequest();
  return {
    traceId: "trace-1",
    request,
    conversationId: "conv-1",
    userMessage: {
      id: "user-msg-1",
      role: "user",
      content: request.message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    generatedConversationTitle: null,
    outputContract: "USER_VISIBLE_TEXT",
    answerMode: "general_answer",
    answerClass: "GENERAL",
    navType: null,
    retrievalPack: null,
    evidenceGateDecision: null,
    sources: [],
    sourceButtonsAttachment: null,
    assistantTextRaw: "Answer",
    draftResult: {
      conversationId: "conv-1",
      userMessageId: "user-msg-1",
      assistantText: "Answer",
      attachmentsPayload: [],
      sources: [],
      followups: [],
      answerMode: "general_answer",
      answerClass: "GENERAL",
      navType: null,
      completion: { answered: true, missingSlots: [], nextAction: null },
      truncation: {
        occurred: false,
        reason: null,
        resumeToken: null,
        providerOccurred: false,
        providerReason: null,
        detectorVersion: null,
      },
      evidence: {
        required: false,
        provided: false,
        sourceIds: [],
      },
      qualityGates: { allPassed: true, failed: [] },
    },
    telemetry: null,
    turnKey: "conv-1:user-msg-1",
    timing: {
      turnStartedAt: Date.now(),
      retrievalMs: 0,
      llmMs: 0,
      stream: false,
    },
    ...overrides,
  };
}

describe("TurnFinalizationService", () => {
  test("treats navigation-only payloads as answered without assistant text", async () => {
    const service = new TurnFinalizationService();

    const finalized = await service.finalize(
      makeDraft({
        outputContract: "NAVIGATION_PAYLOAD",
        answerMode: "nav_pills",
        answerClass: "NAVIGATION",
        assistantTextRaw: "",
        draftResult: {
          ...makeDraft().draftResult,
          assistantText: "",
          listing: [{ kind: "file", id: "file-1", title: "Budget.xlsx" }],
          answerMode: "nav_pills",
          answerClass: "NAVIGATION",
          completion: { answered: false, missingSlots: [], nextAction: null },
        },
      }),
      { request: makeRequest() },
    );

    expect(finalized.status).not.toBe("failed");
    expect(finalized.completion?.answered).toBe(true);
    expect(finalized.sources).toEqual([]);
  });

  test("fails closed for doc-grounded output without sources", async () => {
    const service = new TurnFinalizationService();

    const request = makeRequest({
      attachedDocumentIds: ["doc-1"],
    });
    const finalized = await service.finalize(
      makeDraft({
        request,
        answerMode: "doc_grounded_single",
        answerClass: "DOCUMENT",
        outputContract: "USER_VISIBLE_TEXT",
        draftResult: {
          ...makeDraft().draftResult,
          assistantText: "Grounded answer without sources",
          answerMode: "doc_grounded_single",
          answerClass: "DOCUMENT",
          evidence: {
            required: true,
            provided: false,
            sourceIds: [],
          },
        },
      }),
      { request, scopeDocumentIds: ["doc-1"] },
    );

    expect(finalized.status).toBe("clarification_required");
    expect(finalized.failureCode).toBe("MISSING_SOURCES");
    expect(finalized.completion?.nextActionCode).toBe("NEEDS_DOC_LOCK");
    expect(finalized.completion?.answered).toBe(true);
  });

  test("surfaces truncation as partial", async () => {
    const service = new TurnFinalizationService();

    const finalized = await service.finalize(
      makeDraft({
        assistantTextRaw: "This answer ends with an unfinished clause,",
        draftResult: {
          ...makeDraft().draftResult,
          assistantText: "This answer ends with an unfinished clause,",
          assistantTelemetry: { finishReason: "length" },
        },
      }),
      { request: makeRequest() },
    );

    expect(finalized.status).toBe("partial");
    expect(finalized.failureCode).toBe("TRUNCATED_OUTPUT");
    expect(finalized.truncation?.occurred).toBe(true);
  });

  test("repairs macro-style openings before final output", async () => {
    const service = new TurnFinalizationService();
    const request = makeRequest({
      context: {
        styleDecision: {
          openerFamily: "evidence_anchor",
        },
        turnStyleState: {
          assistantTurnsSeen: 1,
          recentLeadSignatures: ["the document shows"],
          recentCloserSignatures: [],
          lastAssistantPreview: "The document shows the earlier clause applies.",
          repeatedLeadRisk: true,
          repeatedCloserRisk: false,
        },
        signals: {
          evidenceStrength: "low",
        },
      },
    });

    const finalized = await service.finalize(
      makeDraft({
        request,
        draftResult: {
          ...makeDraft().draftResult,
          assistantText:
            "Short answer: I know this can be difficult. The document shows the clause applies.",
        },
      }),
      { request },
    );

    expect(finalized.assistantText).not.toMatch(/^Short answer:/i);
    expect(finalized.assistantText).not.toContain("I know this can be difficult");
    expect(finalized.assistantTelemetry?.styleRepairTrace).toEqual(
      expect.arrayContaining([
        "strip_short_answer_prefix",
        "remove_fake_empathy",
        "rotate_turn_opener",
      ]),
    );
  });
});
