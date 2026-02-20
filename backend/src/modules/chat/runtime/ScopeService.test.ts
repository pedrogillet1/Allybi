import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ScopeService } from "./ScopeService";

const mockConversationFindFirst = jest.fn();
const mockConversationUpdateMany = jest.fn();
const mockGetBank = jest.fn();

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
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

describe("ScopeService", () => {
  beforeEach(() => {
    mockConversationFindFirst.mockReset();
    mockConversationUpdateMany.mockReset();
    mockGetBank.mockReset();
    mockGetBank.mockImplementation((bankId: string) => {
      if (bankId === "memory_policy") {
        return {
          config: {
            runtimeTuning: {
              scopeRuntime: {
                maxScopeDocs: 2,
                clearScopePatterns: [
                  "\\b(clear|reset|remove)\\s+(scope|context|attachments?)\\b",
                  "\\b(use|search)\\s+(all|entire)\\s+(documents?|library)\\b",
                ],
              },
            },
          },
        };
      }
      return null;
    });
  });

  it("normalizes conversation scope and applies max doc cap", async () => {
    mockConversationFindFirst.mockResolvedValue({
      scopeDocumentIds: ["doc-1", "doc-1", " doc-2 ", "doc-3"],
    });
    const scope = await new ScopeService().getConversationScope("u1", "c1");
    expect(scope).toEqual(["doc-1", "doc-2"]);
  });

  it("persists normalized attached scope", async () => {
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });
    const service = new ScopeService();
    await service.setConversationScope("u1", "c1", ["doc-1", "doc-1", "doc-2"]);
    expect(mockConversationUpdateMany).toHaveBeenCalledTimes(1);
    const payload = mockConversationUpdateMany.mock.calls[0][0] as any;
    expect(payload.data.scopeDocumentIds).toEqual(["doc-1", "doc-2"]);
  });

  it("detects clear-scope requests via metadata and text", () => {
    const service = new ScopeService();
    expect(
      service.shouldClearScope({
        userId: "u1",
        message: "anything",
        meta: { clearScope: true } as any,
      } as any),
    ).toBe(true);
    expect(
      service.shouldClearScope({
        userId: "u1",
        message: "please clear scope",
      } as any),
    ).toBe(true);
    expect(
      service.shouldClearScope({
        userId: "u1",
        message: "summarize this document",
      } as any),
    ).toBe(false);
  });

  it("normalizes attached scope from request", () => {
    const service = new ScopeService();
    expect(
      service.attachedScope({
        userId: "u1",
        message: "m",
        attachedDocumentIds: ["doc-1", "doc-1", "doc-2", "doc-3"],
      } as any),
    ).toEqual(["doc-1", "doc-2"]);
  });

  it("clears persisted scope", async () => {
    mockConversationUpdateMany.mockResolvedValue({ count: 1 });
    const service = new ScopeService();
    await service.clearConversationScope("u1", "c1");
    const payload = mockConversationUpdateMany.mock.calls[0][0] as any;
    expect(payload.data.scopeDocumentIds).toEqual([]);
  });

  it("returns empty scope when stored scope is not an array", async () => {
    mockConversationFindFirst.mockResolvedValue({ scopeDocumentIds: null });
    const service = new ScopeService();
    await expect(service.getConversationScope("u1", "c1")).resolves.toEqual([]);
  });

  it("throws when scopeRuntime config is missing", () => {
    mockGetBank.mockImplementation(() => ({}));
    expect(() => new ScopeService()).toThrow(
      "memory_policy.config.runtimeTuning.scopeRuntime is required",
    );
  });

  it("throws when maxScopeDocs is invalid", () => {
    mockGetBank.mockImplementation(() => ({
      config: {
        runtimeTuning: {
          scopeRuntime: {
            maxScopeDocs: 0,
            clearScopePatterns: ["clear scope"],
          },
        },
      },
    }));
    expect(() => new ScopeService()).toThrow(
      "memory_policy.config.runtimeTuning.scopeRuntime.maxScopeDocs is required",
    );
  });

  it("throws when clearScopePatterns contains invalid regex", () => {
    mockGetBank.mockImplementation(() => ({
      config: {
        runtimeTuning: {
          scopeRuntime: {
            maxScopeDocs: 2,
            clearScopePatterns: ["("],
          },
        },
      },
    }));
    expect(() => new ScopeService()).toThrow(
      "Invalid clear scope regex in memory_policy scopeRuntime: (",
    );
  });
});
