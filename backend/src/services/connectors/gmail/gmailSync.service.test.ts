import { describe, expect, jest, test } from "@jest/globals";

jest.mock("../tokenVault.service", () => ({
  TokenVaultService: class MockTokenVaultService {},
}));

jest.mock("./gmailOAuth.service", () => ({
  GmailOAuthService: class MockGmailOAuthService {},
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

import { GmailSyncService } from "./gmailSync.service";

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeService(ingestResult: any[]) {
  const gmailClient = {
    getProfile: jest.fn().mockResolvedValue({
      historyId: "new-history-id",
      emailAddress: "user@example.com",
    }),
    listHistory: jest.fn().mockResolvedValue({
      history: [{ messagesAdded: [{ message: { id: "msg-1" } }] }],
      nextPageToken: undefined,
    }),
    getMessage: jest.fn().mockResolvedValue({
      id: "msg-1",
      payload: {
        headers: [
          { name: "Subject", value: "Subject A" },
          { name: "From", value: "sender@example.com" },
          { name: "Date", value: "Mon, 01 Jan 2026 12:00:00 +0000" },
        ],
        body: { data: toBase64Url("Hello world") },
      },
      labelIds: ["INBOX"],
      threadId: "thread-1",
      historyId: "history-msg-1",
      snippet: "snippet",
    }),
  };

  const tokenVault = {
    getValidAccessToken: jest.fn().mockResolvedValue("token-1"),
  };

  const ingestion = {
    ingestDocuments: jest.fn().mockResolvedValue(ingestResult),
  };

  const service = new GmailSyncService(
    gmailClient as any,
    tokenVault as any,
    ingestion as any,
  );

  return { service };
}

describe("GmailSyncService cursor advancement", () => {
  test("does not advance historyId when ingestion has failures", async () => {
    const { service } = makeService([
      { sourceId: "msg-1", status: "failed", error: "boom" },
    ]);
    jest.spyOn(service as any, "readCursorFile").mockResolvedValue({
      version: 1,
      userId: "user-1",
      providers: {
        gmail: { historyId: "old-history-id", lastSyncAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursorFile")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(1);
    expect(result.ingestedCount).toBe(0);
    expect(result.historyId).toBe("old-history-id");
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          gmail: expect.objectContaining({
            historyId: "old-history-id",
          }),
        }),
      }),
    );
  });

  test("advances historyId when ingestion has no failures", async () => {
    const { service } = makeService([
      { sourceId: "msg-1", documentId: "doc-1", status: "created" },
    ]);
    jest.spyOn(service as any, "readCursorFile").mockResolvedValue({
      version: 1,
      userId: "user-1",
      providers: {
        gmail: { historyId: "old-history-id", lastSyncAt: "2026-01-01T00:00:00.000Z" },
      },
    });
    const writeSpy = jest
      .spyOn(service as any, "writeCursorFile")
      .mockResolvedValue(undefined);

    const result = await service.sync({ userId: "user-1" });

    expect(result.failedCount).toBe(0);
    expect(result.ingestedCount).toBe(1);
    expect(result.historyId).toBe("new-history-id");
    expect(writeSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        providers: expect.objectContaining({
          gmail: expect.objectContaining({
            historyId: "new-history-id",
          }),
        }),
      }),
    );
  });
});
