import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../tokenVault.service", () => ({
  TokenVaultService: class MockTokenVaultService {},
}));

jest.mock("../connectorsIngestion.service", () => ({
  ConnectorsIngestionService: class MockConnectorsIngestionService {},
}));

import { SlackSyncService } from "./slackSync.service";

function makeService(ingestResult: any[]) {
  const tokenVault = {
    getValidAccessToken: jest.fn().mockResolvedValue("token-1"),
  };

  const slackClient = {
    listConversations: jest.fn().mockResolvedValue({
      channels: [{ id: "C1", name: "general", is_member: true }],
      nextCursor: undefined,
    }),
    getConversationHistory: jest.fn().mockResolvedValue({
      messages: [{ ts: "1710000001.000100", user: "U1", text: "hi" }],
      nextCursor: undefined,
    }),
    extractMessageText: jest.fn().mockReturnValue("hi"),
  };

  const ingestion = {
    ingestDocuments: jest.fn().mockResolvedValue(ingestResult),
  };

  const service = new SlackSyncService({
    tokenVault: tokenVault as any,
    slackClient: slackClient as any,
    ingestion: ingestion as any,
  });

  return { service };
}

describe("SlackSyncService cursor advancement", () => {
  test("does not advance lastMessageTs when ingestion fails", async () => {
    const { service } = makeService([
      { sourceId: "C1:1710000001.000100", status: "failed", error: "boom" },
    ]);
    jest.spyOn(service as any, "readCursor").mockResolvedValue({
      userId: "user-1",
      lastSyncAt: "2026-01-01T00:00:00.000Z",
      lastMessageTs: "1710000000.000100",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursor")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(1);
    expect(result.ingestedCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        lastMessageTs: "1710000000.000100",
      }),
    );
  });

  test("advances lastMessageTs when ingestion succeeds", async () => {
    const { service } = makeService([
      {
        sourceId: "C1:1710000001.000100",
        documentId: "doc-1",
        status: "created",
      },
    ]);
    jest.spyOn(service as any, "readCursor").mockResolvedValue({
      userId: "user-1",
      lastSyncAt: "2026-01-01T00:00:00.000Z",
      lastMessageTs: "1710000000.000100",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursor")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(0);
    expect(result.ingestedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        lastMessageTs: "1710000001.000100",
      }),
    );
  });

  test("tracks updatedCount for reconciled Slack messages", async () => {
    const { service } = makeService([
      {
        sourceId: "C1:1710000001.000100",
        documentId: "doc-1",
        status: "updated",
      },
    ]);
    jest.spyOn(service as any, "readCursor").mockResolvedValue({
      userId: "user-1",
      lastSyncAt: "2026-01-01T00:00:00.000Z",
      lastMessageTs: "1710000000.000100",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    jest
      .spyOn(service as any, "writeCursor")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.ingestedCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(result.existingCount).toBe(0);
    expect(result.updatedCount).toBe(1);
  });
});
