import { describe, expect, jest, test } from "@jest/globals";
import { ScopeService, type ScopeServiceDependencies } from "./ScopeService";

function makeDeps(
  overrides: Partial<ScopeServiceDependencies["runtimeConfig"]> = {},
) {
  return {
    prismaClient: {
      conversation: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      document: {
        findMany: jest.fn(),
      },
    },
    runtimeConfig: {
      maxScopeDocs: 3,
      clearScopeRegex: [/\bclear scope\b/i],
      docStatusesAllowed: ["ready"],
      ...overrides,
    },
  } as unknown as ScopeServiceDependencies;
}

describe("ScopeService", () => {
  test("normalizes, validates, and preserves requested order when setting scope", async () => {
    const deps = makeDeps();
    (deps.prismaClient.document.findMany as jest.Mock).mockResolvedValue([
      { id: "doc-2" },
      { id: "doc-1" },
    ]);
    (deps.prismaClient.conversation.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    const service = new ScopeService(deps);
    await service.setConversationScope("user-1", "conv-1", [
      "doc-1",
      "doc-2",
      "doc-1",
      "doc-3",
    ]);

    expect(deps.prismaClient.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeDocumentIds: ["doc-1", "doc-2"],
        }),
      }),
    );
  });

  test("reads persisted scope and clamps duplicates", async () => {
    const deps = makeDeps();
    (deps.prismaClient.conversation.findFirst as jest.Mock).mockResolvedValue({
      scopeDocumentIds: ["doc-1", "doc-1", "doc-2", "doc-3"],
    });

    const service = new ScopeService(deps);
    await expect(
      service.getConversationScope("user-1", "conv-1"),
    ).resolves.toEqual(["doc-1", "doc-2", "doc-3"]);
  });
});
