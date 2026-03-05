import {
  ConnectorsIngestionService,
  type ConnectorDocument,
} from "../connectorsIngestion.service";
import {
  ConnectorIdentityMapService,
} from "../connectorIdentityMap.service";
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
  failedCount: number;
  createdCount: number;
  existingCount: number;
  updatedCount: number;
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
  private readonly identityMap: ConnectorIdentityMapService;

  constructor(opts?: {
    tokenVault?: TokenVaultService;
    slackClient?: SlackClientService;
    ingestion?: ConnectorsIngestionService;
    identityMap?: ConnectorIdentityMapService;
  }) {
    this.tokenVault = opts?.tokenVault ?? new TokenVaultService();
    this.slackClient = opts?.slackClient ?? new SlackClientService();
    this.ingestion = opts?.ingestion ?? new ConnectorsIngestionService();
    this.identityMap = opts?.identityMap ?? new ConnectorIdentityMapService();
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
    const successfulItems = ingested.filter((item) => item.status !== "failed");
    const failedCount = ingested.length - successfulItems.length;

    const createdCount = ingested.filter(
      (item) => item.status === "created",
    ).length;
    const existingCount = ingested.filter(
      (item) => item.status === "existing",
    ).length;
    const updatedCount = ingested.filter(
      (item) => item.status === "updated",
    ).length;
    const successfulSourceIds = new Set(
      successfulItems.map((item) => item.sourceId),
    );
    const latestSuccessful = sorted.find((entry) =>
      successfulSourceIds.has(`${entry.channel.id}:${entry.message.ts}`),
    );

    const nextCursor: SlackSyncCursor = {
      userId: input.userId,
      lastSyncAt: new Date().toISOString(),
      lastMessageTs: latestSuccessful?.message.ts || cursor?.lastMessageTs,
      updatedAt: new Date().toISOString(),
    };

    await this.writeCursor(input.userId, nextCursor);

    return {
      provider: "slack",
      userId: input.userId,
      fetchedCount: sorted.length,
      ingestedCount: successfulItems.length,
      failedCount,
      createdCount,
      existingCount,
      updatedCount,
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

  private async readCursor(userId: string): Promise<SlackSyncCursor | null> {
    try {
      const raw = await this.identityMap.getSyncCursor(userId, "slack");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as
        | SlackSyncCursor
        | { providers?: { slack?: Partial<SlackSyncCursor> } }
        | null;
      if (!parsed || typeof parsed !== "object") return null;

      const direct = parsed as SlackSyncCursor;
      if (direct.userId === userId && direct.lastSyncAt) return direct;

      const providerCursor = (parsed as any)?.providers?.slack;
      if (providerCursor?.lastSyncAt) {
        return {
          userId,
          lastSyncAt: String(providerCursor.lastSyncAt),
          lastMessageTs:
            typeof providerCursor.lastMessageTs === "string"
              ? providerCursor.lastMessageTs
              : undefined,
          updatedAt:
            typeof providerCursor.updatedAt === "string"
              ? providerCursor.updatedAt
              : String(providerCursor.lastSyncAt),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async writeCursor(
    userId: string,
    cursor: SlackSyncCursor,
  ): Promise<void> {
    await this.identityMap.updateSyncCursor(
      userId,
      "slack",
      JSON.stringify(cursor),
    );
  }
}

export default SlackSyncService;
