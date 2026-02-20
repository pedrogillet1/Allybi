import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const findManyMock = jest.fn();
let runtimeTuning: Record<string, unknown> = {};

jest.mock("../../config/database", () => ({
  __esModule: true,
  default: {
    message: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

jest.mock("../core/banks/bankLoader.service", () => ({
  getBankLoaderInstance: () => ({
    getBank: (bankId: string) => {
      if (bankId !== "memory_policy") {
        throw new Error(`unexpected bank lookup: ${bankId}`);
      }
      return {
        config: {
          runtimeTuning,
        },
      };
    },
  }),
}));

import { ConversationMemoryService } from "./conversationMemory.service";

describe("ConversationMemoryService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([]);
    runtimeTuning = {
      inMemoryMessageCacheLimit: 3,
      inMemoryConversationCacheLimit: 2,
      inMemoryCacheTtlSeconds: 1,
    };
  });

  it("isolates cache entries per user for the same conversation id", async () => {
    const service = new ConversationMemoryService();
    await service.addMessage("conv-1", "user", "hello from user-1", {}, "user-1");
    await service.addMessage("conv-1", "user", "hello from user-2", {}, "user-2");

    const first = await service.getContext("conv-1", "user-1");
    const second = await service.getContext("conv-1", "user-2");

    expect(first?.messages).toHaveLength(1);
    expect(second?.messages).toHaveLength(1);
    expect(first?.messages[0]?.content).toBe("hello from user-1");
    expect(second?.messages[0]?.content).toBe("hello from user-2");
  });

  it("expires cache entries after the configured ttl", async () => {
    const service = new ConversationMemoryService();
    await service.addMessage("conv-ttl", "assistant", "cached", {}, "user-ttl");
    expect((await service.getContext("conv-ttl", "user-ttl"))?.messages).toHaveLength(1);

    jest.advanceTimersByTime(1500);

    expect(await service.getContext("conv-ttl", "user-ttl")).toBeNull();
  });

  it("evicts oldest conversation cache entry when max conversation size is reached", async () => {
    const service = new ConversationMemoryService();

    await service.addMessage("conv-a", "user", "A", {}, "user-1");
    jest.advanceTimersByTime(10);
    await service.addMessage("conv-b", "user", "B", {}, "user-1");
    jest.advanceTimersByTime(10);
    await service.addMessage("conv-c", "user", "C", {}, "user-1");

    const stats = service.getStats();
    expect(stats.activeConversations).toBe(2);
    expect(await service.getContext("conv-a", "user-1")).toBeNull();
    expect((await service.getContext("conv-b", "user-1"))?.messages[0]?.content).toBe(
      "B",
    );
    expect((await service.getContext("conv-c", "user-1"))?.messages[0]?.content).toBe(
      "C",
    );
  });
});
