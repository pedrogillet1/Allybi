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

describe("EncryptedChatRepo saveMessage", () => {
  function buildMocks(overrides?: {
    encryptMessage?: (...args: unknown[]) => string;
    createResult?: Record<string, unknown>;
  }) {
    const prisma = {
      message: {
        create: jest.fn().mockResolvedValue(
          overrides?.createResult ?? { id: "generated-uuid", role: "user" },
        ),
      },
    };
    const convoKeys = {
      getConversationKey: jest.fn().mockResolvedValue("ck-abc"),
    };
    const chatCrypto = {
      encryptMessage: overrides?.encryptMessage
        ? jest.fn().mockImplementation(overrides.encryptMessage)
        : jest.fn().mockReturnValue("cipher-text-123"),
    };
    const repo = new EncryptedChatRepo(
      prisma as any,
      convoKeys as any,
      chatCrypto as any,
    );
    return { prisma, convoKeys, chatCrypto, repo };
  }

  test("happy path: creates with encrypted content and returns { id, role }", async () => {
    const { prisma, convoKeys, chatCrypto, repo } = buildMocks({
      createResult: { id: "msg-1", role: "user" },
    });

    const result = await repo.saveMessage("u1", "conv-1", "user", "hello world");

    expect(convoKeys.getConversationKey).toHaveBeenCalledWith("u1", "conv-1");
    expect(chatCrypto.encryptMessage).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledTimes(1);

    const createCall = prisma.message.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      conversationId: "conv-1",
      role: "user",
      contentEncrypted: "cipher-text-123",
    });
    expect(createCall.select).toEqual({ id: true, role: true });

    expect(result).toEqual({ id: "msg-1", role: "user" });
  });

  test("content field is null in the DB row", async () => {
    const { prisma, repo } = buildMocks();

    await repo.saveMessage("u1", "conv-1", "assistant", "some answer");

    const createCall = prisma.message.create.mock.calls[0][0];
    expect(createCall.data.content).toBeNull();
  });

  test("single DB operation: prisma.message.create called exactly once, no update", async () => {
    const { prisma, repo } = buildMocks();

    await repo.saveMessage("u1", "conv-1", "user", "test");

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    // The mock has no `update` method — if the implementation tried to call it,
    // it would throw "prisma.message.update is not a function".
    expect(prisma.message.update).toBeUndefined();
  });

  test("encryption error does not leave an orphaned DB row", async () => {
    const { prisma, repo } = buildMocks({
      encryptMessage: () => {
        throw new Error("encryption failed");
      },
    });

    await expect(
      repo.saveMessage("u1", "conv-1", "user", "secret"),
    ).rejects.toThrow("encryption failed");

    // Because encryption happens BEFORE prisma.message.create,
    // the DB insert should never have been called.
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("EncryptedChatRepo saveMessageWithMetadata", () => {
  test("writes message + metadata + conversation updatedAt in one transaction", async () => {
    const prisma = {
      $transaction: jest.fn(),
      message: {
        create: jest.fn().mockResolvedValue({ id: "msg-atomic-1", role: "user" }),
      },
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
    );
    const repo = new EncryptedChatRepo(
      prisma as any,
      {
        getConversationKey: jest.fn().mockResolvedValue("ck"),
      } as any,
      {
        encryptMessage: jest.fn().mockReturnValue("cipher-atomic"),
      } as any,
    );

    const out = await repo.saveMessageWithMetadata({
      userId: "u1",
      conversationId: "conv-1",
      role: "user",
      plaintext: "hello",
      metadataJson: JSON.stringify({ foo: "bar" }),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "conv-1",
          userId: "u1",
          isDeleted: false,
        }),
      }),
    );
    expect(out).toEqual({ id: "msg-atomic-1", role: "user" });
  });

  test("throws when conversation update affects zero rows", async () => {
    const prisma = {
      $transaction: jest.fn(),
      message: {
        create: jest.fn().mockResolvedValue({ id: "msg-atomic-2", role: "assistant" }),
      },
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
    );
    const repo = new EncryptedChatRepo(
      prisma as any,
      {
        getConversationKey: jest.fn().mockResolvedValue("ck"),
      } as any,
      {
        encryptMessage: jest.fn().mockReturnValue("cipher-atomic"),
      } as any,
    );

    await expect(
      repo.saveMessageWithMetadata({
        userId: "u1",
        conversationId: "conv-1",
        role: "assistant",
        plaintext: "hello",
      }),
    ).rejects.toThrow("Conversation not found for this account.");
  });
});
