import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { ConversationKeyService } from "./conversationKey.service";

const CONV_ID = "conv-001";
const USER_ID = "user-001";

function buildMocks() {
  const prisma = {
    conversation: {
      findUnique: jest.fn<any>(),
      updateMany: jest.fn<any>(),
    },
  };
  const enc = {
    randomKey32: jest.fn<any>().mockReturnValue(Buffer.alloc(32, 0x42)),
  };
  const tenantKeys = {
    getTenantKey: jest
      .fn<any>()
      .mockResolvedValue(Buffer.alloc(32, 0xaa)),
  };
  const envelopes = {
    wrapRecordKey: jest.fn<any>().mockReturnValue("wrapped-json"),
    unwrapRecordKey: jest
      .fn<any>()
      .mockReturnValue(Buffer.alloc(32, 0x42)),
  };

  const service = new ConversationKeyService(
    prisma as any,
    enc as any,
    tenantKeys as any,
    envelopes as any,
  );

  return { prisma, enc, tenantKeys, envelopes, service };
}

describe("ConversationKeyService", () => {
  test("happy path — first key generation", async () => {
    const { prisma, enc, envelopes, service } = buildMocks();

    prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userId: USER_ID,
      dataKeyEncrypted: null,
      dataKeyMeta: null,
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

    const key = await service.getConversationKey(USER_ID, CONV_ID);

    expect(enc.randomKey32).toHaveBeenCalled();
    expect(envelopes.wrapRecordKey).toHaveBeenCalledWith(
      Buffer.alloc(32, 0x42),
      Buffer.alloc(32, 0xaa),
      `wrap:conversation:${CONV_ID}`,
    );
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: CONV_ID, dataKeyEncrypted: null },
      data: { dataKeyEncrypted: "wrapped-json", dataKeyMeta: { v: 1 } },
    });
    expect(key).toEqual(Buffer.alloc(32, 0x42));
  });

  test("unwrap existing key", async () => {
    const { prisma, enc, envelopes, service } = buildMocks();

    prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userId: USER_ID,
      dataKeyEncrypted: "existing-wrapped",
      dataKeyMeta: { v: 1 },
    });

    const key = await service.getConversationKey(USER_ID, CONV_ID);

    expect(enc.randomKey32).not.toHaveBeenCalled();
    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
    expect(envelopes.unwrapRecordKey).toHaveBeenCalledWith(
      "existing-wrapped",
      Buffer.alloc(32, 0xaa),
      `wrap:conversation:${CONV_ID}`,
    );
    expect(key).toEqual(Buffer.alloc(32, 0x42));
  });

  test("race condition — concurrent calls return same key", async () => {
    const { prisma, envelopes, service } = buildMocks();

    // First findUnique: no key yet
    prisma.conversation.findUnique.mockResolvedValueOnce({
      id: CONV_ID,
      userId: USER_ID,
      dataKeyEncrypted: null,
      dataKeyMeta: null,
    });

    // updateMany returns count 0 — we lost the race
    prisma.conversation.updateMany.mockResolvedValue({ count: 0 });

    // Re-read returns the winner's key
    prisma.conversation.findUnique.mockResolvedValueOnce({
      dataKeyEncrypted: "winner-wrapped-key",
    });

    const winnerKey = Buffer.alloc(32, 0xbb);
    envelopes.unwrapRecordKey.mockReturnValue(winnerKey);

    const key = await service.getConversationKey(USER_ID, CONV_ID);

    expect(prisma.conversation.findUnique).toHaveBeenCalledTimes(2);
    expect(envelopes.unwrapRecordKey).toHaveBeenCalledWith(
      "winner-wrapped-key",
      Buffer.alloc(32, 0xaa),
      `wrap:conversation:${CONV_ID}`,
    );
    expect(key).toEqual(winnerKey);
  });

  test("wrong userId throws 'Conversation not found'", async () => {
    const { prisma, service } = buildMocks();

    prisma.conversation.findUnique.mockResolvedValue({
      id: CONV_ID,
      userId: "other-user",
      dataKeyEncrypted: null,
      dataKeyMeta: null,
    });

    await expect(
      service.getConversationKey(USER_ID, CONV_ID),
    ).rejects.toThrow("Conversation not found");
  });
});
