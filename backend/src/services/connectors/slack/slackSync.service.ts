import { promises as fs } from "fs";
import path from "path";

import {
  ConnectorsIngestionService,
  type ConnectorDocument,
} from "../connectorsIngestion.service";
import { TokenVaultService } from "../tokenVault.service";
import {
  SlackClientService,
  type SlackChannel,
  type SlackMessage,
} from "./slackClient.service";

export interface SlackSyncInput {
  userId: string;
  correlationId?: string;
  forceResync?: boolean;
  maxItems?: number;
  windowDays?: number;
  channelAllowlist?: string[];
}

export interface SlackSyncResult {
  provider: "slack";
  userId: string;
  fetchedCount: number;
  ingestedCount: number;
  createdCount: number;
  existingCount: number;
  channelsScanned: number;
  cursor: {
    lastSyncAt: string;
    lastMessageTs?: string;
  };
}

interface SlackSyncCursor {
  userId: string;
  lastSyncAt: string;
  lastMessageTs?: string;
  updatedAt: string;
}

const DEFAULT_CURSOR_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "connectors",
  "cursors",
  "slack",
);

function asTs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export class SlackSyncService {
  private readonly tokenVault: TokenVaultService;
  private readonly slackClient: SlackClientService;
  private readonly ingestion: ConnectorsIngestionService;
  private readonly cursorRoot: string;

  constructor(opts?: {
    tokenVault?: TokenVaultService;
    slackClient?: SlackClientService;
    ingestion?: ConnectorsIngestionService;
    cursorRoot?: string;
  }) {
    this.tokenVault = opts?.tokenVault ?? new TokenVaultService();
    this.slackClient = opts?.slackClient ?? new SlackClientService();
    this.ingestion = opts?.ingestion ?? new ConnectorsIngestionService();
    this.cursorRoot = opts?.cursorRoot ?? DEFAULT_CURSOR_ROOT;
  }

  async sync(input: SlackSyncInput): Promise<SlackSyncResult> {
    if (!input.userId || !input.userId.trim()) {
      throw new Error("userId is required for Slack sync.");
    }

    const accessToken = await this.tokenVault.getValidAccessToken(
      input.userId,
      "slack",
    );
    const cursor = await this.readCursor(input.userId);

    const windowDays = input.windowDays ?? 0;
    const oldestTs = this.resolveOldestTs(
      cursor,
      input.forceResync === true,
      windowDays,
    );

    const allowlist = this.resolveAllowlist(input.channelAllowlist);
    const channels = await this.fetchChannels(accessToken, allowlist);

    const collected: Array<{ channel: SlackChannel; message: SlackMessage }> =
      [];

    for (const channel of channels) {
      if (!channel.id) continue;

      try {
        const history = await this.fetchChannelHistory(
          accessToken,
          channel.id,
          oldestTs,
        );
        for (const message of history) {
          if (!message.ts) continue;
          collected.push({ channel, message });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Skip channels that return not_in_channel or similar access errors
        if (msg.includes("not_in_channel") || msg.includes("channel_not_found"))
          continue;
        throw err;
      }
    }

    const sorted = collected.sort(
      (a, b) => asTs(b.message.ts) - asTs(a.message.ts),
    );
    const docs = sorted.map((entry) =>
      this.toConnectorDocument(entry.channel, entry.message),
    );

    const ingested = await this.ingestion.ingestDocuments(
      {
        userId: input.userId,
        correlationId: input.correlationId,
      },
      docs,
    );

    const createdCount = ingested.filter(
      (item) => item.status === "created",
    ).length;
    const existingCount = ingested.filter(
      (item) => item.status === "existing",
    ).length;

    const nextCursor: SlackSyncCursor = {
      userId: input.userId,
      lastSyncAt: new Date().toISOString(),
      lastMessageTs: sorted[0]?.message.ts || cursor?.lastMessageTs,
      updatedAt: new Date().toISOString(),
    };

    await this.writeCursor(input.userId, nextCursor);

    return {
      provider: "slack",
      userId: input.userId,
      fetchedCount: sorted.length,
      ingestedCount: ingested.length,
      createdCount,
      existingCount,
      channelsScanned: channels.length,
      cursor: {
        lastSyncAt: nextCursor.lastSyncAt,
        lastMessageTs: nextCursor.lastMessageTs,
      },
    };
  }

  async runSync(input: SlackSyncInput): Promise<SlackSyncResult> {
    return this.sync(input);
  }

  async syncNow(input: SlackSyncInput): Promise<SlackSyncResult> {
    return this.sync(input);
  }

  private resolveOldestTs(
    cursor: SlackSyncCursor | null,
    forceResync: boolean,
    windowDays: number,
  ): string {
    if (!forceResync && cursor?.lastMessageTs) return cursor.lastMessageTs;
    if (windowDays <= 0) return "0";
    const oldestMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return (oldestMs / 1000).toFixed(6);
  }

  private resolveAllowlist(input?: string[]): Set<string> {
    const env = (process.env.SLACK_SYNC_CHANNELS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const all = [...env, ...(input || [])]
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase());

    return new Set(all);
  }

  private async fetchChannels(
    accessToken: string,
    allowlist: Set<string>,
  ): Promise<SlackChannel[]> {
    const channels: SlackChannel[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.slackClient.listConversations({
        accessToken,
        excludeArchived: true,
        types: ["public_channel", "private_channel", "im", "mpim"],
        limit: 200,
        cursor,
      });

      for (const channel of page.channels) {
        if (!channel.id) continue;
        // Skip channels the bot is not a member of (avoids not_in_channel errors)
        if (channel.is_member === false) continue;

        if (allowlist.size === 0) {
          channels.push(channel);
          continue;
        }

        const matches = [channel.id, channel.name]
          .filter((value): value is string => Boolean(value))
          .some((value) => allowlist.has(value.toLowerCase()));

        if (matches) channels.push(channel);
      }

      cursor = page.nextCursor;
    } while (cursor);

    return channels;
  }

  private async fetchChannelHistory(
    accessToken: string,
    channelId: string,
    oldestTs: string,
  ): Promise<SlackMessage[]> {
    const out: SlackMessage[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.slackClient.getConversationHistory({
        accessToken,
        channelId,
        oldestTs,
        inclusive: false,
        limit: 200,
        cursor,
      });

      for (const message of page.messages) {
        if (!message.ts) continue;
        // Skip message change notifications and join/leave noise.
        if (
          message.subtype &&
          ["message_changed", "channel_join", "channel_leave"].includes(
            message.subtype,
          )
        ) {
          continue;
        }

        out.push(message);
      }

      cursor = page.nextCursor;
    } while (cursor);

    return out;
  }

  private toConnectorDocument(
    channel: SlackChannel,
    message: SlackMessage,
  ): ConnectorDocument {
    const text = this.slackClient.extractMessageText(message);
    const channelLabel = channel.is_im
      ? `DM:${channel.id}`
      : channel.name
        ? `#${channel.name}`
        : channel.id;

    const messageDate = new Date(Math.floor(asTs(message.ts) * 1000));
    const isoDate = Number.isNaN(messageDate.getTime())
      ? new Date()
      : messageDate;

    const author = message.user || message.bot_id || "unknown";
    const title = normalizeText(`${channelLabel} ${isoDate.toISOString()}`);

    return {
      sourceType: "slack",
      sourceId: `${channel.id}:${message.ts}`,
      title: title || channelLabel,
      body: text || "(empty message)",
      timestamp: isoDate,
      actors: [author],
      labelsOrChannel: [channelLabel, "slack"],
      sourceMeta: {
        channelId: channel.id,
        channelName: channel.name || null,
        ts: message.ts,
        threadTs: message.thread_ts || null,
        subtype: message.subtype || null,
      },
    };
  }

  private cursorPath(userId: string): string {
    return path.join(this.cursorRoot, `${userId}.json`);
  }

  private async readCursor(userId: string): Promise<SlackSyncCursor | null> {
    await fs.mkdir(this.cursorRoot, { recursive: true });

    try {
      const raw = await fs.readFile(this.cursorPath(userId), "utf8");
      const parsed = JSON.parse(raw) as SlackSyncCursor;
      if (!parsed || parsed.userId !== userId || !parsed.lastSyncAt)
        return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeCursor(
    userId: string,
    cursor: SlackSyncCursor,
  ): Promise<void> {
    await fs.mkdir(this.cursorRoot, { recursive: true });
    const filePath = this.cursorPath(userId);
    const tempPath = `${filePath}.tmp`;

    await fs.writeFile(tempPath, JSON.stringify(cursor), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tempPath, filePath);
  }
}

export default SlackSyncService;
