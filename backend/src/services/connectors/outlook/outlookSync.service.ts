import { promises as fs } from "fs";
import path from "path";

import GraphClientService, {
  type GraphMessageItem,
} from "./graphClient.service";
import { OutlookOAuthService } from "./outlookOAuth.service";
import { TokenVaultService } from "../tokenVault.service";
import {
  ConnectorsIngestionService,
  type ConnectorDocument,
} from "../connectorsIngestion.service";
import { logger } from "../../../utils/logger";

interface OutlookCursorData {
  lastSyncAt?: string;
  folders?: Record<string, { lastReceivedDateTime?: string }>;
}

interface ConnectorCursorFile {
  version: 1;
  userId: string;
  providers: {
    gmail?: { historyId?: string; lastSyncAt?: string };
    outlook?: OutlookCursorData;
    slack?: { lastSyncAt?: string };
  };
}

export interface OutlookSyncInput {
  userId: string;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
  forceResync?: boolean;
}

export interface OutlookSyncResult {
  provider: "outlook";
  syncedCount: number;
  fetchedCount: number;
  ingestedCount: number;
  failedCount: number;
  createdCount: number;
  existingCount: number;
  skippedCount: number;
  mode: "initial" | "incremental";
  lastSyncAt: string;
  foldersScanned: number;
}

const CURSOR_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "connectors",
  "cursors",
);

function safeDate(input?: string): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class OutlookSyncService {
  private readonly graphClient: GraphClientService;
  private readonly tokenVault: TokenVaultService;
  private readonly outlookOAuth: OutlookOAuthService;
  private readonly ingestion: ConnectorsIngestionService;

  constructor(
    graphClient: GraphClientService = new GraphClientService(),
    tokenVault: TokenVaultService = new TokenVaultService(),
    ingestion: ConnectorsIngestionService = new ConnectorsIngestionService(),
    outlookOAuth?: OutlookOAuthService,
  ) {
    this.graphClient = graphClient;
    this.tokenVault = tokenVault;
    this.ingestion = ingestion;
    this.outlookOAuth = outlookOAuth ?? new OutlookOAuthService({ tokenVault });
  }

  async sync(input: OutlookSyncInput): Promise<OutlookSyncResult> {
    let accessToken = await this.getAccessToken(input.userId);

    const cursorFile = await this.readCursorFile(input.userId);
    const prior: OutlookCursorData = cursorFile.providers.outlook ?? {};

    const mode: "initial" | "incremental" =
      !prior.lastSyncAt || input.forceResync ? "initial" : "incremental";

    // Fetch all mail folders.
    let folders = await this.withTokenRefresh(
      input.userId,
      accessToken,
      (token) => this.graphClient.listMailFolders(token),
      (newToken) => {
        accessToken = newToken;
      },
    );

    // Filter out folders with zero items to avoid wasted requests.
    folders = folders.filter((f) => (f.totalItemCount ?? 1) > 0);

    const folderCursors: Record<string, { lastReceivedDateTime?: string }> = {
      ...(prior.folders ?? {}),
    };
    let totalFetched = 0;
    let totalIngested = 0;
    let totalFailed = 0;
    let totalCreated = 0;
    let totalExisting = 0;

    for (const folder of folders) {
      // For incremental sync, use the per-folder cursor.
      const folderSince =
        mode === "incremental"
          ? folderCursors[folder.id]?.lastReceivedDateTime
          : undefined;

      let messages: GraphMessageItem[];
      try {
        messages = await this.withTokenRefresh(
          input.userId,
          accessToken,
          (token) =>
            this.graphClient.listAllMessages({
              accessToken: token,
              folder: folder.id,
              sinceIso: folderSince,
            }),
          (newToken) => {
            accessToken = newToken;
          },
        );
      } catch (err) {
        // Skip folders that fail (permission denied, token errors, timeouts, etc.).
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[OutlookSync] Skipping folder "${folder.displayName}" (${folder.id}): ${msg}`,
        );
        continue;
      }

      const docs = this.mapMessages(messages, folder.displayName);
      totalFetched += docs.length;
      let ingested: Awaited<
        ReturnType<ConnectorsIngestionService["ingestDocuments"]>
      > = [];
      if (docs.length > 0) {
        ingested = await this.ingestion.ingestDocuments(
          {
            userId: input.userId,
            correlationId: input.correlationId,
            conversationId: input.conversationId,
            clientMessageId: input.clientMessageId,
          },
          docs,
        );
      }

      const successfulItems = ingested.filter((item) => item.status !== "failed");
      const failedCount = ingested.length - successfulItems.length;

      totalIngested += successfulItems.length;
      totalFailed += failedCount;
      totalCreated += ingested.filter(
        (item) => item.status === "created",
      ).length;
      totalExisting += ingested.filter(
        (item) => item.status === "existing",
      ).length;

      // Track per-folder high-water mark.
      const successfulSourceIds = new Set(
        successfulItems.map((item) => item.sourceId),
      );
      const latestReceived = messages
        .filter((m) => successfulSourceIds.has(m.id))
        .map((m) => m.receivedDateTime)
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop();

      if (latestReceived) {
        const existing = folderCursors[folder.id]?.lastReceivedDateTime;
        if (!existing || latestReceived > existing) {
          folderCursors[folder.id] = { lastReceivedDateTime: latestReceived };
        }
      }
    }

    const lastSyncAt = new Date().toISOString();
    cursorFile.providers.outlook = {
      lastSyncAt,
      folders: folderCursors,
    };

    await this.writeCursorFile(input.userId, cursorFile);

    return {
      provider: "outlook",
      syncedCount: totalIngested,
      fetchedCount: totalFetched,
      ingestedCount: totalIngested,
      failedCount: totalFailed,
      createdCount: totalCreated,
      existingCount: totalExisting,
      skippedCount: Math.max(0, totalFetched - totalIngested - totalFailed),
      mode,
      lastSyncAt,
      foldersScanned: folders.length,
    };
  }

  async runSync(input: OutlookSyncInput): Promise<OutlookSyncResult> {
    return this.sync(input);
  }

  private mapMessages(
    messages: GraphMessageItem[],
    folderName: string,
  ): ConnectorDocument[] {
    const docs: ConnectorDocument[] = [];

    for (const m of messages) {
      const text = this.graphClient.getMessageText(m);
      if (!text.trim()) continue;

      const timestamp =
        safeDate(m.receivedDateTime) || safeDate(m.sentDateTime) || new Date();
      const from =
        m.from?.emailAddress?.address || m.from?.emailAddress?.name || "";

      docs.push({
        sourceType: "outlook",
        sourceId: m.id,
        title: (m.subject || "(no subject)").trim(),
        body: text,
        timestamp,
        actors: [from].filter(Boolean),
        labelsOrChannel: m.categories?.length ? m.categories : [folderName],
        sourceMeta: {
          conversationId: m.conversationId,
          internetMessageId: m.internetMessageId,
          webLink: m.webLink,
          receivedDateTime: m.receivedDateTime,
          folder: folderName,
        },
      });
    }

    return docs;
  }

  private async getAccessToken(userId: string): Promise<string> {
    try {
      return await this.tokenVault.getValidAccessToken(userId, "outlook");
    } catch {
      try {
        const refreshed = await this.outlookOAuth.refreshAccessToken(userId);
        return refreshed.accessToken;
      } catch (refreshErr) {
        const msg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        throw new Error(`Outlook token refresh failed: ${msg}`);
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
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("401") ||
        msg.includes("InvalidAuthenticationToken") ||
        msg.includes("expired")
      ) {
        const refreshed = await this.outlookOAuth.refreshAccessToken(userId);
        onRefresh(refreshed.accessToken);
        return fn(refreshed.accessToken);
      }
      throw err;
    }
  }

  private async readCursorFile(userId: string): Promise<ConnectorCursorFile> {
    await fs.mkdir(CURSOR_ROOT, { recursive: true });
    const filePath = path.join(CURSOR_ROOT, `${userId}.json`);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as ConnectorCursorFile;
      if (parsed?.version === 1 && parsed?.userId === userId) return parsed;
      return { version: 1, userId, providers: {} };
    } catch {
      return { version: 1, userId, providers: {} };
    }
  }

  private async writeCursorFile(
    userId: string,
    payload: ConnectorCursorFile,
  ): Promise<void> {
    await fs.mkdir(CURSOR_ROOT, { recursive: true });
    const filePath = path.join(CURSOR_ROOT, `${userId}.json`);
    const tmpPath = `${filePath}.tmp`;

    await fs.writeFile(tmpPath, JSON.stringify(payload), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tmpPath, filePath);
  }
}

export default OutlookSyncService;
