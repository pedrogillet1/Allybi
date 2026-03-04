import { describe, test, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before any import of the subjects under test.
// ---------------------------------------------------------------------------
jest.mock("../../../services/core/banks/bankLoader.service");
jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import { getBankLoaderInstance } from "../../../services/core/banks/bankLoader.service";
import prisma from "../../../config/database";
import {
  ChatRuntimeOrchestrator,
  type RuntimeDelegate,
} from "./ChatRuntimeOrchestrator";
import type {
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationWithMessagesDTO,
  ChatMessageDTO,
} from "../domain/chat.contracts";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------
const mockGetBankLoaderInstance = getBankLoaderInstance as jest.MockedFunction<
  typeof getBankLoaderInstance
>;

const mockPrismaDocument = (prisma as any).document
  .findMany as jest.MockedFunction<any>;
const mockPrismaConversationFindFirst = (prisma as any).conversation
  .findFirst as jest.MockedFunction<any>;
const mockPrismaConversationUpdateMany = (prisma as any).conversation
  .updateMany as jest.MockedFunction<any>;

// ---------------------------------------------------------------------------
// Bank fixture — satisfies BOTH ChatRuntimeOrchestrator and ScopeService
// ---------------------------------------------------------------------------
const MOCK_MEMORY_POLICY_BANK = {
  config: {
    runtimeTuning: {
      scopeRuntime: {
        tokenMinLength: 3,
        docNameMinLength: 3,
        tokenOverlapThreshold: 0.5,
        candidatePatterns: {
          filename: ["\\b\\w+\\.(?:pdf|docx|xlsx)\\b"],
          docReferencePhrase: [
            "(?:no|do|the)\\s+(?:documento|document)\\s+([\\w\\s]+)",
          ],
        },
        docStatusesAllowed: ["READY"],
        docStopWords: ["the", "a", "my"],
        // ScopeService requirements
        maxScopeDocs: 5,
        clearScopePatterns: [
          "\\bclear\\s+scope\\b",
          "\\bremove\\s+document\\b",
        ],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers — minimal DTO factories
// ---------------------------------------------------------------------------
function makeConversationDTO(
  overrides: Partial<ConversationDTO> = {},
): ConversationDTO {
  return {
    id: "conv-1",
    title: "Test Conversation",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMessageDTO(
  overrides: Partial<ChatMessageDTO> = {},
): ChatMessageDTO {
  return {
    id: "msg-1",
    role: "assistant",
    content: "Hello",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeChatResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    conversationId: "conv-1",
    userMessageId: "user-msg-1",
    assistantMessageId: "asst-msg-1",
    assistantText: "Here is the answer",
    status: "success",
    ...overrides,
  };
}

function makeChatRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    message: "Hello, how are you?",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock delegate factory — all 11 methods as jest.fn()
// ---------------------------------------------------------------------------
function makeMockDelegate(): jest.Mocked<RuntimeDelegate> {
  return {
    chat: jest.fn(),
    streamChat: jest.fn(),
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("ChatRuntimeOrchestrator", () => {
  let delegate: jest.Mocked<RuntimeDelegate>;
  let orchestrator: ChatRuntimeOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();

    // Wire bank loader mock to return the policy fixture
    mockGetBankLoaderInstance.mockReturnValue({
      getBank: jest.fn().mockReturnValue(MOCK_MEMORY_POLICY_BANK),
    } as any);

    // Default Prisma stubs — no documents, no scope
    mockPrismaDocument.mockResolvedValue([]);
    mockPrismaConversationFindFirst.mockResolvedValue(null);
    mockPrismaConversationUpdateMany.mockResolvedValue({ count: 1 });

    delegate = makeMockDelegate();
    orchestrator = new ChatRuntimeOrchestrator(delegate);
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe("constructor", () => {
    test("accepts a valid RuntimeDelegate and constructs without throwing", () => {
      expect(orchestrator).toBeInstanceOf(ChatRuntimeOrchestrator);
    });

    test("throws when memory_policy bank is missing", () => {
      mockGetBankLoaderInstance.mockReturnValue({
        getBank: jest.fn().mockReturnValue(null),
      } as any);

      expect(() => new ChatRuntimeOrchestrator(delegate)).toThrow(
        "memory_policy.config.runtimeTuning.scopeRuntime is required",
      );
    });

    test("throws when tokenMinLength is missing from bank", () => {
      const badBank = {
        config: {
          runtimeTuning: {
            scopeRuntime: {
              ...MOCK_MEMORY_POLICY_BANK.config.runtimeTuning.scopeRuntime,
              tokenMinLength: undefined,
            },
          },
        },
      };
      mockGetBankLoaderInstance.mockReturnValue({
        getBank: jest.fn().mockReturnValue(badBank),
      } as any);

      expect(() => new ChatRuntimeOrchestrator(delegate)).toThrow(
        /tokenMinLength/,
      );
    });
  });

  // -------------------------------------------------------------------------
  // CRUD — direct delegation
  // -------------------------------------------------------------------------
  describe("createConversation", () => {
    test("delegates directly and returns the result", async () => {
      const conv = makeConversationDTO({ id: "conv-new", title: "New Chat" });
      delegate.createConversation.mockResolvedValue(conv);

      const result = await orchestrator.createConversation({
        userId: "user-1",
        title: "New Chat",
      });

      expect(delegate.createConversation).toHaveBeenCalledTimes(1);
      expect(delegate.createConversation).toHaveBeenCalledWith({
        userId: "user-1",
        title: "New Chat",
      });
      expect(result).toEqual(conv);
    });
  });

  describe("listConversations", () => {
    test("delegates directly and returns the list", async () => {
      const list = [
        makeConversationDTO({ id: "c1" }),
        makeConversationDTO({ id: "c2" }),
      ];
      delegate.listConversations.mockResolvedValue(list);

      const result = await orchestrator.listConversations("user-1", {
        limit: 10,
      });

      expect(delegate.listConversations).toHaveBeenCalledTimes(1);
      expect(delegate.listConversations).toHaveBeenCalledWith("user-1", {
        limit: 10,
      });
      expect(result).toEqual(list);
    });

    test("delegates without options when none provided", async () => {
      delegate.listConversations.mockResolvedValue([]);

      await orchestrator.listConversations("user-1");

      expect(delegate.listConversations).toHaveBeenCalledWith(
        "user-1",
        undefined,
      );
    });
  });

  describe("getConversation", () => {
    test("delegates directly and returns the conversation", async () => {
      const conv = makeConversationDTO();
      delegate.getConversation.mockResolvedValue(conv);

      const result = await orchestrator.getConversation("user-1", "conv-1");

      expect(delegate.getConversation).toHaveBeenCalledTimes(1);
      expect(delegate.getConversation).toHaveBeenCalledWith("user-1", "conv-1");
      expect(result).toEqual(conv);
    });

    test("returns null when delegate returns null", async () => {
      delegate.getConversation.mockResolvedValue(null);

      const result = await orchestrator.getConversation("user-1", "no-such");

      expect(result).toBeNull();
    });
  });

  describe("getConversationWithMessages", () => {
    test("delegates directly and returns the full conversation", async () => {
      const full: ConversationWithMessagesDTO = {
        ...makeConversationDTO(),
        messages: [makeMessageDTO()],
      };
      delegate.getConversationWithMessages.mockResolvedValue(full);

      const result = await orchestrator.getConversationWithMessages(
        "user-1",
        "conv-1",
        { limit: 50, order: "asc" },
      );

      expect(delegate.getConversationWithMessages).toHaveBeenCalledWith(
        "user-1",
        "conv-1",
        { limit: 50, order: "asc" },
      );
      expect(result).toEqual(full);
    });
  });

  describe("updateTitle", () => {
    test("delegates directly and returns updated conversation", async () => {
      const updated = makeConversationDTO({ title: "Renamed" });
      delegate.updateTitle.mockResolvedValue(updated);

      const result = await orchestrator.updateTitle(
        "user-1",
        "conv-1",
        "Renamed",
      );

      expect(delegate.updateTitle).toHaveBeenCalledTimes(1);
      expect(delegate.updateTitle).toHaveBeenCalledWith(
        "user-1",
        "conv-1",
        "Renamed",
      );
      expect(result?.title).toBe("Renamed");
    });
  });

  describe("deleteConversation", () => {
    test("delegates directly and returns { ok: true }", async () => {
      delegate.deleteConversation.mockResolvedValue({ ok: true });

      const result = await orchestrator.deleteConversation("user-1", "conv-1");

      expect(delegate.deleteConversation).toHaveBeenCalledWith(
        "user-1",
        "conv-1",
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("deleteAllConversations", () => {
    test("delegates directly and returns count", async () => {
      delegate.deleteAllConversations.mockResolvedValue({
        ok: true,
        deleted: 7,
      });

      const result = await orchestrator.deleteAllConversations("user-1");

      expect(delegate.deleteAllConversations).toHaveBeenCalledWith("user-1");
      expect(result).toEqual({ ok: true, deleted: 7 });
    });
  });

  describe("listMessages", () => {
    test("delegates directly and returns message list", async () => {
      const msgs = [makeMessageDTO({ id: "m1" }), makeMessageDTO({ id: "m2" })];
      delegate.listMessages.mockResolvedValue(msgs);

      const result = await orchestrator.listMessages("user-1", "conv-1", {
        limit: 20,
        order: "desc",
      });

      expect(delegate.listMessages).toHaveBeenCalledWith("user-1", "conv-1", {
        limit: 20,
        order: "desc",
      });
      expect(result).toEqual(msgs);
    });
  });

  describe("createMessage", () => {
    test("delegates directly and returns the created message", async () => {
      const msg = makeMessageDTO({
        id: "msg-new",
        role: "user",
        content: "Hi",
      });
      delegate.createMessage.mockResolvedValue(msg);

      const params = {
        conversationId: "conv-1",
        role: "user" as const,
        content: "Hi",
        userId: "user-1",
      };

      const result = await orchestrator.createMessage(params);

      expect(delegate.createMessage).toHaveBeenCalledTimes(1);
      expect(delegate.createMessage).toHaveBeenCalledWith(params);
      expect(result).toEqual(msg);
    });
  });

  // -------------------------------------------------------------------------
  // chat() — prepareRequest → delegate → postProcess pipeline
  // -------------------------------------------------------------------------
  describe("chat()", () => {
    test("calls delegate.chat and returns a result with status success", async () => {
      const raw = makeChatResult();
      delegate.chat.mockResolvedValue(raw);

      const req = makeChatRequest();
      const result = await orchestrator.chat(req);

      expect(delegate.chat).toHaveBeenCalledTimes(1);
      expect(result.conversationId).toBe("conv-1");
      expect(result.assistantText).toBe("Here is the answer");
      expect(result.status).toBe("success");
    });

    test("passes the prepared request (with attachedDocumentIds array) to delegate", async () => {
      const raw = makeChatResult();
      delegate.chat.mockResolvedValue(raw);

      const req = makeChatRequest({ attachedDocumentIds: ["doc-1"] });
      await orchestrator.chat(req);

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(Array.isArray(capturedReq.attachedDocumentIds)).toBe(true);
    });

    test("normalizes the result — populates completion, truncation, evidence fields", async () => {
      const raw = makeChatResult({
        assistantText: "Answer here",
        status: "success",
        // No completion / truncation / evidence set by delegate
      });
      delegate.chat.mockResolvedValue(raw);

      const result = await orchestrator.chat(makeChatRequest());

      expect(result.completion).toBeDefined();
      expect(typeof result.completion?.answered).toBe("boolean");
      expect(result.truncation).toBeDefined();
      expect(result.evidence).toBeDefined();
    });

    test("does not call delegate.streamChat", async () => {
      delegate.chat.mockResolvedValue(makeChatResult());

      await orchestrator.chat(makeChatRequest());

      expect(delegate.streamChat).not.toHaveBeenCalled();
    });

    test("propagates delegate rejection", async () => {
      delegate.chat.mockRejectedValue(new Error("upstream error"));

      await expect(orchestrator.chat(makeChatRequest())).rejects.toThrow(
        "upstream error",
      );
    });

    test("detects no document mentions when message has no filename or phrase", async () => {
      const raw = makeChatResult({ attachedDocumentIds: undefined });
      delegate.chat.mockResolvedValue(raw);

      const req = makeChatRequest({
        message: "What is the weather?",
        attachedDocumentIds: [],
        conversationId: undefined,
      });
      await orchestrator.chat(req);

      // No prisma document lookup should be needed when no candidates found
      // (findMany may or may not be called; either way it returned [] via mock)
      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toEqual([]);
      expect(mockPrismaDocument).not.toHaveBeenCalled();
    });

    test("resolves document mentions when a filename is present in the message", async () => {
      mockPrismaDocument.mockResolvedValue([
        { id: "doc-abc", filename: "report.pdf" },
      ]);

      const raw = makeChatResult();
      delegate.chat.mockResolvedValue(raw);

      const req = makeChatRequest({
        message: "Summarise report.pdf for me",
        attachedDocumentIds: [],
        conversationId: undefined,
      });
      await orchestrator.chat(req);

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toContain("doc-abc");
    });

    test("does not resolve mentions when overlap is below threshold", async () => {
      mockPrismaDocument.mockResolvedValue([
        { id: "doc-abc", filename: "report.pdf", displayTitle: null },
      ]);
      delegate.chat.mockResolvedValue(makeChatResult());

      const req = makeChatRequest({
        message: "Summarise budget.pdf for me",
        attachedDocumentIds: [],
        conversationId: undefined,
      });
      await orchestrator.chat(req);

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toEqual([]);
    });

    test("does not widen explicit attached scope when semantic mention matches outside docs", async () => {
      mockPrismaDocument.mockResolvedValue([
        { id: "doc-a", filename: "notes.pdf" },
        { id: "doc-b", filename: "scrum.pdf" },
      ]);

      delegate.chat.mockResolvedValue(makeChatResult());

      await orchestrator.chat(
        makeChatRequest({
          message: "Quero analisar external.pdf",
          attachedDocumentIds: ["doc-a", "doc-b"],
          conversationId: "conv-1",
        }),
      );

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toEqual(["doc-a", "doc-b"]);
      expect(mockPrismaDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ["doc-a", "doc-b"] },
          }),
        }),
      );
    });

    test("narrows explicit attached scope only within the explicit docset", async () => {
      mockPrismaDocument.mockResolvedValue([
        { id: "doc-a", filename: "notes.pdf" },
        { id: "doc-b", filename: "report.pdf" },
      ]);

      delegate.chat.mockResolvedValue(makeChatResult());

      await orchestrator.chat(
        makeChatRequest({
          message: "Resuma report.pdf",
          attachedDocumentIds: ["doc-a", "doc-b"],
          conversationId: "conv-1",
        }),
      );

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toEqual(["doc-b"]);
    });

    test("keeps persisted scope when mention resolves outside persisted docset", async () => {
      mockPrismaConversationFindFirst.mockResolvedValue({
        scopeDocumentIds: ["doc-1", "doc-2"],
      });
      mockPrismaDocument.mockResolvedValue([
        { id: "doc-1", filename: "onepager.pdf" },
        { id: "doc-2", filename: "notes.pdf" },
      ]);
      delegate.chat.mockResolvedValue(makeChatResult());

      await orchestrator.chat(
        makeChatRequest({
          message: "Agora abre external.pdf",
          attachedDocumentIds: [],
          conversationId: "conv-1",
        }),
      );

      const capturedReq = (delegate.chat as jest.MockedFunction<any>).mock
        .calls[0][0] as ChatRequest;
      expect(capturedReq.attachedDocumentIds).toEqual(["doc-1", "doc-2"]);
      expect(mockPrismaDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ["doc-1", "doc-2"] },
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // streamChat() — same pipeline but via delegate.streamChat
  // -------------------------------------------------------------------------
  describe("streamChat()", () => {
    test("calls delegate.streamChat and returns a result", async () => {
      const raw = makeChatResult();
      delegate.streamChat.mockResolvedValue(raw);

      const sink = { write: jest.fn(), end: jest.fn() } as any;
      const streamingConfig = { model: "gpt-4" } as any;

      const result = await orchestrator.streamChat({
        req: makeChatRequest(),
        sink,
        streamingConfig,
      });

      expect(delegate.streamChat).toHaveBeenCalledTimes(1);
      expect(result.conversationId).toBe("conv-1");
      expect(result.assistantText).toBe("Here is the answer");
    });

    test("forwards the sink and streamingConfig to the delegate unchanged", async () => {
      delegate.streamChat.mockResolvedValue(makeChatResult());

      const sink = { write: jest.fn(), end: jest.fn() } as any;
      const streamingConfig = { model: "claude-3" } as any;

      await orchestrator.streamChat({
        req: makeChatRequest(),
        sink,
        streamingConfig,
      });

      const call = (delegate.streamChat as jest.MockedFunction<any>).mock
        .calls[0][0] as {
        req: ChatRequest;
        sink: unknown;
        streamingConfig: unknown;
      };
      expect(call.sink).toBe(sink);
      expect(call.streamingConfig).toBe(streamingConfig);
    });

    test("does not call delegate.chat", async () => {
      delegate.streamChat.mockResolvedValue(makeChatResult());

      await orchestrator.streamChat({
        req: makeChatRequest(),
        sink: { write: jest.fn(), end: jest.fn() } as any,
        streamingConfig: {} as any,
      });

      expect(delegate.chat).not.toHaveBeenCalled();
    });

    test("propagates delegate rejection", async () => {
      delegate.streamChat.mockRejectedValue(new Error("stream error"));

      await expect(
        orchestrator.streamChat({
          req: makeChatRequest(),
          sink: { write: jest.fn(), end: jest.fn() } as any,
          streamingConfig: {} as any,
        }),
      ).rejects.toThrow("stream error");
    });

    test("normalizes the result from streamChat just like chat()", async () => {
      const raw = makeChatResult({ assistantText: "Streamed answer" });
      delegate.streamChat.mockResolvedValue(raw);

      const result = await orchestrator.streamChat({
        req: makeChatRequest(),
        sink: { write: jest.fn(), end: jest.fn() } as any,
        streamingConfig: {} as any,
      });

      expect(result.completion).toBeDefined();
      expect(result.truncation).toBeDefined();
      expect(result.evidence).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scope enforcement in postProcess
  // -------------------------------------------------------------------------
  describe("scope enforcement (postProcess)", () => {
    test("throws when scope persistence update affects zero rows", async () => {
      mockPrismaConversationUpdateMany.mockResolvedValueOnce({ count: 0 });
      delegate.chat.mockResolvedValue(makeChatResult({ conversationId: "conv-1" }));

      await expect(
        orchestrator.chat(
          makeChatRequest({
            conversationId: "conv-1",
            attachedDocumentIds: ["doc-1"],
          }),
        ),
      ).rejects.toThrow("Conversation not found for this account.");
    });

    test("persists only valid user-owned scope IDs when attachment scope is provided", async () => {
      mockPrismaDocument.mockResolvedValue([{ id: "doc-1" }]);
      delegate.chat.mockResolvedValue(
        makeChatResult({
          conversationId: "conv-1",
          sources: [],
        }),
      );

      await orchestrator.chat(
        makeChatRequest({
          conversationId: "conv-1",
          message: "hello there",
          attachedDocumentIds: ["doc-1", "doc-missing"],
        }),
      );

      expect(mockPrismaConversationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scopeDocumentIds: ["doc-1"],
          }),
        }),
      );
    });

    test("drops invalid scope IDs and persists empty scope when none are valid", async () => {
      mockPrismaDocument.mockResolvedValue([]);
      delegate.chat.mockResolvedValue(
        makeChatResult({
          conversationId: "conv-1",
          sources: [],
        }),
      );

      await orchestrator.chat(
        makeChatRequest({
          conversationId: "conv-1",
          message: "hello there",
          attachedDocumentIds: ["doc-ghost"],
        }),
      );

      expect(mockPrismaConversationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scopeDocumentIds: [],
          }),
        }),
      );
    });

    test("enforces scope — sources from out-of-scope document are stripped", async () => {
      // Conversation has scope locked to doc-allowed
      mockPrismaConversationFindFirst.mockResolvedValue({
        scopeDocumentIds: ["doc-allowed"],
      });

      const raw = makeChatResult({
        conversationId: "conv-1",
        sources: [
          {
            documentId: "doc-allowed",
            filename: "good.pdf",
            mimeType: "application/pdf",
            page: 1,
          },
          {
            documentId: "doc-other",
            filename: "bad.pdf",
            mimeType: "application/pdf",
            page: 2,
          },
        ],
      });
      delegate.chat.mockResolvedValue(raw);

      const result = await orchestrator.chat(
        makeChatRequest({ attachedDocumentIds: [] }),
      );

      const sourceIds = (result.sources ?? []).map((s) => s.documentId);
      expect(sourceIds).toContain("doc-allowed");
      expect(sourceIds).not.toContain("doc-other");
      expect(result.scopeEnforced).toBe(true);
    });

    test("does not enforce scope when no scope is set", async () => {
      mockPrismaConversationFindFirst.mockResolvedValue({
        scopeDocumentIds: [],
      });

      const raw = makeChatResult({
        sources: [
          {
            documentId: "doc-any",
            filename: "any.pdf",
            mimeType: "application/pdf",
            page: 1,
          },
        ],
      });
      delegate.chat.mockResolvedValue(raw);

      const result = await orchestrator.chat(makeChatRequest());

      const sourceIds = (result.sources ?? []).map((s) => s.documentId);
      expect(sourceIds).toContain("doc-any");
      // scopeEnforced not set when no scope constraint
      expect(result.scopeEnforced).not.toBe(true);
    });
  });
});
