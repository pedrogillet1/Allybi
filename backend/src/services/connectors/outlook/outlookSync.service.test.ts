import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../tokenVault.service", () => ({
  TokenVaultService: class MockTokenVaultService {},
}));

jest.mock("./outlookOAuth.service", () => ({
  OutlookOAuthService: class MockOutlookOAuthService {},
}));

jest.mock("../connectorsIngestion.service", () => ({
  ConnectorsIngestionService: class MockConnectorsIngestionService {},
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { OutlookSyncService } from "./outlookSync.service";

function makeService(ingestResult: any[]) {
  const graphClient = {
    listMailFolders: jest.fn().mockResolvedValue([
      { id: "folder-1", displayName: "Inbox", totalItemCount: 1 },
    ]),
    listAllMessages: jest.fn().mockResolvedValue([
      {
        id: "msg-1",
        subject: "Outlook Subject",
        receivedDateTime: "2026-02-01T00:00:00.000Z",
        sentDateTime: "2026-02-01T00:00:00.000Z",
        from: { emailAddress: { address: "sender@example.com" } },
        categories: [],
      },
    ]),
    getMessageText: jest.fn().mockReturnValue("hello from outlook"),
  };

  const tokenVault = {
    getValidAccessToken: jest.fn().mockResolvedValue("token-1"),
  };

  const ingestion = {
    ingestDocuments: jest.fn().mockResolvedValue(ingestResult),
  };

  const service = new OutlookSyncService(
    graphClient as any,
    tokenVault as any,
    ingestion as any,
  );

  return { service };
}

describe("OutlookSyncService folder cursor advancement", () => {
  test("does not advance folder high-water mark when ingestion fails", async () => {
    const { service } = makeService([
      { sourceId: "msg-1", status: "failed", error: "boom" },
    ]);
    jest.spyOn(service as any, "readCursorFile").mockResolvedValue({
      version: 1,
      userId: "user-1",
      providers: {
        outlook: {
          lastSyncAt: "2026-01-01T00:00:00.000Z",
          folders: {
            "folder-1": { lastReceivedDateTime: "2026-01-15T00:00:00.000Z" },
          },
        },
      },
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursorFile")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(1);
    expect(result.ingestedCount).toBe(0);
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          outlook: expect.objectContaining({
            folders: expect.objectContaining({
              "folder-1": expect.objectContaining({
                lastReceivedDateTime: "2026-01-15T00:00:00.000Z",
              }),
            }),
          }),
        }),
      }),
    );
  });

  test("advances folder high-water mark when ingestion succeeds", async () => {
    const { service } = makeService([
      { sourceId: "msg-1", documentId: "doc-1", status: "created" },
    ]);
    jest.spyOn(service as any, "readCursorFile").mockResolvedValue({
      version: 1,
      userId: "user-1",
      providers: {
        outlook: {
          lastSyncAt: "2026-01-01T00:00:00.000Z",
          folders: {
            "folder-1": { lastReceivedDateTime: "2026-01-15T00:00:00.000Z" },
          },
        },
      },
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursorFile")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(0);
    expect(result.ingestedCount).toBe(1);
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          outlook: expect.objectContaining({
            folders: expect.objectContaining({
              "folder-1": expect.objectContaining({
                lastReceivedDateTime: "2026-02-01T00:00:00.000Z",
              }),
            }),
          }),
        }),
      }),
    );
  });
});
