import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../../../config/database", () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock("../../../config/storage", () => ({
  __esModule: true,
  downloadFile: jest.fn(),
}));

import prisma from "../../../config/database";
import { downloadFile } from "../../../config/storage";
import {
  ConnectorHandlerService,
  type ConnectorHandlerContext,
} from "./connectorHandler.service";
import { registerConnector } from "../../connectors/connectorsRegistry";

const mockFindMany = (prisma as any).document.findMany as jest.MockedFunction<any>;
const mockCount = (prisma as any).document.count as jest.MockedFunction<any>;
const mockDownloadFile = downloadFile as jest.MockedFunction<typeof downloadFile>;

function ctx(): ConnectorHandlerContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    correlationId: "corr-1",
    clientMessageId: "msg-1",
  };
}

describe("ConnectorHandlerService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(0);
  });

  test("hydrates send attachments from attachmentDocumentIds", async () => {
    const sendMessage = jest.fn(async () => ({ id: "gmail-sent-1" }));
    registerConnector("gmail", {
      capabilities: {
        oauth: true,
        sync: true,
        search: true,
        send: true,
        realtime: false,
      },
      oauthService: {},
      clientService: { sendMessage },
    });

    mockFindMany.mockResolvedValue([
      {
        id: "doc-1",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        encryptedFilename: "users/user-1/files/doc-1/invoice.pdf",
      },
    ]);
    mockDownloadFile.mockResolvedValue(Buffer.from("pdf-bytes"));

    const tokenVault = {
      ensureConnectedAccess: jest.fn(async () => ({
        connected: true,
        accessToken: "tok-gmail",
        info: { scopes: ["https://www.googleapis.com/auth/gmail.send"] },
      })),
    };

    const handler = new ConnectorHandlerService({ tokenVault: tokenVault as any });

    const result = await handler.execute({
      action: "send",
      provider: "gmail",
      context: ctx(),
      to: "person@example.com",
      subject: "Hi",
      body: "Body",
      attachmentDocumentIds: ["doc-1"],
    });

    expect(result.ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const call = sendMessage.mock.calls[0];
    expect(call[0]).toBe("tok-gmail");
    expect(call[1]).toEqual(
      expect.objectContaining({
        to: "person@example.com",
        attachments: [
          expect.objectContaining({
            filename: "invoice.pdf",
            mimeType: "application/pdf",
            content: Buffer.from("pdf-bytes"),
          }),
        ],
      }),
    );
  });

  test("falls back to provider live search when indexed connector docs are empty", async () => {
    const listMessages = jest.fn(async () => ({ messages: [{ id: "mid-1" }] }));
    const getMessage = jest.fn(async () => ({
      payload: {
        headers: [{ name: "Subject", value: "Invoice March" }],
      },
      snippet: "Please review the March invoice.",
    }));

    registerConnector("gmail", {
      capabilities: {
        oauth: true,
        sync: true,
        search: true,
        send: true,
        realtime: false,
      },
      oauthService: {},
      clientService: { listMessages, getMessage },
    });

    mockFindMany.mockResolvedValue([]);

    const tokenVault = {
      ensureConnectedAccess: jest.fn(async () => ({
        connected: true,
        accessToken: "tok-gmail",
        info: { scopes: ["https://www.googleapis.com/auth/gmail.readonly"] },
      })),
    };

    const handler = new ConnectorHandlerService({ tokenVault: tokenVault as any });

    const result = await handler.execute({
      action: "search",
      provider: "gmail",
      context: ctx(),
      query: "invoice",
      limit: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.hits).toHaveLength(1);
    expect(result.hits?.[0]).toEqual(
      expect.objectContaining({
        documentId: "gmail:mid-1",
        title: "Invoice March",
        source: "gmail",
        providerMessageId: "mid-1",
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        source: "provider_live",
        count: 1,
      }),
    );
    expect(listMessages).toHaveBeenCalledTimes(1);
    expect(getMessage).toHaveBeenCalledTimes(1);
  });

  test("rejects oversized attachment payloads before send", async () => {
    const sendMessage = jest.fn(async () => ({ id: "gmail-sent-2" }));
    registerConnector("gmail", {
      capabilities: {
        oauth: true,
        sync: true,
        search: true,
        send: true,
        realtime: false,
      },
      oauthService: {},
      clientService: { sendMessage },
    });

    mockFindMany.mockResolvedValue([
      {
        id: "doc-big",
        filename: "big.bin",
        mimeType: "application/octet-stream",
        fileSize: 50 * 1024 * 1024,
        encryptedFilename: "users/user-1/files/doc-big/big.bin",
      },
    ]);

    const tokenVault = {
      ensureConnectedAccess: jest.fn(async () => ({
        connected: true,
        accessToken: "tok-gmail",
        info: { scopes: ["https://www.googleapis.com/auth/gmail.send"] },
      })),
    };

    const handler = new ConnectorHandlerService({ tokenVault: tokenVault as any });

    const result = await handler.execute({
      action: "send",
      provider: "gmail",
      context: ctx(),
      to: "person@example.com",
      subject: "Hi",
      body: "Body",
      attachmentDocumentIds: ["doc-big"],
    });

    expect(result.ok).toBe(false);
    expect(String(result.error || "").toLowerCase()).toContain("attachment");
    expect(sendMessage).not.toHaveBeenCalled();
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });
});
