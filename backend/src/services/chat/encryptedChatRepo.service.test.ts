import { describe, expect, test, jest } from "@jest/globals";
import { EncryptedChatRepo } from "./encryptedChatRepo.service";

describe("EncryptedChatRepo listMessagesDecrypted", () => {
  test("uses descending query and restores chronological order for latest window", async () => {
    const prisma = {
      message: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "m3",
            role: "assistant",
            contentEncrypted: "enc-3",
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
            metadata: null,
          },
          {
            id: "m2",
            role: "user",
            contentEncrypted: "enc-2",
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            metadata: null,
          },
        ]),
      },
    };
    const repo = new EncryptedChatRepo(
      prisma as any,
      {
        getConversationKey: jest.fn().mockResolvedValue("ck"),
      } as any,
      {
        decryptMessage: jest
          .fn()
          .mockImplementation(
            (
              _userId: string,
              _conversationId: string,
              messageId: string,
              _role: string,
              encrypted: string,
            ) => `${messageId}:${encrypted}`,
          ),
      } as any,
    );

    const rows = await repo.listMessagesDecrypted("user-1", "conv-1", 2, true);

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: "conv-1" },
        orderBy: { createdAt: "desc" },
        take: 2,
      }),
    );
    expect(rows.map((row) => row.id)).toEqual(["m2", "m3"]);
    expect(rows.map((row) => row.content)).toEqual(["m2:enc-2", "m3:enc-3"]);
  });
});
