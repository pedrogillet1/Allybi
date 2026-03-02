import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mocks — must come before imports of the module under test
// ---------------------------------------------------------------------------

jest.mock("../core/banks/bankLoader.service", () => ({
  getBankLoaderInstance: jest.fn(),
}));

const mockFindMany = jest.fn();

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    message: {
      findMany: (...args: any[]) => mockFindMany(...args),
    },
  },
}));

import { getBankLoaderInstance } from "../core/banks/bankLoader.service";
import {
  ConversationMemoryService,
  type ConversationContext,
} from "./conversationMemory.service";

const mockedGetBankLoaderInstance =
  getBankLoaderInstance as jest.MockedFunction<typeof getBankLoaderInstance>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure the bank loader mock to return a memory_policy bank. */
function installBankMock(overrides: {
  maxMessages?: number;
  maxConversations?: number;
  ttlSeconds?: number;
} = {}) {
  mockedGetBankLoaderInstance.mockReturnValue({
    getBank: () => ({
      config: {
        runtimeTuning: {
          inMemoryMessageCacheLimit: overrides.maxMessages ?? 5,
          inMemoryConversationCacheLimit: overrides.maxConversations ?? 3,
          inMemoryCacheTtlSeconds: overrides.ttlSeconds ?? 60,
        },
      },
    }),
  } as any);
}

/** Build a fake prisma message row for the DB mock. */
function fakeDbMessage(
  role: string,
  content: string,
  metadata: unknown = null,
  createdAt = new Date(),
  userId = "u1",
) {
  return {
    role,
    content,
    metadata,
    createdAt,
    conversation: { userId },
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("ConversationMemoryService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1) Cache hit within TTL — DB should not be queried
  // -----------------------------------------------------------------------
  describe("cache hit within TTL", () => {
    test("getContext returns cached data without calling DB after addMessage", async () => {
      installBankMock();
      const svc = new ConversationMemoryService();

      // addMessage with no prior cache triggers a getContext -> DB call for
      // the initial lookup (returns empty), then writes to cache.
      mockFindMany.mockResolvedValueOnce([]);

      await svc.addMessage("conv-1", "user", "hello", undefined, "u1");

      // Reset so we can verify the next call does NOT hit DB.
      mockFindMany.mockClear();

      const ctx = await svc.getContext("conv-1", "u1");

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(ctx).not.toBeNull();
      expect(ctx!.messages).toHaveLength(1);
      expect(ctx!.messages[0].content).toBe("hello");
    });
  });

  // -----------------------------------------------------------------------
  // 2) Cache miss — fresh service with empty cache queries DB
  // -----------------------------------------------------------------------
  describe("cache miss falls back to DB", () => {
    test("getContext calls prisma.message.findMany when cache is empty", async () => {
      installBankMock();
      const svc = new ConversationMemoryService();

      // DB returns rows in desc order by createdAt (as the query specifies).
      // The service reverses them. Use distinct timestamps so order is stable.
      const t1 = new Date("2026-03-01T10:00:01Z");
      const t2 = new Date("2026-03-01T10:00:00Z");
      mockFindMany.mockResolvedValueOnce([
        // desc order: newest first
        fakeDbMessage("assistant", "hello!", null, t1),
        fakeDbMessage("user", "hi there", null, t2),
      ]);

      const ctx = await svc.getContext("conv-db", "u1");

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(ctx).not.toBeNull();
      expect(ctx!.messages).toHaveLength(2);
      // After .reverse(), chronological order: user first, then assistant
      expect(ctx!.messages[0].role).toBe("user");
      expect(ctx!.messages[0].content).toBe("hi there");
      expect(ctx!.messages[1].role).toBe("assistant");
      expect(ctx!.messages[1].content).toBe("hello!");
    });
  });

  // -----------------------------------------------------------------------
  // 3) DB query failure — logs error and returns null
  // -----------------------------------------------------------------------
  describe("DB query failure", () => {
    test("getContext returns null and logs via console.error on DB rejection", async () => {
      installBankMock();
      const svc = new ConversationMemoryService();

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      mockFindMany.mockRejectedValueOnce(new Error("connection refused"));

      const ctx = await svc.getContext("conv-err", "u1");

      expect(ctx).toBeNull();
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[conversation-memory] DB query failed",
        expect.objectContaining({ conversationId: "conv-err" }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4) addMessage respects maxMessages trim
  // -----------------------------------------------------------------------
  describe("addMessage respects maxMessages", () => {
    test("context is trimmed to the most recent maxMessages entries", async () => {
      installBankMock({ maxMessages: 5 });
      const svc = new ConversationMemoryService();

      // First addMessage triggers a DB lookup — return empty.
      mockFindMany.mockResolvedValue([]);

      for (let i = 1; i <= 7; i++) {
        await svc.addMessage("conv-trim", "user", `msg-${i}`, undefined, "u1");
      }

      const ctx = await svc.getContext("conv-trim", "u1");

      expect(ctx).not.toBeNull();
      expect(ctx!.messages).toHaveLength(5);
      // Should keep the last 5 (msg-3 through msg-7)
      expect(ctx!.messages[0].content).toBe("msg-3");
      expect(ctx!.messages[4].content).toBe("msg-7");
    });
  });

  // -----------------------------------------------------------------------
  // 5) Metadata parse failure logs warning
  // -----------------------------------------------------------------------
  describe("metadata parse failure", () => {
    test("logs console.warn with [conversation-memory] prefix on invalid JSON metadata", async () => {
      installBankMock();
      const svc = new ConversationMemoryService();

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      mockFindMany.mockResolvedValueOnce([
        fakeDbMessage("user", "test", 'invalid-json{"', new Date()),
      ]);

      const ctx = await svc.getContext("conv-meta", "u1");

      expect(ctx).not.toBeNull();
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[conversation-memory] metadata parse failed",
        expect.objectContaining({
          error: expect.any(String),
        }),
      );
      // Message should still be present, just without metadata
      expect(ctx!.messages[0].metadata).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 6) LRU eviction at maxConversations
  // -----------------------------------------------------------------------
  describe("LRU eviction at maxConversations", () => {
    test("oldest-touched conversation is evicted when cache exceeds maxConversations", async () => {
      // Use fake timers so we can control Date.now() for deterministic LRU ordering.
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-03-01T12:00:00Z"));

      installBankMock({ maxConversations: 3 });
      const svc = new ConversationMemoryService();

      // All addMessage calls trigger a DB fallback first — return empty each time.
      mockFindMany.mockResolvedValue([]);

      // Add conv-A at t=0
      await svc.addMessage("conv-A", "user", "a", undefined, "u1");

      // Advance time and add conv-B at t=1s
      jest.advanceTimersByTime(1000);
      await svc.addMessage("conv-B", "user", "b", undefined, "u1");

      // Advance time and add conv-C at t=2s
      jest.advanceTimersByTime(1000);
      await svc.addMessage("conv-C", "user", "c", undefined, "u1");

      expect(svc.getStats().activeConversations).toBe(3);

      // Advance time and touch conv-A at t=3s so it is recently used.
      // Now ordering by touchedAtMs: B(t=1s) < C(t=2s) < A(t=3s)
      jest.advanceTimersByTime(1000);
      await svc.getContext("conv-A", "u1");

      // Advance time and add conv-D at t=4s — should evict conv-B (oldest touched).
      jest.advanceTimersByTime(1000);
      await svc.addMessage("conv-D", "user", "d", undefined, "u1");

      expect(svc.getStats().activeConversations).toBe(3);

      // conv-B should be evicted: getContext will need to hit DB.
      mockFindMany.mockClear();
      mockFindMany.mockResolvedValueOnce([]);
      const ctxB = await svc.getContext("conv-B", "u1");

      // It hit the DB because the cache entry was evicted (returns null since DB is empty).
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(ctxB).toBeNull();

      // conv-A and conv-C should still be in cache (no DB call needed).
      mockFindMany.mockClear();
      const ctxA = await svc.getContext("conv-A", "u1");
      const ctxC = await svc.getContext("conv-C", "u1");

      expect(mockFindMany).not.toHaveBeenCalled();
      expect(ctxA).not.toBeNull();
      expect(ctxC).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 7) getStats returns correct configuration
  // -----------------------------------------------------------------------
  describe("getStats", () => {
    test("returns cache configuration from memory_policy bank", () => {
      installBankMock({ maxMessages: 5, maxConversations: 3, ttlSeconds: 60 });
      const svc = new ConversationMemoryService();

      const stats = svc.getStats();

      expect(stats).toEqual({
        activeConversations: 0,
        maxConversations: 3,
        maxMessages: 5,
        cacheTtlMs: 60_000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8) clearContext / invalidateCache removes entry
  // -----------------------------------------------------------------------
  describe("clearContext", () => {
    test("removes conversation from cache so next getContext queries DB", async () => {
      installBankMock();
      const svc = new ConversationMemoryService();

      mockFindMany.mockResolvedValue([]);

      await svc.addMessage("conv-clear", "user", "hi", undefined, "u1");
      expect(svc.getStats().activeConversations).toBe(1);

      svc.clearContext("conv-clear", "u1");
      expect(svc.getStats().activeConversations).toBe(0);

      // Next getContext should hit DB.
      mockFindMany.mockClear();
      mockFindMany.mockResolvedValueOnce([]);
      await svc.getContext("conv-clear", "u1");
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
  });
});
