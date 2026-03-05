import { describe, expect, test, jest } from "@jest/globals";

import type { ChatRequest, ChatResult } from "./chat.types";
import { ChatKernelService } from "./chatKernel.service";

function makeResult(): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "msg-u-1",
    assistantMessageId: "msg-a-1",
    assistantText: "ok",
  };
}

function makeRequest(): ChatRequest {
  return {
    userId: "user-1",
    message: "summarize this document",
    preferredLanguage: "en",
  };
}

describe("ChatKernelService intent metadata propagation", () => {
  test("injects router decision into req.meta and context.intentState on chat turns", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "KNOWLEDGE",
        intentDecision: {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          domainId: "finance",
          confidence: 0.9,
          decisionNotes: ["test"],
          persistable: {
            intentId: "documents",
            operatorId: "extract",
            intentFamily: "documents",
            domainId: "finance",
            confidence: 0.9,
          },
        },
      }),
    };

    await kernel.handleTurn(makeRequest());

    expect(executor.chat).toHaveBeenCalledTimes(1);
    const forwardedReq = executor.chat.mock.calls[0][0] as ChatRequest;
    expect((forwardedReq.meta || {}).intentFamily).toBe("documents");
    expect((forwardedReq.meta || {}).operator).toBe("extract");
    expect((forwardedReq.meta || {}).domain).toBe("finance");
    expect((forwardedReq.meta || {}).domainId).toBe("finance");
    expect((forwardedReq.meta as any)?.routingDecision).toEqual(
      expect.objectContaining({
        route: "KNOWLEDGE",
        locale: "en",
        intentFamily: "documents",
        operator: "extract",
        domainId: "finance",
        operatorChoice: "extract",
        scopeDecision: "unknown",
        disambiguation: "none",
      }),
    );
    expect(
      JSON.stringify((forwardedReq.meta as any)?.routingDecision || {}),
    ).not.toContain("summarize this document");
    expect((forwardedReq.context as any)?.intentState?.activeDomain).toBe(
      "finance",
    );
    expect(
      (forwardedReq.context as any)?.intentState?.lastRoutingDecision
        ?.operatorId,
    ).toBe("extract");
  });

  test("keeps request unchanged when router has no intent decision", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "GENERAL",
        intentDecision: null,
      }),
    };

    const req = makeRequest();
    await kernel.handleTurn(req);

    expect(executor.chat).toHaveBeenCalledTimes(1);
    const forwardedReq = executor.chat.mock.calls[0][0] as ChatRequest;
    expect(forwardedReq.meta).toBeUndefined();
    expect((forwardedReq.context as any)?.intentState).toBeUndefined();
  });

  test("injects router decision into stream turn payload", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "KNOWLEDGE",
        intentDecision: {
          intentId: "file_actions",
          intentFamily: "file_actions",
          operatorId: "open",
          domainId: "legal",
          confidence: 0.88,
          decisionNotes: ["test"],
          persistable: {
            intentId: "file_actions",
            operatorId: "open",
            intentFamily: "file_actions",
            domainId: "legal",
            confidence: 0.88,
          },
        },
      }),
    };

    const sink = { isOpen: () => true } as any;
    await kernel.streamTurn({
      req: makeRequest(),
      sink,
      streamingConfig: {} as any,
    });

    expect(executor.streamChat).toHaveBeenCalledTimes(1);
    const forwardedReq = executor.streamChat.mock.calls[0][0]
      .req as ChatRequest;
    expect((forwardedReq.meta || {}).operator).toBe("open");
    expect((forwardedReq.meta || {}).domainId).toBe("legal");
    expect((forwardedReq.meta as any)?.routingDecision).toEqual(
      expect.objectContaining({
        route: "KNOWLEDGE",
        locale: "en",
        intentFamily: "file_actions",
        operator: "open",
      }),
    );
    expect((forwardedReq.context as any)?.intentState?.activeDomain).toBe(
      "legal",
    );
  });

  test("enforces clarification contract when router decides CLARIFY", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "CLARIFY",
        intentDecision: {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          domainId: "general",
          confidence: 0.62,
          requiresClarification: true,
          clarifyReason: "ambiguous_margin",
          decisionNotes: ["test"],
          persistable: {
            intentId: "documents",
            operatorId: "extract",
            intentFamily: "documents",
            domainId: "general",
            confidence: 0.62,
          },
        },
      }),
    };

    const result = await kernel.handleTurn(makeRequest());

    expect(result.status).toBe("clarification_required");
    expect(result.failureCode).toBe("INTENT_NEEDS_CLARIFICATION");
    expect(result.completion?.answered).toBe(false);
    expect(result.completion?.missingSlots).toContain("intent");

    const forwardedReq = executor.chat.mock.calls[0][0] as ChatRequest;
    expect((forwardedReq.meta || {}).requiresClarification).toBe(true);
    expect((forwardedReq.meta || {}).clarifyReason).toBe("ambiguous_margin");
    expect((forwardedReq.meta as any)?.routingDecision).toEqual(
      expect.objectContaining({
        route: "CLARIFY",
        locale: "en",
        intentFamily: "documents",
        operator: "extract",
        disambiguation: "required:ambiguous_margin",
      }),
    );
  });

  test("extracts structured followup source and reason codes into routingDecision metadata", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "KNOWLEDGE",
        intentDecision: {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          domainId: "finance",
          confidence: 0.9,
          decisionNotes: [
            "routing:followup_source:none",
            "routing:followup_reason:followup_overlay_patterns_missing",
            "routing:followup_reason:followup_overlay_patterns_missing_en",
          ],
          persistable: {
            intentId: "documents",
            operatorId: "extract",
            intentFamily: "documents",
            domainId: "finance",
            confidence: 0.9,
          },
        },
      }),
    };

    await kernel.handleTurn(makeRequest());

    const forwardedReq = executor.chat.mock.calls[0][0] as ChatRequest;
    expect((forwardedReq.meta as any)?.routingDecision).toEqual(
      expect.objectContaining({
        followupSource: "none",
        followupReasonCodes: [
          "followup_overlay_patterns_missing",
          "followup_overlay_patterns_missing_en",
        ],
      }),
    );
  });

  test("extracts operator/scope/disambiguation telemetry from routing notes", async () => {
    const executor = {
      chat: jest.fn(async () => makeResult()),
      streamChat: jest.fn(async () => makeResult()),
    };
    const kernel = new ChatKernelService(executor);
    (kernel as any).router = {
      decideWithIntent: () => ({
        route: "KNOWLEDGE",
        intentDecision: {
          intentId: "documents",
          intentFamily: "documents",
          operatorId: "extract",
          domainId: "finance",
          confidence: 0.93,
          decisionNotes: [
            "routing:operator_choice:extract",
            "routing:scope_decision:attached_single_doc",
            "routing:disambiguation:required:doc_selection",
          ],
          persistable: {
            intentId: "documents",
            operatorId: "extract",
            intentFamily: "documents",
            domainId: "finance",
            confidence: 0.93,
          },
        },
      }),
    };

    await kernel.handleTurn(makeRequest());

    const forwardedReq = executor.chat.mock.calls[0][0] as ChatRequest;
    expect((forwardedReq.meta as any)?.routingDecision).toEqual(
      expect.objectContaining({
        operatorChoice: "extract",
        scopeDecision: "attached_single_doc",
        disambiguation: "required:doc_selection",
      }),
    );
  });
});
