import { GmailClientError, GmailClientService } from "./gmailClient.service";
import { GmailOAuthService } from "./gmailOAuth.service";
import { TokenVaultService } from "../tokenVault.service";
import {
  ConnectorsIngestionService,
  type ConnectorDocument,
} from "../connectorsIngestion.service";
import {
  ConnectorIdentityMapService,
} from "../connectorIdentityMap.service";
import { logger } from "../../../utils/logger";

interface GmailSyncCursor {
  historyId?: string;
  lastSyncAt?: string;
}

interface ConnectorCursorFile {
  version: 1;
  userId: string;
  providers: {
    gmail?: GmailSyncCursor;
    outlook?: { lastSyncAt?: string };
    slack?: { lastSyncAt?: string };
  };
}

export interface GmailSyncInput {
  userId: string;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
  forceResync?: boolean;
}

export interface GmailSyncResult {
  provider: "gmail";
  syncedCount: number;
  fetchedCount: number;
  ingestedCount: number;
  failedCount: number;
  createdCount: number;
  existingCount: number;
  updatedCount: number;
  skippedCount: number;
  historyId?: string;
  mode: "initial" | "incremental";
  lastSyncAt: string;
}

const BATCH_SIZE = 15;

function decodeBase64Url(input?: string): string {
  if (!input) return "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function textFromPayload(payload?: any): string {
  if (!payload) return "";

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data).trim();
    if (decoded) return decoded;
  }

  const parts: any[] = payload.parts || [];
  const preferredMimeOrder = ["text/plain", "text/html"];

  for (const mimeType of preferredMimeOrder) {
    const part = parts.find((p) => p.mimeType === mimeType && p.body?.data);
    if (part?.body?.data) {
      const decoded = decodeBase64Url(part.body.data).trim();
      if (decoded) {
        if (mimeType === "text/html") {
          return decoded
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        return decoded;
      }
    }
  }

  for (const part of parts) {
    const nested = textFromPayload(part);
    if (nested) return nested;
  }

  return "";
}

type HeaderLike = { name?: string | null; value?: string | null };

function headerValue(headers: HeaderLike[] | undefined, name: string): string {
  const needle = name.toLowerCase();
  const hit = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === needle,
  );
  return (hit?.value || "").trim();
}

export class GmailSyncService {
  private readonly gmailClient: GmailClientService;
  private readonly tokenVault: TokenVaultService;
  private readonly gmailOAuth: GmailOAuthService;
  private readonly ingestion: ConnectorsIngestionService;
  private readonly identityMap: ConnectorIdentityMapService;

  constructor(
    gmailClient: GmailClientService = new GmailClientService(),
    tokenVault: TokenVaultService = new TokenVaultService(),
    ingestion: ConnectorsIngestionService = new ConnectorsIngestionService(),
    identityMap: ConnectorIdentityMapService = new ConnectorIdentityMapService(),
    gmailOAuth?: GmailOAuthService,
  ) {
    this.gmailClient = gmailClient;
    this.tokenVault = tokenVault;
    this.ingestion = ingestion;
    this.identityMap = identityMap;
    this.gmailOAuth = gmailOAuth ?? new GmailOAuthService(tokenVault);
  }

  async sync(input: GmailSyncInput): Promise<GmailSyncResult> {
    let accessToken = await this.getAccessToken(input.userId);
    const profile = await this.withTokenRefresh(
      input.userId,
      accessToken,
      (token) => this.gmailClient.getProfile(token),
      (newToken) => {
        accessToken = newToken;
      },
    );

    const cursorFile = await this.readCursorFile(input.userId);
    const prior = cursorFile.providers.gmail ?? {};

    const initialMode = input.forceResync || !prior.historyId;
    const mode: "initial" | "incremental" = initialMode
      ? "initial"
      : "incremental";

    let messageIds: string[] = [];

    if (mode === "incremental" && prior.historyId) {
      try {
        messageIds = await this.incrementalMessageIds(
          accessToken,
          prior.historyId,
          input.userId,
        );
      } catch (error) {
        if (
          error instanceof GmailClientError &&
          error.code === "INVALID_HISTORY_CURSOR"
        ) {
          messageIds = await this.initialMessageIds(accessToken, input.userId);
        } else {
          throw error;
        }
      }
    } else {
      messageIds = await this.initialMessageIds(accessToken, input.userId);
    }

    // Fetch messages in parallel batches with mid-sync token refresh.
    const docs: ConnectorDocument[] = [];
    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const batch = messageIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((messageId) =>
          this.withTokenRefresh(
            input.userId,
            accessToken,
            (token) => this.gmailClient.getMessage(token, messageId),
            (newToken) => {
              accessToken = newToken;
            },
          ),
        ),
      );

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const msg = result.value;
        const headers = msg.payload?.headers;

        const subject = headerValue(headers, "Subject") || "(no subject)";
        const from = headerValue(headers, "From");
        const dateHeader = headerValue(headers, "Date");

        const timestamp = dateHeader
          ? new Date(dateHeader)
          : new Date(msg.internalDate ? Number(msg.internalDate) : Date.now());
        const body = textFromPayload(msg.payload);
        if (!body.trim()) continue;

        docs.push({
          sourceType: "gmail",
          sourceId: msg.id || "",
          title: subject,
          body,
          timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
          actors: [from].filter(Boolean),
          labelsOrChannel: msg.labelIds || ["INBOX"],
          sourceMeta: {
            threadId: msg.threadId,
            historyId: msg.historyId,
            snippet: msg.snippet,
            gmailAddress: profile.emailAddress ?? undefined,
          },
        });
      }
    }

    const ingested = await this.ingestion.ingestDocuments(
      {
        userId: input.userId,
        correlationId: input.correlationId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      },
      docs,
    );
    const failedCount = ingested.filter(
      (item) => item.status === "failed",
    ).length;
    const successfulItems = ingested.filter((item) => item.status !== "failed");
    const createdCount = ingested.filter(
      (item) => item.status === "created",
    ).length;
    const existingCount = ingested.filter(
      (item) => item.status === "existing",
    ).length;
    const updatedCount = ingested.filter(
      (item) => item.status === "updated",
    ).length;
    const fetchedCount = docs.length;
    const ingestedCount = successfulItems.length;
    const skippedCount = Math.max(
      0,
      fetchedCount - ingestedCount - failedCount,
    );
    const shouldAdvanceHistoryCursor = failedCount === 0;

    if (!shouldAdvanceHistoryCursor && failedCount > 0) {
      logger.warn(
        `[GmailSync] Keeping prior history cursor due to ${failedCount} ingestion failures`,
      );
    }

    cursorFile.providers.gmail = {
      historyId: shouldAdvanceHistoryCursor
        ? (profile.historyId as string | undefined) || prior.historyId
        : prior.historyId,
      lastSyncAt: new Date().toISOString(),
    };

    await this.writeCursorFile(input.userId, cursorFile);

    return {
      provider: "gmail",
      syncedCount: ingestedCount,
      fetchedCount,
      ingestedCount,
      failedCount,
      createdCount,
      existingCount,
      updatedCount,
      skippedCount,
      historyId: cursorFile.providers.gmail.historyId,
      mode,
      lastSyncAt:
        cursorFile.providers.gmail.lastSyncAt || new Date().toISOString(),
    };
  }

  async runSync(input: GmailSyncInput): Promise<GmailSyncResult> {
    return this.sync(input);
  }

  private async initialMessageIds(
    accessToken: string,
    userId: string,
  ): Promise<string[]> {
    const allIds: string[] = [];
    let pageToken: string | undefined;
    let currentToken = accessToken;

    do {
      const response = await this.withTokenRefresh(
        userId,
        currentToken,
        (token) =>
          this.gmailClient.listMessages(token, {
            maxResults: 200,
            pageToken,
            includeSpamTrash: false,
          }),
        (newToken) => {
          currentToken = newToken;
        },
      );

      allIds.push(
        ...(response.messages || []).map((m) => m.id || "").filter(Boolean),
      );
      pageToken = response.nextPageToken || undefined;
    } while (pageToken);

    return allIds;
  }

  private async incrementalMessageIds(
    accessToken: string,
    startHistoryId: string,
    userId: string,
  ): Promise<string[]> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let currentToken = accessToken;

    do {
      const historyResp = await this.withTokenRefresh(
        userId,
        currentToken,
        (token) =>
          this.gmailClient.listHistory(token, {
            startHistoryId,
            historyTypes: ["messageAdded"],
            maxResults: 200,
            pageToken,
          }),
        (newToken) => {
          currentToken = newToken;
        },
      );

      for (const entry of historyResp.history || []) {
        for (const added of entry.messagesAdded || []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }

      pageToken = historyResp.nextPageToken || undefined;
    } while (pageToken);

    return [...ids];
  }

  private async getAccessToken(userId: string): Promise<string> {
    try {
      return await this.tokenVault.getValidAccessToken(userId, "gmail");
    } catch {
      try {
        const refreshed = await this.gmailOAuth.refreshAccessToken(userId);
        return refreshed.accessToken;
      } catch (refreshErr) {
        const msg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        throw new Error(`Gmail token refresh failed: ${msg}`);
      }
    }
  }

  private async withTokenRefresh<T>(
    userId: string,
    currentToken: string,
    fn: (token: string) => Promise<T>,
    onRefresh: (newToken: string) => void,
  ): Promise<T> {
    try {
      return await fn(currentToken);
    } catch (err) {
      const isAuthError =
        (err instanceof GmailClientError &&
          (err.code === "AUTH_ERROR" || err.status === 401)) ||
        (err instanceof Error &&
          (err.message.includes("401") ||
            err.message.includes("invalid_grant")));

      if (isAuthError) {
        const refreshed = await this.gmailOAuth.refreshAccessToken(userId);
        onRefresh(refreshed.accessToken);
        return fn(refreshed.accessToken);
      }
      throw err;
    }
  }

  private async readCursorFile(userId: string): Promise<ConnectorCursorFile> {
    try {
      const raw = await this.identityMap.getSyncCursor(userId, "gmail");
      if (!raw) return { version: 1, userId, providers: {} };
      const parsed = JSON.parse(raw) as
        | ConnectorCursorFile
        | GmailSyncCursor
        | null;
      if (parsed && typeof parsed === "object") {
        const providerCursor = (parsed as ConnectorCursorFile)?.providers?.gmail;
        if (providerCursor) {
          return {
            version: 1,
            userId,
            providers: { gmail: providerCursor },
          };
        }

        const rawHistoryId = (parsed as GmailSyncCursor).historyId;
        const rawLastSyncAt = (parsed as GmailSyncCursor).lastSyncAt;
        if (rawHistoryId || rawLastSyncAt) {
          return {
            version: 1,
            userId,
            providers: {
              gmail: {
                historyId: rawHistoryId,
                lastSyncAt: rawLastSyncAt,
              },
            },
          };
        }
      }
      return { version: 1, userId, providers: {} };
    } catch {
      return { version: 1, userId, providers: {} };
    }
  }

  private async writeCursorFile(
    userId: string,
    payload: ConnectorCursorFile,
  ): Promise<void> {
    const gmail = payload.providers.gmail ?? {};
    const cursor: GmailSyncCursor = {
      historyId: gmail.historyId,
      lastSyncAt: gmail.lastSyncAt,
    };
    await this.identityMap.updateSyncCursor(userId, "gmail", JSON.stringify(cursor));
  }
}

export default GmailSyncService;
