import "reflect-metadata";
import fs from "fs";
import path from "path";
import { describe, expect, jest, test } from "@jest/globals";

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";

describe("CentralizedChatRuntimeDelegate execution ownership", () => {
  test("chat returns the execution draft from the shared execution path", async () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    const draft = { traceId: "trace-1", turnKey: "conv-1:user-msg-1" };
    delegate.executeTurn = jest.fn(async (params) => ({
      ...draft,
      stream: params.stream,
    }));

    const out = await delegate.chat({
      userId: "user-1",
      conversationId: "conv-1",
      message: "Question",
    });

    expect(delegate.executeTurn).toHaveBeenCalledWith({
      req: expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        message: "Question",
      }),
      stream: false,
    });
    expect(out).toEqual({
      traceId: "trace-1",
      turnKey: "conv-1:user-msg-1",
      stream: false,
    });
    expect("assistantMessageId" in out).toBe(false);
  });

  test("streamChat returns the execution draft from the same execution path", async () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    const sink = { emit: jest.fn() };
    const streamingConfig = { emitDelta: true };
    const draft = { traceId: "trace-2", turnKey: "conv-1:user-msg-1" };
    delegate.executeTurn = jest.fn(async (params) => ({
      ...draft,
      stream: params.stream,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    }));

    const out = await delegate.streamChat({
      req: {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Question",
      },
      sink: sink as any,
      streamingConfig: streamingConfig as any,
    });

    expect(delegate.executeTurn).toHaveBeenCalledWith({
      req: expect.objectContaining({
        userId: "user-1",
        conversationId: "conv-1",
        message: "Question",
      }),
      sink,
      streamingConfig,
      stream: true,
    });
    expect(out).toEqual({
      traceId: "trace-2",
      turnKey: "conv-1:user-msg-1",
      stream: true,
      sink,
      streamingConfig,
    });
    expect("assistantMessageId" in out).toBe(false);
  });

  test("persistFinalizedTurn is the only finalized assistant persistence path", async () => {
    const delegate = Object.create(
      CentralizedChatRuntimeDelegate.prototype,
    ) as any;
    delegate.traceWriter = {
      startSpan: jest.fn(() => "span-1"),
      endSpan: jest.fn(),
    };
    delegate.createMessage = jest.fn(async () => ({ id: "assistant-msg-9" }));
    delegate.persistTraceArtifacts = jest.fn(async () => undefined);
    delegate.withGeneratedConversationTitle = jest.fn((result) => result);

    const draft = {
      traceId: "trace-9",
      conversationId: "conv-1",
      request: {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Question",
        isRegenerate: true,
      },
      userMessage: { id: "user-msg-1" },
      generatedConversationTitle: null,
      fallbackReasonCode: null,
      fallbackReasonCodeTelemetry: null,
      fallbackPolicyMeta: null,
      priorAssistantMessageId: "assistant-msg-8",
      retrievalPack: null,
      evidenceGateDecision: null,
      answerMode: "general_answer",
      timing: {
        turnStartedAt: Date.now(),
        retrievalMs: 3,
        llmMs: 4,
        stream: false,
      },
      turnKey: "conv-1:user-msg-1",
      telemetry: null,
    };

    const finalized = {
      conversationId: "conv-1",
      userMessageId: "user-msg-1",
      assistantText: "Answer",
      attachmentsPayload: [],
      assistantTelemetry: null,
      sources: [],
      followups: [],
      answerMode: "general_answer",
      answerClass: "GENERAL",
      navType: null,
      status: "success",
      failureCode: null,
      fallbackReasonCode: null,
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
      warnings: [],
      userWarning: null,
      turnKey: "conv-1:user-msg-1",
    };

    const out = await delegate.persistFinalizedTurn({
      draft,
      finalized,
    });

    expect(delegate.createMessage).toHaveBeenCalledTimes(1);
    expect(delegate.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        role: "assistant",
        content: "Answer",
        userId: "user-1",
        metadata: expect.objectContaining({
          turnKey: "conv-1:user-msg-1",
          regenerateOfUserMessageId: "user-msg-1",
          priorAssistantMessageId: "assistant-msg-8",
        }),
      }),
    );
    expect(out.assistantMessageId).toBe("assistant-msg-9");
    expect(out.traceId).toBe("trace-9");
  });

  test("regenerate reuses the latest user message instead of creating a duplicate", async () => {
    const delegate = Object.create(CentralizedChatRuntimeDelegate.prototype) as any;
    delegate.listMessages = jest.fn(async () => [
      {
        id: "assistant-msg-2",
        role: "assistant",
        content: "Old assistant answer",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "user-msg-1",
        role: "user",
        content: "Original question",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    delegate.createMessage = jest.fn();

    const result = await delegate.ensureUserTurn(
      {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Regenerate that",
        isRegenerate: true,
      },
      "conv-1",
    );

    expect(result.userMessage.id).toBe("user-msg-1");
    expect(result.priorAssistantMessageId).toBe("assistant-msg-2");
    expect(delegate.createMessage).not.toHaveBeenCalled();
  });

  test("builds deterministic turn keys from the user turn identity", () => {
    const delegate = Object.create(CentralizedChatRuntimeDelegate.prototype) as any;

    const draft = delegate.buildExecutionDraft({
      traceId: "trace-1",
      req: {
        userId: "user-1",
        conversationId: "conv-1",
        message: "Question",
      },
      conversationId: "conv-1",
      userMessage: {
        id: "user-msg-7",
        role: "user",
        content: "Question",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      outputContract: "USER_VISIBLE_TEXT",
      answerMode: "general_answer",
      answerClass: "GENERAL",
      navType: null,
      retrievalPack: null,
      evidenceGateDecision: null,
      sources: [],
      assistantTextRaw: "Answer",
      draftResult: {
        conversationId: "conv-1",
        userMessageId: "user-msg-7",
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
        },
        evidence: {
          required: false,
          provided: false,
          sourceIds: [],
        },
      },
      telemetry: null,
      timing: {
        turnStartedAt: 1,
        retrievalMs: 2,
        llmMs: 3,
        stream: false,
      },
    });

    expect(draft.turnKey).toBe("conv-1:user-msg-7");
  });

  test("delegate source no longer contains a private finalizer shim", () => {
    const filePath = path.resolve(__dirname, "CentralizedChatRuntimeDelegate.ts");
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).not.toContain("finalizeChatTurn(");
    expect(source).not.toContain("buildRuntimePolicyFailureResult(");
    expect(source).not.toContain("buildGovernanceBlockedResult(");
  });
});
