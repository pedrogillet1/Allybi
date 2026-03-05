import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockConversationFindMany = jest.fn();
const mockConversationFindFirst = jest.fn();

jest.mock("../config/database", () => ({
  __esModule: true,
  default: {
    conversation: {
      findMany: (...args: any[]) => mockConversationFindMany(...args),
      findFirst: (...args: any[]) => mockConversationFindFirst(...args),
    },
  },
}));

import { PrismaHistoryService } from "./prismaHistory.service";

function decodeCursor(cursor: string): { id: string; updatedAt: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

describe("PrismaHistoryService listConversations", () => {
  beforeEach(() => {
    mockConversationFindMany.mockReset();
    mockConversationFindFirst.mockReset();
  });

  test("returns stable composite cursor and deterministic order", async () => {
    mockConversationFindMany.mockResolvedValue([
      {
        id: "c-3",
        title: "Three",
        updatedAt: new Date("2026-03-05T12:00:00.000Z"),
        createdAt: new Date("2026-03-05T10:00:00.000Z"),
        isPinned: false,
        isDeleted: false,
        _count: { messages: 1 },
        messages: [{ content: "hello" }],
      },
      {
        id: "c-2",
        title: "Two",
        updatedAt: new Date("2026-03-05T11:00:00.000Z"),
        createdAt: new Date("2026-03-05T09:00:00.000Z"),
        isPinned: true,
        isDeleted: false,
        _count: { messages: 2 },
        messages: [{ content: "world" }],
      },
      {
        id: "c-1",
        title: "One",
        updatedAt: new Date("2026-03-05T10:00:00.000Z"),
        createdAt: new Date("2026-03-05T08:00:00.000Z"),
        isPinned: false,
        isDeleted: false,
        _count: { messages: 3 },
        messages: [{ content: "!" }],
      },
    ]);

    const svc = new PrismaHistoryService();
    const result = await svc.listConversations({ userId: "u-1", limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeTruthy();
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      id: "c-2",
      updatedAt: "2026-03-05T11:00:00.000Z",
    });

    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  test("supports legacy id-only cursor by resolving anchor", async () => {
    mockConversationFindFirst.mockResolvedValue({
      id: "c-anchor",
      updatedAt: new Date("2026-03-05T11:00:00.000Z"),
    });
    mockConversationFindMany.mockResolvedValue([]);

    const svc = new PrismaHistoryService();
    await svc.listConversations({
      userId: "u-1",
      limit: 2,
      cursor: "c-anchor",
    });

    expect(mockConversationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u-1",
          id: "c-anchor",
        }),
      }),
    );
    expect(mockConversationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.any(Array),
            }),
          ]),
        }),
      }),
    );
  });
});

