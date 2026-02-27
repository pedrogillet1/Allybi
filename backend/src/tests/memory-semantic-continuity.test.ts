/**
 * Memory Semantic Continuity Tests
 *
 * Verifies behavioral correctness of ConversationMemoryService:
 *   - construction from a mocked bank loader
 *   - in-memory cache persistence and retrieval (cache hit path)
 *   - bounded eviction (respects inMemoryConversationCacheLimit)
 *   - TTL expiry eviction (respects inMemoryCacheTtlSeconds)
 *   - user-scoped cache key isolation
 *   - addMessage / updateMetadata mutations update the cache
 *   - invalidateCache and clearContext remove entries
 *   - getStats reflects live cache state
 *   - getContext falls back to Prisma when cache is cold
 *   - public API surface completeness
 */

import { describe, test, expect, jest, beforeEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// 1.  Mock the bank loader BEFORE importing the service
// ---------------------------------------------------------------------------

const mockGetBank = jest.fn<() => unknown>();

jest.mock("../services/core/banks/bankLoader.service", () => ({
  getBankLoaderInstance: jest.fn(() => ({
    getBank: mockGetBank,
    getOptionalBank: jest.fn<() => null>().mockReturnValue(null),
  })),
}));

// ---------------------------------------------------------------------------
// 2.  Mock Prisma to avoid real DB access
// ---------------------------------------------------------------------------

const mockMessageFindMany = jest.fn<() => Promise<unknown[]>>();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    message: {
      findMany: mockMessageFindMany,
    },
  },
}));

// ---------------------------------------------------------------------------
// 3.  Import the service AFTER mocks are registered
// ---------------------------------------------------------------------------

import { ConversationMemoryService } from "../services/memory/conversationMemory.service";

// ---------------------------------------------------------------------------
// 4.  Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal valid memory_policy bank shape that satisfies the service constructor.
 * Values are deliberately small so eviction tests stay fast.
 */
function makeMemoryPolicyBank(overrides?: {
  inMemoryMessageCacheLimit?: number;
  inMemoryConversationCacheLimit?: number;
  inMemoryCacheTtlSeconds?: number;
}) {
  return {
    config: {
      runtimeTuning: {
        inMemoryMessageCacheLimit: overrides?.inMemoryMessageCacheLimit ?? 240,
        inMemoryConversationCacheLimit:
          overrides?.inMemoryConversationCacheLimit ?? 1200,
        inMemoryCacheTtlSeconds: overrides?.inMemoryCacheTtlSeconds ?? 900,
      },
    },
  };
}

function buildService(overrides?: Parameters<typeof makeMemoryPolicyBank>[0]) {
  mockGetBank.mockReturnValue(makeMemoryPolicyBank(overrides));
  return new ConversationMemoryService();
}

/**
 * Build a synthetic Prisma message row (as returned by findMany).
 */
function makeDbMessage(
  role: "user" | "assistant",
  content: string,
  userId = "u1",
  metadata: unknown = null,
) {
  return {
    role,
    content,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    metadata,
    conversation: { userId },
  };
}

// ---------------------------------------------------------------------------
// 5.  Test suites
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockMessageFindMany.mockResolvedValue([]);
});

// ===========================================================================
// A.  Construction
// ===========================================================================

describe("ConversationMemoryService – construction", () => {
  test("constructs successfully when bank has valid runtimeTuning", () => {
    expect(() => buildService()).not.toThrow();
  });

  test("throws when inMemoryMessageCacheLimit is missing from bank", () => {
    mockGetBank.mockReturnValue({
      config: { runtimeTuning: {} },
    });
    expect(() => new ConversationMemoryService()).toThrow(
      /inMemoryMessageCacheLimit is required/,
    );
  });

  test("throws when inMemoryMessageCacheLimit is zero", () => {
    mockGetBank.mockReturnValue({
      config: {
        runtimeTuning: {
          inMemoryMessageCacheLimit: 0,
        },
      },
    });
    expect(() => new ConversationMemoryService()).toThrow(
      /inMemoryMessageCacheLimit is required/,
    );
  });

  test("throws when inMemoryMessageCacheLimit is negative", () => {
    mockGetBank.mockReturnValue({
      config: {
        runtimeTuning: {
          inMemoryMessageCacheLimit: -5,
        },
      },
    });
    expect(() => new ConversationMemoryService()).toThrow(
      /inMemoryMessageCacheLimit is required/,
    );
  });

  test("uses default maxConversations (1200) when inMemoryConversationCacheLimit is absent", () => {
    mockGetBank.mockReturnValue({
      config: {
        runtimeTuning: {
          inMemoryMessageCacheLimit: 10,
          // inMemoryConversationCacheLimit intentionally omitted
        },
      },
    });
    const svc = new ConversationMemoryService();
    expect(svc.getStats().maxConversations).toBe(1200);
  });

  test("uses default cacheTtlMs (15 min) when inMemoryCacheTtlSeconds is absent", () => {
    mockGetBank.mockReturnValue({
      config: {
        runtimeTuning: {
          inMemoryMessageCacheLimit: 10,
          // inMemoryCacheTtlSeconds intentionally omitted
        },
      },
    });
    const svc = new ConversationMemoryService();
    expect(svc.getStats().cacheTtlMs).toBe(15 * 60 * 1000);
  });

  test("reads maxMessages and maxConversations from bank", () => {
    const svc = buildService({
      inMemoryMessageCacheLimit: 42,
      inMemoryConversationCacheLimit: 77,
    });
    const stats = svc.getStats();
    expect(stats.maxMessages).toBe(42);
    expect(stats.maxConversations).toBe(77);
  });

  test("converts cacheTtlMs correctly from seconds to milliseconds", () => {
    const svc = buildService({ inMemoryCacheTtlSeconds: 60 });
    expect(svc.getStats().cacheTtlMs).toBe(60_000);
  });
});

// ===========================================================================
// B.  Public API surface
// ===========================================================================

describe("ConversationMemoryService – public API surface", () => {
  test("exposes getContext as an async function", () => {
    const svc = buildService();
    expect(typeof svc.getContext).toBe("function");
  });

  test("exposes addMessage as an async function", () => {
    const svc = buildService();
    expect(typeof svc.addMessage).toBe("function");
  });

  test("exposes updateMetadata as an async function", () => {
    const svc = buildService();
    expect(typeof svc.updateMetadata).toBe("function");
  });

  test("exposes invalidateCache as a synchronous function", () => {
    const svc = buildService();
    expect(typeof svc.invalidateCache).toBe("function");
  });

  test("exposes clearContext as a synchronous function", () => {
    const svc = buildService();
    expect(typeof svc.clearContext).toBe("function");
  });

  test("exposes getStats as a synchronous function returning an object", () => {
    const svc = buildService();
    const stats = svc.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.activeConversations).toBe("number");
    expect(typeof stats.maxConversations).toBe("number");
    expect(typeof stats.maxMessages).toBe("number");
    expect(typeof stats.cacheTtlMs).toBe("number");
  });
});

// ===========================================================================
// C.  Cache persistence and retrieval (warm path)
// ===========================================================================

describe("ConversationMemoryService – in-memory cache persistence", () => {
  test("getContext returns null when cache is cold and DB returns no rows", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    const result = await svc.getContext("conv-1", "user-1");
    expect(result).toBeNull();
  });

  test("addMessage populates cache; second getContext returns cached context", async () => {
    const svc = buildService();
    // DB returns nothing (cold start)
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-1", "user", "Hello world", undefined, "u1");

    // DB should NOT be called for the second lookup — cache warm
    const ctx = await svc.getContext("conv-1", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.conversationId).toBe("conv-1");
    expect(ctx!.userId).toBe("u1");
    expect(ctx!.messages).toHaveLength(1);
    expect(ctx!.messages[0].role).toBe("user");
    expect(ctx!.messages[0].content).toBe("Hello world");
  });

  test("addMessage accumulates multiple messages in order", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-2", "user", "First message", undefined, "u1");
    await svc.addMessage(
      "conv-2",
      "assistant",
      "Second message",
      undefined,
      "u1",
    );
    await svc.addMessage("conv-2", "user", "Third message", undefined, "u1");

    const ctx = await svc.getContext("conv-2", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.messages).toHaveLength(3);
    expect(ctx!.messages[0].content).toBe("First message");
    expect(ctx!.messages[1].content).toBe("Second message");
    expect(ctx!.messages[2].content).toBe("Third message");
  });

  test("addMessage stores MessageMetadata on the message entry", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    const meta = {
      intent: "summarize",
      confidence: 0.9,
      sourceDocumentIds: ["doc-a", "doc-b"],
    };

    await svc.addMessage("conv-3", "assistant", "Summary here", meta, "u1");

    const ctx = await svc.getContext("conv-3", "u1");
    expect(ctx).not.toBeNull();
    const msg = ctx!.messages[0];
    expect(msg.metadata?.intent).toBe("summarize");
    expect(msg.metadata?.confidence).toBe(0.9);
    expect(msg.metadata?.sourceDocumentIds).toEqual(["doc-a", "doc-b"]);
  });

  test("getContext on a warm cache does not call Prisma again", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-4", "user", "Hi", undefined, "u1");
    // Reset call count
    mockMessageFindMany.mockClear();

    await svc.getContext("conv-4", "u1");
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D.  DB fallback (cold cache)
// ===========================================================================

describe("ConversationMemoryService – DB fallback path", () => {
  test("getContext hydrates from DB when cache is cold", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([
      makeDbMessage("user", "DB message", "u1"),
    ]);

    const ctx = await svc.getContext("conv-db-1", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.messages).toHaveLength(1);
    expect(ctx!.messages[0].content).toBe("DB message");
    expect(ctx!.userId).toBe("u1");
    expect(mockMessageFindMany).toHaveBeenCalledTimes(1);
  });

  test("getContext writes DB result into cache so next call is a hit", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([
      makeDbMessage("user", "DB message", "u1"),
    ]);

    // First call — DB
    await svc.getContext("conv-db-2", "u1");
    mockMessageFindMany.mockClear();

    // Second call — should be a cache hit
    const ctx = await svc.getContext("conv-db-2", "u1");
    expect(ctx).not.toBeNull();
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  test("getContext extracts lastIntent and lastDocumentIds from the last assistant message", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([
      makeDbMessage("user", "User turn", "u1"),
      makeDbMessage(
        "assistant",
        "Assistant turn",
        "u1",
        JSON.stringify({
          primaryIntent: "find_data",
          confidence: 0.85,
          sourceDocuments: ["doc-x"],
        }),
      ),
    ]);

    const ctx = await svc.getContext("conv-db-3", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.metadata.lastIntent).toBe("find_data");
    expect(ctx!.metadata.lastDocumentIds).toEqual(["doc-x"]);
  });

  test("getContext returns null when DB call throws", async () => {
    const svc = buildService();
    mockMessageFindMany.mockRejectedValue(new Error("DB connection error"));

    const ctx = await svc.getContext("conv-db-err", "u1");
    expect(ctx).toBeNull();
  });

  test("getContext passes userId filter to Prisma when userId is provided", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([
      makeDbMessage("user", "Scoped message", "u42"),
    ]);

    await svc.getContext("conv-scoped", "u42");

    const [calledArgs] = mockMessageFindMany.mock.calls as [
      [
        {
          where: { conversationId: string; conversation?: { userId: string } };
          take: number;
        },
      ],
    ][];
    expect(calledArgs[0].where.conversation).toEqual({ userId: "u42" });
  });

  test("getContext omits conversation userId filter when userId is empty", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([
      makeDbMessage("user", "Unscoped message", "u1"),
    ]);

    await svc.getContext("conv-unscoped");

    const [calledArgs] = mockMessageFindMany.mock.calls as [
      [
        {
          where: { conversationId: string; conversation?: { userId: string } };
        },
      ],
    ][];
    expect(calledArgs[0].where).not.toHaveProperty("conversation");
  });
});

// ===========================================================================
// E.  Bounded cache eviction (maxConversations)
// ===========================================================================

describe("ConversationMemoryService – bounded cache eviction", () => {
  test("cache size does not grow beyond maxConversations", async () => {
    const MAX = 3;
    const svc = buildService({
      inMemoryConversationCacheLimit: MAX,
      inMemoryMessageCacheLimit: 10,
    });
    mockMessageFindMany.mockResolvedValue([]);

    // Add one more than the limit
    for (let i = 1; i <= MAX + 2; i++) {
      await svc.addMessage(`conv-${i}`, "user", `msg ${i}`, undefined, "u1");
    }

    expect(svc.getStats().activeConversations).toBeLessThanOrEqual(MAX);
  });

  test("eviction removes the LRU (least-recently-touched) entry first", async () => {
    const MAX = 2;
    const svc = buildService({
      inMemoryConversationCacheLimit: MAX,
      inMemoryMessageCacheLimit: 10,
    });
    mockMessageFindMany.mockResolvedValue([]);

    // Populate exactly MAX entries
    await svc.addMessage("conv-oldest", "user", "oldest", undefined, "u1");
    await svc.addMessage("conv-recent", "user", "recent", undefined, "u1");

    // Touch conv-recent to make conv-oldest the LRU
    await svc.getContext("conv-recent", "u1");

    // Adding a third entry must evict conv-oldest
    await svc.addMessage("conv-new", "user", "new", undefined, "u1");

    // conv-oldest should be evicted — Prisma (empty) gets called for it
    mockMessageFindMany.mockResolvedValue([]);
    mockMessageFindMany.mockClear();
    const evictedCtx = await svc.getContext("conv-oldest", "u1");

    // Either evicted (null) or forced a DB hit
    const dbWasCalled = (mockMessageFindMany.mock.calls.length as number) > 0;
    expect(evictedCtx === null || dbWasCalled).toBe(true);
  });

  test("non-evicted entries remain accessible after eviction runs", async () => {
    const MAX = 2;
    const svc = buildService({
      inMemoryConversationCacheLimit: MAX,
      inMemoryMessageCacheLimit: 10,
    });
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-a", "user", "msg-a", undefined, "u1");
    await svc.addMessage("conv-b", "user", "msg-b", undefined, "u1");

    // Touch conv-b so conv-a is older
    await svc.getContext("conv-b", "u1");

    // This should evict conv-a
    await svc.addMessage("conv-c", "user", "msg-c", undefined, "u1");

    // conv-b and conv-c should still be cached
    mockMessageFindMany.mockClear();
    const ctxB = await svc.getContext("conv-b", "u1");
    const ctxC = await svc.getContext("conv-c", "u1");

    expect(ctxB).not.toBeNull();
    expect(ctxC).not.toBeNull();
    // Neither should hit the DB
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F.  TTL expiry
// ===========================================================================

describe("ConversationMemoryService – TTL expiry", () => {
  test("expired entries are treated as a cache miss and evicted on read", async () => {
    // Use a 1-second TTL
    const svc = buildService({
      inMemoryCacheTtlSeconds: 1,
      inMemoryMessageCacheLimit: 10,
    });
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-ttl", "user", "Will expire", undefined, "u1");
    expect(svc.getStats().activeConversations).toBe(1);

    // Advance time past the TTL by mocking Date.now()
    const realNow = Date.now;
    const fakeNow = realNow() + 2_000; // 2 seconds in the future
    jest.spyOn(Date, "now").mockReturnValue(fakeNow);

    try {
      const ctx = await svc.getContext("conv-ttl", "u1");
      // Cache miss → Prisma is called (empty → null)
      expect(ctx).toBeNull();
      // The expired entry should have been deleted from the cache
      expect(svc.getStats().activeConversations).toBe(0);
    } finally {
      jest.spyOn(Date, "now").mockImplementation(realNow);
    }
  });
});

// ===========================================================================
// G.  User-scoped cache key isolation
// ===========================================================================

describe("ConversationMemoryService – user-scoped key isolation", () => {
  test("same conversationId under different userId values are cached independently", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage(
      "shared-conv",
      "user",
      "User-A message",
      undefined,
      "user-a",
    );
    await svc.addMessage(
      "shared-conv",
      "user",
      "User-B message",
      undefined,
      "user-b",
    );

    const ctxA = await svc.getContext("shared-conv", "user-a");
    const ctxB = await svc.getContext("shared-conv", "user-b");

    expect(ctxA).not.toBeNull();
    expect(ctxB).not.toBeNull();

    // Each user sees only their own messages
    expect(ctxA!.messages.every((m) => m.content === "User-A message")).toBe(
      true,
    );
    expect(ctxB!.messages.every((m) => m.content === "User-B message")).toBe(
      true,
    );
  });

  test("cache counts separate keys for different users on the same conv", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-x", "user", "msg-a", undefined, "user-1");
    await svc.addMessage("conv-x", "user", "msg-b", undefined, "user-2");

    // Two distinct cache keys should exist
    expect(svc.getStats().activeConversations).toBe(2);
  });

  test("invalidateCache with userId removes only that user's entry", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-y", "user", "msg-1", undefined, "user-1");
    await svc.addMessage("conv-y", "user", "msg-2", undefined, "user-2");

    svc.invalidateCache("conv-y", "user-1");

    // user-1 entry gone; user-2 still present
    expect(svc.getStats().activeConversations).toBe(1);

    // user-2 still retrievable without hitting Prisma
    mockMessageFindMany.mockClear();
    const ctxUser2 = await svc.getContext("conv-y", "user-2");
    expect(ctxUser2).not.toBeNull();
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  test("invalidateCache without userId removes all entries for that conversationId", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-z", "user", "msg-u1", undefined, "user-1");
    await svc.addMessage("conv-z", "user", "msg-u2", undefined, "user-2");

    svc.invalidateCache("conv-z"); // no userId — removes all matching

    expect(svc.getStats().activeConversations).toBe(0);
  });
});

// ===========================================================================
// H.  updateMetadata
// ===========================================================================

describe("ConversationMemoryService – updateMetadata", () => {
  test("updateMetadata merges new fields into existing metadata", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-meta", "user", "Hello", undefined, "u1");
    await svc.updateMetadata(
      "conv-meta",
      { lastIntent: "summarize", lastDocumentIds: ["doc-1"] },
      "u1",
    );

    const ctx = await svc.getContext("conv-meta", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.metadata.lastIntent).toBe("summarize");
    expect(ctx!.metadata.lastDocumentIds).toEqual(["doc-1"]);
  });

  test("updateMetadata preserves prior metadata fields not mentioned in the update", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-meta2", "user", "Hi", undefined, "u1");
    await svc.updateMetadata(
      "conv-meta2",
      { lastIntent: "first_intent", lastDocumentIds: ["doc-a"] },
      "u1",
    );
    await svc.updateMetadata(
      "conv-meta2",
      { lastIntent: "second_intent" }, // only update intent, not docIds
      "u1",
    );

    const ctx = await svc.getContext("conv-meta2", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.metadata.lastIntent).toBe("second_intent");
    expect(ctx!.metadata.lastDocumentIds).toEqual(["doc-a"]);
  });

  test("updateMetadata is a no-op when no context exists for the conversationId", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]); // empty DB

    // Should not throw
    await expect(
      svc.updateMetadata("conv-no-exist", { lastIntent: "x" }, "u1"),
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// I.  clearContext
// ===========================================================================

describe("ConversationMemoryService – clearContext", () => {
  test("clearContext removes the entry from cache", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-clear", "user", "Hi", undefined, "u1");
    expect(svc.getStats().activeConversations).toBe(1);

    svc.clearContext("conv-clear", "u1");
    expect(svc.getStats().activeConversations).toBe(0);
  });

  test("clearContext causes getContext to fall back to DB", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    // addMessage internally calls getContext (1 DB call for cold start),
    // then writes into cache.
    await svc.addMessage("conv-clear2", "user", "Hi", undefined, "u1");

    // Evict the cached entry
    svc.clearContext("conv-clear2", "u1");

    // Reset the call counter so we can count only post-eviction calls
    mockMessageFindMany.mockClear();

    // DB returns empty — context should be null
    const ctx = await svc.getContext("conv-clear2", "u1");
    expect(ctx).toBeNull();
    // Exactly one DB call should have been made after the cache was cleared
    expect(mockMessageFindMany).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// J.  maxMessages enforcement
// ===========================================================================

describe("ConversationMemoryService – maxMessages enforcement", () => {
  test("messages array is trimmed to maxMessages when it overflows", async () => {
    const MAX_MSG = 3;
    const svc = buildService({
      inMemoryMessageCacheLimit: MAX_MSG,
      inMemoryConversationCacheLimit: 100,
    });
    mockMessageFindMany.mockResolvedValue([]);

    // Add one more than the limit
    for (let i = 0; i < MAX_MSG + 2; i++) {
      await svc.addMessage(`conv-maxmsg`, "user", `msg-${i}`, undefined, "u1");
    }

    const ctx = await svc.getContext("conv-maxmsg", "u1");
    expect(ctx).not.toBeNull();
    expect(ctx!.messages.length).toBeLessThanOrEqual(MAX_MSG);
  });

  test("the most recent messages are retained when overflow is trimmed", async () => {
    const MAX_MSG = 2;
    const svc = buildService({
      inMemoryMessageCacheLimit: MAX_MSG,
      inMemoryConversationCacheLimit: 100,
    });
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("conv-trim", "user", "first", undefined, "u1");
    await svc.addMessage("conv-trim", "user", "second", undefined, "u1");
    await svc.addMessage("conv-trim", "user", "third", undefined, "u1");

    const ctx = await svc.getContext("conv-trim", "u1");
    expect(ctx).not.toBeNull();
    // Should keep 'second' and 'third' (the most recent MAX_MSG messages)
    const contents = ctx!.messages.map((m) => m.content);
    expect(contents).toContain("third");
    expect(contents).toContain("second");
    expect(contents).not.toContain("first");
  });
});

// ===========================================================================
// K.  getStats reflects live state
// ===========================================================================

describe("ConversationMemoryService – getStats", () => {
  test("activeConversations starts at 0", () => {
    const svc = buildService();
    expect(svc.getStats().activeConversations).toBe(0);
  });

  test("activeConversations increments after each distinct conversation is added", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("c1", "user", "hi", undefined, "u1");
    expect(svc.getStats().activeConversations).toBe(1);

    await svc.addMessage("c2", "user", "hi", undefined, "u1");
    expect(svc.getStats().activeConversations).toBe(2);
  });

  test("activeConversations decrements after invalidateCache removes entries", async () => {
    const svc = buildService();
    mockMessageFindMany.mockResolvedValue([]);

    await svc.addMessage("c-inv1", "user", "hi", undefined, "u1");
    await svc.addMessage("c-inv2", "user", "hi", undefined, "u1");
    expect(svc.getStats().activeConversations).toBe(2);

    svc.invalidateCache("c-inv1", "u1");
    expect(svc.getStats().activeConversations).toBe(1);
  });
});
