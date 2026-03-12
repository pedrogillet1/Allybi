import "reflect-metadata";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import type {
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import { ChatRuntimeOrchestrator, type RuntimeDelegate } from "./ChatRuntimeOrchestrator";
import type { TurnExecutionDraft } from "./turnExecutionDraft";

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Summarize the doc",
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
      },
      evidence: {
        required: false,
        provided: false,
        sourceIds: [],
      },
    },
    telemetry: null,
    turnKey: "conv-1:user-msg-1",
    timing: {
      turnStartedAt: Date.now(),
      retrievalMs: 5,
      llmMs: 7,
      stream: false,
    },
    ...overrides,
  };
}

function makeFinalized(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "user-msg-1",
    assistantMessageId: "assistant-msg-1",
    assistantText: "Final answer",
    status: "success",
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
    ...overrides,
  };
}

function makeDelegate(): jest.Mocked<RuntimeDelegate> {
  return {
    chat: jest.fn(),
    streamChat: jest.fn(),
    persistFinalizedTurn: jest.fn(),
    createConversation: jest.fn(),
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    getConversationWithMessages: jest.fn(),
    updateTitle: jest.fn(),
    deleteConversation: jest.fn(),
    deleteAllConversations: jest.fn(),
    listMessages: jest.fn(),
    createMessage: jest.fn(),
  } as jest.Mocked<RuntimeDelegate>;
}

function makeScopeService() {
  return {
    attachedScope: jest.fn((req: ChatRequest) =>
      Array.isArray(req.attachedDocumentIds) ? req.attachedDocumentIds : [],
    ),
    clearConversationScope: jest.fn(),
    getConversationScope: jest.fn(async () => []),
    setConversationScope: jest.fn(async () => undefined),
  } as any;
}

function makeScopeIntentInterpreter() {
  return {
    shouldClearScope: jest.fn(() => false),
  } as any;
}

function makeFinalizationService() {
  return {
    finalize: jest.fn(async (_draft: TurnExecutionDraft) => makeFinalized()),
  } as any;
}

describe("ChatRuntimeOrchestrator", () => {
  let delegate: jest.Mocked<RuntimeDelegate>;
  let scopeService: any;
  let scopeIntentInterpreter: any;
  let finalizationService: any;
  let orchestrator: ChatRuntimeOrchestrator;

  beforeEach(() => {
    delegate = makeDelegate();
    scopeService = makeScopeService();
    scopeIntentInterpreter = makeScopeIntentInterpreter();
    finalizationService = makeFinalizationService();
    delegate.persistFinalizedTurn.mockImplementation(async ({ finalized }) => finalized);

    orchestrator = new ChatRuntimeOrchestrator(delegate, {
      scopeService,
      scopeIntentInterpreter,
      finalizationService,
      scopeRuntime: {
        tokenMinLength: 3,
        docNameMinLength: 3,
        tokenOverlapThreshold: 0.5,
        candidateFilenameRegex: [],
        candidateDocRefRegex: [],
        docStatusesAllowed: ["ready"],
        stopWords: new Set(["the"]),
      },
    });
  });

  test("chat routes through one finalization pipeline", async () => {
    const req = makeRequest();
    const draft = makeDraft({ request: req });
    const finalized = makeFinalized();
    delegate.chat.mockResolvedValue(draft);
    finalizationService.finalize.mockResolvedValue(finalized);
    delegate.persistFinalizedTurn.mockResolvedValue(finalized);

    const result = await orchestrator.chat(req);

    expect(delegate.chat).toHaveBeenCalledWith(req);
    expect(finalizationService.finalize).toHaveBeenCalledWith(draft, {
      request: req,
      scopeDocumentIds: [],
    });
    expect(delegate.persistFinalizedTurn).toHaveBeenCalledWith({
      draft,
      finalized,
    });
    expect(result).toEqual(finalized);
  });

  test("streamChat uses the same finalization service as chat", async () => {
    const req = makeRequest();
    const draft = makeDraft({ request: req, timing: { ...makeDraft().timing, stream: true } });
    const finalized = makeFinalized();
    const sink = { write: jest.fn(), end: jest.fn() } as unknown as StreamSink;
    const streamingConfig = { model: "gpt-5" } as LLMStreamingConfig;
    delegate.streamChat.mockResolvedValue(draft);
    finalizationService.finalize.mockResolvedValue(finalized);
    delegate.persistFinalizedTurn.mockResolvedValue(finalized);

    const result = await orchestrator.streamChat({
      req,
      sink,
      streamingConfig,
    });

    expect(delegate.streamChat).toHaveBeenCalledWith({
      req,
      sink,
      streamingConfig,
    });
    expect(finalizationService.finalize).toHaveBeenCalledWith(draft, {
      request: req,
      scopeDocumentIds: [],
    });
    expect(delegate.persistFinalizedTurn).toHaveBeenCalledWith({
      draft,
      finalized,
    });
    expect(result).toEqual(finalized);
  });

  test("persists attached scope before finalization", async () => {
    const req = makeRequest({
      attachedDocumentIds: ["doc-1"],
    });
    const draft = makeDraft({ request: req });
    delegate.chat.mockResolvedValue(draft);

    await orchestrator.chat(req);

    expect(scopeService.setConversationScope).toHaveBeenCalledWith(
      "user-1",
      "conv-1",
      ["doc-1"],
    );
  });
});
