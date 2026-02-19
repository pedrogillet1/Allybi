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

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

function baseResult(): ChatResult {
  return {
    conversationId: "",
    userMessageId: "u1",
    assistantMessageId: "a1",
    assistantText: "ok",
  };
}

function createDelegate() {
  const chat = jest.fn(async (_req: ChatRequest) => baseResult());
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
    createMessage: jest.fn(async (): Promise<ChatMessageDTO> => ({
      id: "m1",
      role: "assistant",
      content: "ok",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  };
}

describe("ChatRuntimeOrchestrator", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
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
});
