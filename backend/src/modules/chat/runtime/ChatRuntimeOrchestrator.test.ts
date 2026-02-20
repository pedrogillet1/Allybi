import { describe, expect, jest, test, beforeEach } from "@jest/globals";

import type {
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationWithMessagesDTO,
} from "../domain/chat.contracts";
import { ChatRuntimeOrchestrator } from "./ChatRuntimeOrchestrator";

const mockFindMany = jest.fn();
const mockConversationFindFirst = jest.fn();
const mockConversationUpdateMany = jest.fn();
const mockGetBank = jest.fn();

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    conversation: {
      findFirst: (...args: unknown[]) => mockConversationFindFirst(...args),
      updateMany: (...args: unknown[]) => mockConversationUpdateMany(...args),
    },
  },
}));

jest.mock("../../../services/core/banks/bankLoader.service", () => ({
  __esModule: true,
  getBankLoaderInstance: () => ({
    getBank: (...args: unknown[]) => mockGetBank(...args),
  }),
}));

function baseResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "c1",
    userMessageId: "u1",
    assistantMessageId: "a1",
    assistantText: "ok",
    ...overrides,
  };
}

function createDelegate(overrides: { chatResult?: ChatResult } = {}) {
  const chat = jest.fn(
    async (_req: ChatRequest) => overrides.chatResult || baseResult(),
  );
  return {
    chat,
    streamChat: jest.fn(async () => baseResult()),
    createConversation: jest.fn(
      async (): Promise<ConversationDTO> => ({
        id: "c1",
        title: "New Chat",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    listConversations: jest.fn(async (): Promise<ConversationDTO[]> => []),
    getConversation: jest.fn(async (): Promise<ConversationDTO | null> => null),
    getConversationWithMessages: jest.fn(
      async (): Promise<ConversationWithMessagesDTO | null> => null,
    ),
    updateTitle: jest.fn(async (): Promise<ConversationDTO | null> => null),
    deleteConversation: jest.fn(async () => ({ ok: true })),
    deleteAllConversations: jest.fn(async () => ({ ok: true, deleted: 0 })),
    listMessages: jest.fn(async (): Promise<ChatMessageDTO[]> => []),
    createMessage: jest.fn(
      async (): Promise<ChatMessageDTO> => ({
        id: "m1",
        role: "assistant",
        content: "ok",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
  };
}

describe("ChatRuntimeOrchestrator", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockConversationFindFirst.mockReset();
    mockConversationUpdateMany.mockReset();
    mockGetBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId === "memory_policy") {
        return {
          config: {
            runtimeTuning: {
              scopeRuntime: {
                tokenMinLength: 2,
                docNameMinLength: 3,
                tokenOverlapThreshold: 0.5,
                candidatePatterns: {
                  filename: [
                    "\\b[\\w][\\w\\-_. ]{0,160}\\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp)\\b",
                  ],
                  docReferencePhrase: [
                    "(?:using\\s+(?:the\\s+)?(?:document|file)|usando\\s+(?:o\\s+)?documento)\\s+[\"“”']?([^\"“”'\\n]{3,120})[\"“”']?",
                  ],
                },
                clearScopePatterns: [
                  "\\b(clear|reset|remove)\\s+(scope|context|attachments?)\\b",
                ],
                docStatusesAllowed: ["ready", "indexed", "available"],
                docStopWords: ["document", "file", "the", "using"],
                maxScopeDocs: 20,
              },
            },
          },
        };
      }
      return null;
    });
  });

  test("detects document mention on first turn without conversationId", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "doc-1", filename: "OBA_marketing_servicos (1).pdf" },
    ]);

    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);

    await orchestrator.chat({
      userId: "user-1",
      message:
        "Usando o documento OBA_marketing_servicos (1).pdf, me da um resumo curto.",
    });

    expect(delegate.chat).toHaveBeenCalledTimes(1);
    const preparedReq = delegate.chat.mock.calls[0][0] as ChatRequest;
    expect(preparedReq.attachedDocumentIds).toEqual(["doc-1"]);
  });

  test("keeps no scope when no document mention is present", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "doc-1", filename: "OBA_marketing_servicos (1).pdf" },
    ]);

    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);

    await orchestrator.chat({
      userId: "user-1",
      message: "How can I improve my sales strategy?",
    });

    expect(delegate.chat).toHaveBeenCalledTimes(1);
    const preparedReq = delegate.chat.mock.calls[0][0] as ChatRequest;
    expect(preparedReq.attachedDocumentIds || []).toEqual([]);
  });

  test("clears persisted scope when clearScope is explicitly requested", async () => {
    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: ["doc-1"] });

    await orchestrator.chat({
      userId: "user-1",
      conversationId: "conv-1",
      message: "clear scope",
      meta: { clearScope: true } as any,
    });

    const preparedReq = delegate.chat.mock.calls[0][0] as ChatRequest;
    expect(preparedReq.attachedDocumentIds || []).toEqual([]);
    expect(mockConversationUpdateMany).toHaveBeenCalled();
  });

  test("uses persisted scope when UI does not send attachments", async () => {
    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    mockConversationFindFirst
      .mockResolvedValueOnce({ scopeDocumentIds: ["doc-1", "doc-2"] })
      .mockResolvedValueOnce({ scopeDocumentIds: ["doc-1", "doc-2"] });
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });
    mockFindMany.mockResolvedValue([]);

    await orchestrator.chat({
      userId: "user-1",
      conversationId: "conv-1",
      message: "Summarize this.",
    });

    const preparedReq = delegate.chat.mock.calls[0][0] as ChatRequest;
    expect(preparedReq.attachedDocumentIds).toEqual(["doc-1", "doc-2"]);
  });

  test("enforces attached scope in post-process and removes out-of-scope sources", async () => {
    const delegate = createDelegate({
      chatResult: baseResult({
        conversationId: "conv-1",
        sources: [
          { documentId: "doc-1", filename: "a.pdf", mimeType: null, page: 1 },
          { documentId: "doc-2", filename: "b.pdf", mimeType: null, page: 2 },
        ],
        evidence: { required: true, provided: true, sourceIds: ["doc-1", "doc-2"] },
      }),
    });
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: ["doc-1"] });
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });

    const result = await orchestrator.chat({
      userId: "user-1",
      conversationId: "conv-1",
      message: "Use attached scope.",
      attachedDocumentIds: ["doc-1"],
    });

    expect(result.scopeEnforced).toBe(true);
    expect(result.sources).toEqual([
      { documentId: "doc-1", filename: "a.pdf", mimeType: null, page: 1 },
    ]);
  });

  test("throws when scopeRuntime config is invalid", () => {
    mockGetBank.mockImplementation(() => ({
      config: {
        runtimeTuning: {
          scopeRuntime: {
            tokenMinLength: 0,
            docNameMinLength: 3,
            tokenOverlapThreshold: 0.5,
            candidatePatterns: {
              filename: ["a"],
              docReferencePhrase: ["b"],
            },
            clearScopePatterns: ["clear scope"],
            docStatusesAllowed: ["ready"],
            docStopWords: ["document"],
            maxScopeDocs: 20,
          },
        },
      },
    }));

    expect(() => new ChatRuntimeOrchestrator(createDelegate() as any)).toThrow(
      "memory_policy.config.runtimeTuning.scopeRuntime.tokenMinLength is required",
    );
  });

  test("supports token-overlap document mention matching", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "doc-1", filename: "Annual Revenue Report 2024.pdf" },
    ]);

    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    await orchestrator.chat({
      userId: "user-1",
      message: "using document annual report revenue give me highlights",
    });

    const preparedReq = delegate.chat.mock.calls[0][0] as ChatRequest;
    expect(preparedReq.attachedDocumentIds).toEqual(["doc-1"]);
  });

  test("sets fallbackReasonCode from failureCode when missing", async () => {
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: [] });
    const delegate = createDelegate({
      chatResult: baseResult({
        conversationId: "c1",
        status: "partial",
        failureCode: "MISSING_EVIDENCE",
      }),
    });
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    const out = await orchestrator.chat({
      userId: "user-1",
      conversationId: "c1",
      message: "answer from docs",
    });
    expect(out.fallbackReasonCode).toBe("MISSING_EVIDENCE");
  });

  test("does not overwrite existing fallbackReasonCode", async () => {
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: [] });
    const delegate = createDelegate({
      chatResult: baseResult({
        conversationId: "c1",
        status: "partial",
        failureCode: "MISSING_EVIDENCE",
        fallbackReasonCode: "ALREADY_SET",
      }),
    });
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);
    const out = await orchestrator.chat({
      userId: "user-1",
      conversationId: "c1",
      message: "answer from docs",
    });
    expect(out.fallbackReasonCode).toBe("ALREADY_SET");
  });

  test("streamChat applies request preparation and post-processing", async () => {
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: ["doc-1"] });
    const delegate = createDelegate({
      chatResult: baseResult({
        conversationId: "c1",
        status: "partial",
        failureCode: "MISSING_EVIDENCE",
      }),
    });
    delegate.streamChat = jest.fn(async ({ req }: any) =>
      baseResult({
        conversationId: req.conversationId || "c1",
        status: "partial",
        failureCode: "MISSING_EVIDENCE",
      }),
    );
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);

    const out = await orchestrator.streamChat({
      req: {
        userId: "user-1",
        conversationId: "c1",
        message: "stream this",
      },
      sink: { write: () => undefined } as any,
      streamingConfig: {} as any,
    });

    expect(delegate.streamChat).toHaveBeenCalledTimes(1);
    expect(out.fallbackReasonCode).toBe("MISSING_EVIDENCE");
  });

  test("routes all conversation/message methods to delegate", async () => {
    const delegate = createDelegate();
    const orchestrator = new ChatRuntimeOrchestrator(delegate as any);

    await orchestrator.createConversation({ userId: "u1", title: "hello" });
    await orchestrator.listConversations("u1", { limit: 1 });
    await orchestrator.getConversation("u1", "c1");
    await orchestrator.getConversationWithMessages("u1", "c1", { limit: 1 });
    await orchestrator.updateTitle("u1", "c1", "new");
    await orchestrator.deleteConversation("u1", "c1");
    await orchestrator.deleteAllConversations("u1");
    await orchestrator.listMessages("u1", "c1", { limit: 1 });
    await orchestrator.createMessage({
      userId: "u1",
      conversationId: "c1",
      role: "user",
      content: "hello",
    } as any);

    expect(delegate.createConversation).toHaveBeenCalled();
    expect(delegate.listConversations).toHaveBeenCalledWith("u1", { limit: 1 });
    expect(delegate.getConversation).toHaveBeenCalledWith("u1", "c1");
    expect(delegate.getConversationWithMessages).toHaveBeenCalledWith("u1", "c1", {
      limit: 1,
    });
    expect(delegate.updateTitle).toHaveBeenCalledWith("u1", "c1", "new");
    expect(delegate.deleteConversation).toHaveBeenCalledWith("u1", "c1");
    expect(delegate.deleteAllConversations).toHaveBeenCalledWith("u1");
    expect(delegate.listMessages).toHaveBeenCalledWith("u1", "c1", { limit: 1 });
    expect(delegate.createMessage).toHaveBeenCalled();
  });
});
