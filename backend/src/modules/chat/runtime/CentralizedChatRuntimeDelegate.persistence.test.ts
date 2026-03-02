import "reflect-metadata";
import path from "path";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

jest.mock("../../../services/core/retrieval/evidenceGate.service", () => ({
  EvidenceGateService: class {
    checkEvidence() {
      return {
        hasEvidence: true,
        evidenceStrength: "strong",
        suggestedAction: "answer",
        missingEvidence: [],
        foundEvidence: [],
      };
    }
  },
}));

jest.mock("../../../platform/db/prismaClient", () => ({
  __esModule: true,
  default: {
    conversation: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { CentralizedChatRuntimeDelegate } from "./CentralizedChatRuntimeDelegate";
import type { ChatEngine } from "../domain/chat.contracts";
import prisma from "../../../platform/db/prismaClient";
import { initializeBanks } from "../../../services/core/banks/bankLoader.service";
import { logger } from "../../../utils/logger";

function makeDelegate(): CentralizedChatRuntimeDelegate {
  const engine: ChatEngine = {
    async generate() {
      return { text: "unused" };
    },
    async stream() {
      return { finalText: "unused" };
    },
  } as unknown as ChatEngine;
  return new CentralizedChatRuntimeDelegate(engine, {
    conversationMemory: {} as any,
  });
}

describe("CentralizedChatRuntimeDelegate.createMessage", () => {
  const prismaMock = prisma as any;

  beforeAll(async () => {
    await initializeBanks({
      rootDir: path.resolve(process.cwd(), "src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          message: {
            create: prismaMock.message.create,
            update: prismaMock.message.update,
          },
          conversation: {
            update: prismaMock.conversation.update,
          },
        }),
    );
  });

  test("throws when conversation is not owned by user", async () => {
    prismaMock.conversation.findFirst.mockResolvedValueOnce(null);
    const delegate = makeDelegate();

    await expect(
      delegate.createMessage({
        conversationId: "conv-1",
        role: "user",
        content: "hello",
        userId: "user-1",
      }),
    ).rejects.toThrow("Conversation not found for this account.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test("uses a transaction for unencrypted message + conversation write", async () => {
    prismaMock.conversation.findFirst
      .mockResolvedValueOnce({ id: "conv-1" })
      .mockResolvedValueOnce({ title: "Existing title" });
    prismaMock.message.create.mockResolvedValue({
      id: "msg-1",
      role: "user",
      content: "hello",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      metadata: null,
    });
    prismaMock.conversation.update.mockResolvedValue({ id: "conv-1" });

    const delegate = makeDelegate();
    const result = await delegate.createMessage({
      conversationId: "conv-1",
      role: "user",
      content: "hello",
      userId: "user-1",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.conversation.update).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("msg-1");
    expect(result.content).toBe("hello");
  });

  test("logs warning when resolved doc scope persistence fails (chat)", async () => {
    const delegate = Object.create(CentralizedChatRuntimeDelegate.prototype) as any;
    prismaMock.conversation.update.mockRejectedValueOnce(new Error("db write failed"));
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await delegate.persistResolvedDocScope({
      traceId: "trace-1",
      conversationId: "conv-1",
      previousDocId: null,
      resolvedDocId: "doc-1",
      stream: false,
    });

    expect(prismaMock.conversation.update).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[chat-runtime] failed to persist lastDocumentId",
      expect.objectContaining({
        traceId: "trace-1",
        conversationId: "conv-1",
        lastDocumentId: "doc-1",
      }),
    );
    warnSpy.mockRestore();
  });

  test("logs warning when resolved doc scope persistence fails (stream)", async () => {
    const delegate = Object.create(CentralizedChatRuntimeDelegate.prototype) as any;
    prismaMock.conversation.update.mockRejectedValueOnce(new Error("db write failed"));
    const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});

    await delegate.persistResolvedDocScope({
      traceId: "trace-2",
      conversationId: "conv-2",
      previousDocId: null,
      resolvedDocId: "doc-2",
      stream: true,
    });

    expect(prismaMock.conversation.update).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[chat-runtime] failed to persist stream lastDocumentId",
      expect.objectContaining({
        traceId: "trace-2",
        conversationId: "conv-2",
        lastDocumentId: "doc-2",
      }),
    );
    warnSpy.mockRestore();
  });
});
